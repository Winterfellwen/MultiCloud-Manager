package api

import (
	"bufio"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"strings"
	"time"

	"multicloud/internal/agent"

	"github.com/gin-gonic/gin"
)

type ChatRequest struct {
	Message       string      `json:"message"`
	SessionID     string      `json:"session_id"`
	Mode          string      `json:"mode"`
	ConfirmAction string      `json:"confirm_action"`
	ToolName      string      `json:"tool_name"`
	ToolParams    interface{} `json:"tool_params"`
}

const (
	maxLLMIterations = 100
	defaultMaxTokens  = 8192
)

type ChatStreamHandler struct {
	db       *sql.DB
	executor *agent.Executor
	runtime  *agent.Runtime
	rm       *RunManager
}

func NewChatStreamHandler(db *sql.DB, executor *agent.Executor, runtime *agent.Runtime, rm *RunManager) *ChatStreamHandler {
	h := &ChatStreamHandler{db: db, executor: executor, runtime: runtime, rm: rm}
	rm.SetExecutor(h.runLLM)
	return h
}

func (h *ChatStreamHandler) setRunState(r *Run, s State, errMsg string) {
	r.mu.Lock()
	r.State = s
	if errMsg != "" {
		r.ErrorMessage = errMsg
	}
	r.mu.Unlock()
	if h.db != nil {
		if _, err := h.db.Exec(`UPDATE runs SET state=$1, error_message=$2, started_at=CASE WHEN $3 AND started_at IS NULL THEN CURRENT_TIMESTAMP ELSE started_at END, terminal_at=CASE WHEN $4 THEN CURRENT_TIMESTAMP ELSE terminal_at END WHERE id=$5`, string(s), errMsg, s == StateRunning, s == StateDone || s == StateError || s == StateStopped, r.ID); err != nil {
			log.Printf("WARNING: failed to update run state: %v", err)
		}
	}
	h.rm.persistEvent(r, EventStateChange, map[string]interface{}{
		"state": string(s), "error_message": errMsg,
	})
}

func (h *ChatStreamHandler) terminateRun(r *Run, errMsg string) {
	// Check if the stop handler already set a terminal state (e.g. StateStopped).
	r.mu.Lock()
	isTerminal := r.State == StateStopped
	r.mu.Unlock()

	if !isTerminal {
		// Normal completion: set done or error state.
		final := StateDone
		if errMsg != "" {
			final = StateError
		}
		h.setRunState(r, final, errMsg)
	}

	// Always aggregate and save history (done, error, or stopped).
	h.rm.AggregateOnDone(r)
}

// runLLM is the per-Run goroutine that drives the LLM conversation loop.
// It replaces the old Stream method, persisting events via RunManager instead
// of writing SSE directly.
func (h *ChatStreamHandler) runLLM(r *Run) {
	h.setRunState(r, StateRunning, "")

	cfg := GetAIConfigValue()
	if cfg.APIEndpoint == "" || cfg.APIKey == "" || cfg.Model == "" {
		h.terminateRun(r, "AI config not configured")
		return
	}

	systemPrompt := h.runtime.GetSystemPrompt(r.Mode, r.UserMessage)
	messages := []map[string]interface{}{
		{"role": "system", "content": systemPrompt},
	}
	if history := h.loadSessionHistory(r.SessionID); len(history) > 0 {
		messages = append(messages, history...)
	}
	messages = append(messages, map[string]interface{}{"role": "user", "content": r.UserMessage})

	if r.SessionID != "" && h.db != nil {
		var sid string
		if h.db.QueryRow(`SELECT id FROM sessions WHERE session_id = $1`, r.SessionID).Scan(&sid) == nil {
			if _, err := h.db.Exec(`UPDATE sessions SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, sid); err != nil {
				log.Printf("WARNING: failed to update session status to running: %v", err)
			}
		}
	}

	maxIterations := maxLLMIterations
	var lastTurnContent string

	httpClient := &http.Client{Timeout: 120 * time.Second}

	var stopReason string
	var iterCount int
	var lastToolCalls []map[string]interface{}

	var toolCallIdx int
	var toolCallHistory []string

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	r.mu.Lock()
	r.cancelFn = cancel
	r.mu.Unlock()

	for i := 0; i < maxIterations; i++ {
		select {
		case <-ctx.Done():
			stopReason = "client disconnected"
			goto done
		default:
		}

		iterCount = i + 1
		toolDefs := h.runtime.GetToolDefinitions()
		if r.UserRole == "viewer" {
			toolDefs = filterReadOnlyTools(toolDefs)
		}
		body := map[string]interface{}{
			"model":      cfg.Model,
			"messages":   messages,
			"stream":     true,
			"tools":      toolDefs,
			"max_tokens": defaultMaxTokens,
		}

		if cfg.EnableReasoning {
			body["reasoning_effort"] = cfg.ReasoningEffort
		}

		baseURL := strings.TrimSuffix(strings.TrimRight(cfg.APIEndpoint, "/"), "/chat/completions")
		apiURL := baseURL + "/chat/completions"
		bodyBytes, err := json.Marshal(body)
		if err != nil {
			stopReason = "failed to marshal request body: " + err.Error()
			break
		}
		httpReq, err := http.NewRequest("POST", apiURL, bytes.NewReader(bodyBytes))
		if err != nil {
			stopReason = "failed to create request: " + err.Error()
			break
		}

		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("Authorization", "Bearer "+cfg.APIKey)
		httpReq.GetBody = func() (io.ReadCloser, error) {
			return io.NopCloser(bytes.NewReader(bodyBytes)), nil
		}

		resp, err := h.doWithRetry(ctx, r, httpClient, httpReq)
		if err != nil {
			stopReason = "connection failed after retries: " + err.Error()
			break
		}

		if resp.StatusCode != 200 {
			respBody, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			log.Printf("Chat stream request failed (HTTP %d, iter %d): %s", resp.StatusCode, iterCount, strings.TrimSpace(string(respBody)))
			stopReason = fmt.Sprintf("API error (HTTP %d)", resp.StatusCode)
			var apiErr struct {
				Error struct {
					Message string `json:"message"`
					Code    string `json:"code"`
				} `json:"error"`
			}
			if json.Unmarshal(respBody, &apiErr) == nil && apiErr.Error.Message != "" {
				stopReason = fmt.Sprintf("API error: %s (%s)", apiErr.Error.Message, apiErr.Error.Code)
			}
			break
		}

		fullContent, toolCalls, _ := h.collectStreamResponseWithCallback(resp.Body, nil, nil, func(chunk string) {
			h.rm.persistEvent(r, EventToken, map[string]interface{}{
				"content": chunk,
			})
		})
		lastTurnContent = fullContent
		lastToolCalls = toolCalls

		if len(toolCalls) == 0 {
			break
		}

		h.rm.persistEvent(r, EventToolStart, map[string]interface{}{
			"tool_calls": toolCalls,
		})

		assistantMsg := map[string]interface{}{
			"role":       "assistant",
			"content":    fullContent,
			"tool_calls": toolCalls,
		}
		messages = append(messages, assistantMsg)

		for _, tc := range toolCalls {
			select {
			case <-ctx.Done():
				stopReason = "client disconnected"
				goto done
			default:
			}

			toolName, _ := tc["function"].(map[string]interface{})["name"].(string)
			toolArgsStr, _ := tc["function"].(map[string]interface{})["arguments"].(string)
			toolID, _ := tc["id"].(string)

			toolCallIdx++
			toolCallHistory = append(toolCallHistory, toolName)
			if len(toolCallHistory) > 20 {
				toolCallHistory = toolCallHistory[len(toolCallHistory)-20:]
			}
			if len(toolCallHistory) >= 10 {
				last10 := toolCallHistory[len(toolCallHistory)-10:]
				count := 0
				for _, t := range last10 {
					if t == toolName {
						count++
					}
				}
				if count >= 7 {
					messages = append(messages, map[string]interface{}{
						"role": "system",
						"content": fmt.Sprintf("Note: You have called %s %d times in the last 10 tool calls. This might indicate you're stuck in a loop. Consider whether:\n(1) The previous attempts failed — try a different approach\n(2) The task is complete — summarize and stop\n(3) You need more information — ask the user\nYou are free to continue if you have a clear next step, but be aware of the pattern.", toolName, count),
					})
					toolCallHistory = nil
				}
			}

			if r.Mode == "plan" && (toolName == "shell_exec" || toolName == "run_script") {
				var targs map[string]interface{}
				json.Unmarshal([]byte(toolArgsStr), &targs)
				cmd := ""
				if toolName == "shell_exec" {
					cmd, _ = targs["command"].(string)
				} else {
					cmd, _ = targs["script"].(string)
				}
				if isDestructiveCommand(cmd) {
					h.rm.persistEvent(r, EventToolResult, map[string]interface{}{
						"tool_name": toolName,
						"result":    "",
						"error":     "BLOCKED: Shell execution is disabled in Plan mode. Use Build mode to execute commands.",
					})
					messages = append(messages, map[string]interface{}{
						"role":         "tool",
						"tool_call_id": toolID,
						"content":      "BLOCKED: Shell execution is disabled in Plan mode. Switch to Build mode to execute commands. You can only run read-only diagnostic commands like 'pwd', 'ls', 'cat', 'echo', 'which'.",
					})
					continue
				}
			}

				// Viewers are blocked from executing non-read-only tools
			if r.UserRole == "viewer" && !agent.ReadOnlyTools[toolName] {
				h.rm.persistEvent(r, EventToolResult, map[string]interface{}{
					"tool_name": toolName,
					"result":    "",
					"error":     "BLOCKED: This tool requires higher permissions than viewer.",
				})
				messages = append(messages, map[string]interface{}{
					"role":         "tool",
					"tool_call_id": toolID,
					"content":      "BLOCKED: You do not have permission to use this tool. As a read-only user, you can only use read-only tools like list_cloud_resources, get_cloud_stats, list_cloud_accounts, and get_cloud_credentials.",
				})
				continue
			}

		var toolArgs map[string]interface{}
			if err := json.Unmarshal([]byte(toolArgsStr), &toolArgs); err != nil {
				toolArgs = map[string]interface{}{}
			}

			// For shell tools, inject an onOutput callback that streams
			// tool_output events to the frontend in real-time.
			if toolName == "shell_exec" || toolName == "run_script" {
				outputCtx := agent.WithOutputCallback(ctx, func(chunk string) {
					h.rm.persistEvent(r, EventToolOutput, map[string]interface{}{
						"tool_name": toolName,
						"output":    chunk,
					})
				})
				ctx = outputCtx
			}

			result, execErr := h.runtime.ExecuteTool(ctx, toolName, toolArgs)

			h.rm.persistEvent(r, EventToolResult, map[string]interface{}{
				"tool_name": toolName,
				"result":    result,
				"error":     errToString(execErr),
			})

			toolResultContent := result
			if execErr != nil {
				toolResultContent = fmt.Sprintf("Error: %s", execErr.Error())
			}
			truncationLimit := 2000
			if toolName == "lookup_cloud_api_doc" {
				truncationLimit = 16000
			}
			if len(toolResultContent) > truncationLimit {
				toolResultContent = toolResultContent[:truncationLimit] + "...[truncated]"
			}
			messages = append(messages, map[string]interface{}{
				"role":         "tool",
				"tool_call_id": toolID,
				"content":      toolResultContent,
			})
		}

		messages = compactMessages(messages)

		var summarized bool
		messages, summarized = h.maybeSummarize(ctx, messages)
		if summarized {
			h.rm.persistEvent(r, EventToken, map[string]interface{}{
				"content": "\n\n---\n> 🔄 对话已自动摘要压缩以节省上下文\n---\n\n",
			})
		}
	}

done:
	if stopReason != "" {
		toolCallIDs := make(map[string]bool)
		toolResultIDs := make(map[string]bool)
		for _, m := range messages {
			if tc, ok := m["tool_calls"].([]interface{}); ok {
				for _, t := range tc {
					if tMap, ok := t.(map[string]interface{}); ok {
						if id, ok := tMap["id"].(string); ok {
							toolCallIDs[id] = true
						}
					}
				}
			}
			if role, _ := m["role"].(string); role == "tool" {
				if id, ok := m["tool_call_id"].(string); ok {
					toolResultIDs[id] = true
				}
			}
		}
		for id := range toolCallIDs {
			if !toolResultIDs[id] {
				messages = append(messages, map[string]interface{}{
					"role":         "tool",
					"tool_call_id": id,
					"content":      fmt.Sprintf("Error: tool call was interrupted (%s). You may retry if needed.", stopReason),
				})
			}
		}

		summary := fmt.Sprintf("\n\n---\n> ⚠️ AI 在第 %d 步中断：%s\n> 请重新发送消息继续操作。\n", iterCount, stopReason)
		lastTurnContent = summary
		for _, part := range chunkRunes(summary, 10) {
			h.rm.persistEvent(r, EventToken, map[string]interface{}{
				"content": part,
			})
		}
	} else if iterCount >= maxIterations && len(lastToolCalls) > 0 {
		messages = append(messages, map[string]interface{}{
			"role":    "system",
			"content": fmt.Sprintf("Maximum conversation turns reached (%d). Please wrap up: summarize what has been accomplished, explain what remains to be done, and ask the user how they want to proceed.", maxIterations),
		})
		finalBody := map[string]interface{}{
			"model":      cfg.Model,
			"messages":   messages,
			"stream":     true,
			"max_tokens": 1024,
		}
		finalBodyBytes, _ := json.Marshal(finalBody)
		finalURL := strings.TrimSuffix(strings.TrimRight(cfg.APIEndpoint, "/"), "/chat/completions") + "/chat/completions"
		finalReq, err := http.NewRequest("POST", finalURL, bytes.NewReader(finalBodyBytes))
		if err == nil {
			finalReq.Header.Set("Content-Type", "application/json")
			finalReq.Header.Set("Authorization", "Bearer "+cfg.APIKey)
			finalResp, ferr := httpClient.Do(finalReq)
			if ferr == nil && finalResp.StatusCode == 200 {
				finalContent, _, _ := h.collectStreamResponse(finalResp.Body, nil, nil)
				lastTurnContent = finalContent
				if finalContent != "" {
					h.rm.persistEvent(r, EventToken, map[string]interface{}{
						"content": finalContent,
					})
				}
			}
		}
	}

	if lastTurnContent != "" {
		messages = append(messages, map[string]interface{}{
			"role":    "assistant",
			"content": lastTurnContent,
		})
	}

	// AggregateOnDone (called via terminateRun) handles saving history and cleaning events.
	// No need to call saveSessionMessages here — it uses the old session_id format.

	if r.SessionID != "" && h.db != nil {
		var sid string
		if h.db.QueryRow(`SELECT id FROM sessions WHERE session_id = $1`, r.SessionID).Scan(&sid) == nil {
			if _, err := h.db.Exec(`UPDATE sessions SET status = 'idle', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, sid); err != nil {
				log.Printf("WARNING: failed to update session status to idle: %v", err)
			}
		}
	}

	h.terminateRun(r, "")
}

const (
	maxRetryDuration    = 15 * time.Minute
	maxRetryAttempts    = 20
	baseRetryDelay      = 2 * time.Second
	maxRetryDelay       = 60 * time.Second
)

func isRetryableStatus(code int) bool {
	return code == 408 || code == 429 || code == 500 || code == 502 || code == 503 || code == 504
}

func (h *ChatStreamHandler) doWithRetry(ctx context.Context, r *Run, client *http.Client, req *http.Request) (*http.Response, error) {
	var resp *http.Response
	var lastErr error
	retry := 0
	startTime := time.Now()

	for {
		if req.GetBody != nil {
			body, err := req.GetBody()
			if err != nil {
				return nil, err
			}
			req.Body = body
		}
		resp, lastErr = client.Do(req)
		if lastErr != nil {
			// Network error - always retry
			if time.Since(startTime) >= maxRetryDuration || retry >= maxRetryAttempts {
				return nil, lastErr
			}
			delay := calculateRetryDelay(retry)
			h.rm.persistEvent(r, EventRetry, map[string]interface{}{
				"attempt":     retry + 1,
				"maxAttempts": maxRetryAttempts,
				"delaySec":    int(delay.Seconds()),
				"reason":      "network error: " + lastErr.Error(),
				"elapsedSec":  int(time.Since(startTime).Seconds()),
			})
			log.Printf("Network error (attempt %d/%d), retrying in %v: %v", retry+1, maxRetryAttempts, delay, lastErr)
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(delay):
			}
			retry++
			continue
		}

		if resp.StatusCode == 200 {
			return resp, nil
		}

		respBody, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		if isRetryableStatus(resp.StatusCode) {
			if time.Since(startTime) >= maxRetryDuration || retry >= maxRetryAttempts {
				return resp, fmt.Errorf("API error after retries (HTTP %d): %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
			}
			delay := calculateRetryDelay(retry)
			h.rm.persistEvent(r, EventRetry, map[string]interface{}{
				"attempt":     retry + 1,
				"maxAttempts": maxRetryAttempts,
				"delaySec":    int(delay.Seconds()),
				"reason":      fmt.Sprintf("HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(respBody))),
				"elapsedSec":  int(time.Since(startTime).Seconds()),
			})
			log.Printf("API request failed (HTTP %d, attempt %d/%d), retrying in %v: %s", resp.StatusCode, retry+1, maxRetryAttempts, delay, strings.TrimSpace(string(respBody)))
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(delay):
			}
			retry++
			continue
		}

		// Non-retryable error (401, 403, 404, etc.)
		return resp, fmt.Errorf("API error (HTTP %d): %s", resp.StatusCode, strings.TrimSpace(string(respBody)))
	}
}

func calculateRetryDelay(attempt int) time.Duration {
	delay := baseRetryDelay * time.Duration(1<<uint(attempt))
	if delay > maxRetryDelay {
		delay = maxRetryDelay
	}
	// Add jitter (±25%)
	jitter := float64(delay) * 0.25 * (2*rand.Float64() - 1)
	return time.Duration(float64(delay) + jitter)
}

func (h *ChatStreamHandler) collectStreamResponse(body io.ReadCloser, c *gin.Context, flusher http.Flusher) (string, []map[string]interface{}, string) {
	return h.collectStreamResponseWithCallback(body, c, flusher, nil)
}

func (h *ChatStreamHandler) collectStreamResponseWithCallback(body io.ReadCloser, c *gin.Context, flusher http.Flusher, onToken func(string)) (string, []map[string]interface{}, string) {
	defer body.Close()

	var fullContent strings.Builder
	var toolCalls []map[string]interface{}
	var finishReason string
	toolCallsMap := map[int]map[string]interface{}{}

	reader := bufio.NewReader(body)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				break
			}
			break
		}

		line = strings.TrimSpace(line)
		if line == "" || !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}

		var chunk struct {
			Choices []struct {
				Delta struct {
					Content   string                   `json:"content"`
					ToolCalls []map[string]interface{} `json:"tool_calls"`
				} `json:"delta"`
				FinishReason *string `json:"finish_reason"`
			} `json:"choices"`
		}

		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}

		for _, choice := range chunk.Choices {
			if choice.Delta.Content != "" {
				fullContent.WriteString(choice.Delta.Content)
				if c != nil && flusher != nil {
					select {
					case <-c.Request.Context().Done():
						return fullContent.String(), toolCalls, finishReason
					default:
					}
					fmt.Fprintf(c.Writer, "event: token\ndata: %s\n\n", toJSON(map[string]string{"content": choice.Delta.Content}))
					flusher.Flush()
				} else if onToken != nil {
					onToken(choice.Delta.Content)
				}
			}

			for _, tc := range choice.Delta.ToolCalls {
				idx := 0
				if v, ok := tc["index"].(float64); ok {
					idx = int(v)
				}

				if existing, ok := toolCallsMap[idx]; ok {
					if fn, ok := tc["function"].(map[string]interface{}); ok {
						if existingFn, ok := existing["function"].(map[string]interface{}); ok {
							if name, ok := fn["name"].(string); ok && name != "" {
								existingFn["name"] = name
							}
							if args, ok := fn["arguments"].(string); ok {
								if prevArgs, ok := existingFn["arguments"].(string); ok {
									existingFn["arguments"] = prevArgs + args
								} else {
									existingFn["arguments"] = args
								}
							}
						}
					}
					if id, ok := tc["id"].(string); ok && id != "" {
						existing["id"] = id
					}
				} else {
					fn := tc["function"]
					if fn == nil {
						fn = map[string]interface{}{"name": "", "arguments": "{}"}
					}
					fnMap, _ := fn.(map[string]interface{})
					if fnMap == nil {
						fnMap = map[string]interface{}{"name": "", "arguments": "{}"}
					}
					if _, ok := fnMap["arguments"].(string); !ok {
						fnMap["arguments"] = "{}"
					}
					toolCallsMap[idx] = map[string]interface{}{
						"id":       tc["id"],
						"type":     "function",
						"function": fnMap,
					}
				}
			}

			if choice.FinishReason != nil {
				finishReason = *choice.FinishReason
			}
		}
	}

	if len(toolCallsMap) > 0 {
		for i := 0; i < len(toolCallsMap); i++ {
			if tc, ok := toolCallsMap[i]; ok {
				fn, fnOk := tc["function"].(map[string]interface{})
				if !fnOk || fn == nil {
					continue
				}
				name, _ := fn["name"].(string)
				if name == "" {
					continue
				}
				if argsStr, ok := fn["arguments"].(string); ok {
					if !json.Valid([]byte(argsStr)) {
						fn["arguments"] = "{}"
					}
				} else {
					fn["arguments"] = "{}"
				}
				toolCalls = append(toolCalls, tc)
			}
		}
	}

	return fullContent.String(), toolCalls, finishReason
}

func (h *ChatStreamHandler) saveSessionMessages(sessionID string, messages []map[string]interface{}) {
	if sessionID == "" || h.db == nil {
		return
	}
	var internalID string
	err := h.db.QueryRow(`SELECT id FROM sessions WHERE session_id = $1`, sessionID).Scan(&internalID)
	if err != nil {
		return
	}

	toolResults := make(map[string]string)
	for _, m := range messages {
		if role, _ := m["role"].(string); role == "tool" {
			if id, ok := m["tool_call_id"].(string); ok {
				content, _ := m["content"].(string)
				if len(content) > 500 {
					content = content[:500] + "... [truncated]"
				}
				toolResults[id] = content
			}
		}
	}

	var saveMsgs []map[string]interface{}
	for _, m := range messages {
		role, _ := m["role"].(string)
		if role == "system" {
			continue
		}
		content, _ := m["content"].(string)
		ts := time.Now().UTC().Format(time.RFC3339)

		if role == "assistant" {
			var toolCallsAsMaps []map[string]interface{}
			switch tc := m["tool_calls"].(type) {
			case []interface{}:
				for _, item := range tc {
					if m, ok := item.(map[string]interface{}); ok {
						toolCallsAsMaps = append(toolCallsAsMaps, m)
					}
				}
			case []map[string]interface{}:
				toolCallsAsMaps = tc
			}
			if content != "" {
				saveMsgs = append(saveMsgs, map[string]interface{}{
					"role": "agent", "content": content, "created_at": ts,
				})
			}
			if len(toolCallsAsMaps) > 0 {
				var callInfos []map[string]interface{}
				for _, tcMap := range toolCallsAsMaps {
					fn, _ := tcMap["function"].(map[string]interface{})
					name, _ := fn["name"].(string)
					args, _ := fn["arguments"].(string)
					id, _ := tcMap["id"].(string)
					result := toolResults[id]
					callInfos = append(callInfos, map[string]interface{}{
						"name":   name,
						"params": args,
						"result": result,
					})
				}
				if len(callInfos) > 0 {
					jsonBytes, _ := json.Marshal(callInfos)
					saveMsgs = append(saveMsgs, map[string]interface{}{
						"role": "tool-calls", "content": string(jsonBytes), "created_at": ts,
					})
				}
			}
			continue
		}
		if role == "user" {
			saveMsgs = append(saveMsgs, map[string]interface{}{
				"role": "user", "content": content, "created_at": ts,
			})
		}
	}

	if len(saveMsgs) == 0 {
		return
	}

	historyJSON, err := json.Marshal(saveMsgs)
	if err != nil {
		return
	}

	if _, err := h.db.Exec(`DELETE FROM messages WHERE session_id = $1`, internalID); err != nil {
		log.Printf("WARNING: failed to delete messages: %v", err)
	}
	if _, err := h.db.Exec(`INSERT INTO messages (session_id, role, content) VALUES ($1, 'history', $2)`, internalID, string(historyJSON)); err != nil {
		log.Printf("WARNING: failed to insert history: %v", err)
	}

	for _, m := range saveMsgs {
		if m["role"] == "user" {
			if title, ok := m["content"].(string); ok && title != "" {
				if _, err := h.db.Exec(`UPDATE sessions SET title = LEFT($1, 100), updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND title = '新对话'`, title, internalID); err != nil {
				log.Printf("WARNING: failed to update session title: %v", err)
			}
			}
			break
		}
	}
}

func (h *ChatStreamHandler) loadSessionHistory(sessionID string) []map[string]interface{} {
	if sessionID == "" || h.db == nil {
		return nil
	}
	var internalID string
	err := h.db.QueryRow(`SELECT id FROM sessions WHERE session_id = $1`, sessionID).Scan(&internalID)
	if err != nil {
		return nil
	}

	var historyJSON string
	err = h.db.QueryRow(`SELECT content FROM messages WHERE session_id = $1 AND role = 'history' ORDER BY created_at DESC LIMIT 1`, internalID).Scan(&historyJSON)
	if err == nil && historyJSON != "" {
		var history []map[string]interface{}
		if json.Unmarshal([]byte(historyJSON), &history) == nil {
			return convertHistoryForLLM(history)
		}
	}

	rows, err := h.db.Query(`SELECT role, content FROM messages WHERE session_id = $1 AND role != 'history' ORDER BY created_at`, internalID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var history []map[string]interface{}
	for rows.Next() {
		var role, content string
		if err := rows.Scan(&role, &content); err != nil {
			continue
		}
		history = append(history, map[string]interface{}{
			"role":    role,
			"content": content,
		})
	}
	return convertHistoryForLLM(history)
}

func convertHistoryForLLM(history []map[string]interface{}) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(history))
	for i := 0; i < len(history); i++ {
		m := history[i]
		role, _ := m["role"].(string)
		content, _ := m["content"].(string)

		switch role {
		case "system", "user":
			out = append(out, map[string]interface{}{"role": role, "content": content})
		case "agent":
			out = append(out, map[string]interface{}{"role": "assistant", "content": content})
		case "tool-calls":
			// Convert to OpenAI format: assistant with tool_calls + tool results
			pair := convertToolCallsRow(content)
			if pair == nil || len(pair.calls) == 0 {
				continue
			}
			// Assistant message with tool_calls array
			out = append(out, map[string]interface{}{
				"role":       "assistant",
				"content":    "",
				"tool_calls": pair.calls,
			})
			// Individual tool result messages
			for idx, result := range pair.results {
				tcID := ""
				if idx < len(pair.calls) {
					tcID, _ = pair.calls[idx]["id"].(string)
				}
				if tcID == "" {
					tcID = fmt.Sprintf("tc_%d", idx)
				}
				out = append(out, map[string]interface{}{
					"role":         "tool",
					"tool_call_id": tcID,
					"content":      result,
				})
			}
		default:
			// Skip unknown roles (including old "tool-calls" that failed to parse)
		}
	}
	return out
}

func convertHistoryToWireFormat(history []map[string]interface{}) []map[string]interface{} {
	out := make([]map[string]interface{}, 0, len(history))
	for i := 0; i < len(history); i++ {
		m := history[i]
		role, _ := m["role"].(string)
		content, _ := m["content"].(string)

		switch role {
		case "system", "user":
			out = append(out, map[string]interface{}{"role": role, "content": content})
		case "agent":
			out = append(out, map[string]interface{}{"role": "assistant", "content": content})
		case "tool-calls":
			// Keep tool-calls as a standalone message so the frontend
			// can render individual tool cards in timeline order.
			out = append(out, map[string]interface{}{"role": "tool-calls", "content": content})
		default:
			out = append(out, m)
		}
	}
	return out
}

type toolCallsPair struct {
	calls   []map[string]interface{}
	results []string
}

func convertToolCallsRow(raw string) *toolCallsPair {
	var callInfos []map[string]interface{}
	if err := json.Unmarshal([]byte(raw), &callInfos); err != nil || len(callInfos) == 0 {
		return nil
	}
	calls := make([]map[string]interface{}, 0, len(callInfos))
	results := make([]string, 0, len(callInfos))
	for idx, ci := range callInfos {
		name, _ := ci["name"].(string)
		params, _ := ci["params"].(string)
		result, _ := ci["result"].(string)
		calls = append(calls, map[string]interface{}{
			"id":   fmt.Sprintf("tc_%d", idx),
			"type": "function",
			"function": map[string]interface{}{
				"name":      name,
				"arguments": params,
			},
		})
		results = append(results, result)
	}
	return &toolCallsPair{calls: calls, results: results}
}

func buildSystemPrompt(mode string) string {
	prompt := `You are an AI cloud operations assistant for a multi-cloud management platform. You can manage resources across Azure, Tencent Cloud, Oracle Cloud, and Render.

You have access to the following tools:
- list_cloud_resources: List all cloud resources with optional filters
- start_instance: Start a cloud instance
- stop_instance: Stop a cloud instance
- restart_instance: Restart a cloud instance
- sync_cloud_resources: Trigger a sync of all cloud resources
- get_cloud_stats: Get resource statistics
- list_cloud_accounts: List configured cloud accounts

Important guidelines:
- Always list resources first before performing actions to confirm the correct resource
- When stopping instances, always warn the user about potential impact
- For destructive operations, explain what will happen before proceeding
- Respond in the same language as the user's message
- Be concise but thorough in your explanations`

	switch mode {
	case "plan":
		prompt += "\n\nYou are in PLAN mode: Analyze the situation and present a plan before taking any actions. Do not execute actions directly, only propose them."
	case "build":
		prompt += "\n\nYou are in BUILD mode: Execute solutions directly when the user asks. Use tools to make changes."
	case "confirm":
		prompt += "\n\nYou are in CONFIRM mode: Always explain what you're about to do and wait for user confirmation before executing destructive operations."
	}

	return prompt
}

func errToString(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}

func sendSSEError(c *gin.Context, message string) {
	fmt.Fprintf(c.Writer, "event: error\ndata: %s\n\n", toJSON(map[string]string{"message": message}))
	if flusher, ok := c.Writer.(http.Flusher); ok {
		flusher.Flush()
	}
}

func toJSON(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}

func chunkRunes(s string, size int) []string {
	runes := []rune(s)
	var chunks []string
	for i := 0; i < len(runes); i += size {
		end := i + size
		if end > len(runes) {
			end = len(runes)
		}
		chunks = append(chunks, string(runes[i:end]))
	}
	return chunks
}

func isDestructiveCommand(cmd string) bool {
	destructive := []string{
		"install", "update", "upgrade", "remove", "delete", "rm ", "uninstall",
		"create", "mkfs", "mkswap", "mk", "dd ", "mount", "umount",
		"apt-get", "apt ", "yum ", "dnf ", "pacman", "brew", "pip", "pip3", "npm",
		"systemctl", "service", "reboot", "shutdown", "init ",
		"az ", "oci ", "tccli", "render", "terraform", "ansible",
		"chmod", "chown", "useradd", "usermod", "groupadd",
		">", ">>", "tee ",
	}
	readOnly := []string{
		"ls", "pwd", "echo", "cat", "head", "tail", "less", "more",
		"which", "whereis", "whoami", "id", "env", "printenv",
		"uname", "hostname", "date", "uptime", "df", "du", "free",
		"ps", "top", "who", "w", "last",
		"grep", "find", "wc", "sort", "uniq", "diff", "file", "stat",
		"awk", "sed", "cut", "tr",
		"git status", "git log", "git diff", "git show", "git branch",
		"git tag", "git remote", "git config",
		"ping", "curl", "wget", "nslookup", "dig", "host", "ip",
		"az account", "az group list", "az vm list", "az network",
		"oci compute instance list", "oci network vcn list",
		"tccli cvm Describe",
		"lscpu", "lsblk", "lsusb", "lspci", "lsmod",
		"cat /proc",
	}
	cmdLower := strings.ToLower(strings.TrimSpace(cmd))

	// Split by pipe and check each segment independently
	segments := strings.Split(cmdLower, "|")
	for _, seg := range segments {
		seg = strings.TrimSpace(seg)
		if seg == "" {
			continue
		}

		// Check if this segment matches any read-only prefix
		isReadOnly := false
		for _, ro := range readOnly {
			if strings.HasPrefix(seg, ro+" ") || seg == ro {
				isReadOnly = true
				break
			}
		}

		// If not read-only, check if it's destructive
		if !isReadOnly {
			for _, d := range destructive {
				if strings.Contains(seg, d) {
					return true
				}
			}
		}
	}

	return false
}

func (h *ChatStreamHandler) Stream(c *gin.Context) {
	var req struct {
		Message   string `json:"message"`
		SessionID string `json:"session_id"`
		Mode      string `json:"mode"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.Message == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "message is required"})
		return
	}

	// Viewer can only use plan mode
	if role, _ := c.Get("user_role"); role == "viewer" && req.Mode != "plan" {
		c.JSON(http.StatusForbidden, gin.H{"error": "只读用户只能使用 Plan 模式"})
		return
	}

	currentUser, _ := c.Get("user_id")
	currentUserStr := fmt.Sprintf("%v", currentUser)
	sessionID, internalID, sessionUserID, isNew, err := h.resolveSession(req.SessionID, req.Message, currentUserStr)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
		return
	}
	if !isNew && sessionUserID != currentUserStr {
		c.JSON(http.StatusForbidden, gin.H{"error": "只有对话创建者才能发送消息"})
		return
	}
	req.SessionID = sessionID

	roleStr, _ := c.Get("user_role")
	userRole, _ := roleStr.(string)
	r := NewRun(req.SessionID, req.Mode, req.Message, userRole)
	r.InternalID = internalID
	if h.db != nil {
		_, err := h.db.Exec(
			`INSERT INTO runs (id, session_id, state, mode, user_message) VALUES ($1, $2, 'pending', $3, $4)`,
			r.ID, internalID, r.Mode, r.UserMessage)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
	}

	if err := h.rm.Start(r); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusAccepted, gin.H{
		"run_id":     r.ID,
		"session_id": req.SessionID,
		"state":      string(r.State),
	})
}

// resolveSession returns (sessionID_uuid, internalID, sessionUserID, isNew, error).
// sessionID_uuid is sessions.session_id (UUID), internalID is sessions.id (integer string).
// sessionUserID is the user_id of the session creator (empty for isNew).
func (h *ChatStreamHandler) resolveSession(externalID, firstMessage, userID string) (string, string, string, bool, error) {
	if externalID == "" {
		title := "新对话"
		if firstMessage != "" {
			runes := []rune(firstMessage)
			if len(runes) > 100 {
				title = string(runes[:100])
			} else {
				title = firstMessage
			}
		}
		var sessionID, internalID string
		err := h.db.QueryRow(
			`INSERT INTO sessions (session_id, title, user_id) VALUES (gen_random_uuid()::text, $1, $2) RETURNING session_id, id`,
			title, userID).Scan(&sessionID, &internalID)
		return sessionID, internalID, userID, true, err
	}
	var sessionID, internalID, sessionUserID string
	err := h.db.QueryRow(`SELECT session_id, id::text, user_id FROM sessions WHERE session_id = $1 OR id::text = $1`, externalID).Scan(&sessionID, &internalID, &sessionUserID)
	if err == sql.ErrNoRows {
		return "", "", "", false, fmt.Errorf("session not found")
	}
	return sessionID, internalID, sessionUserID, false, err
}

func (h *ChatStreamHandler) Confirm(c *gin.Context) {
	var req struct {
		RunID  string `json:"run_id"`
		Action string `json:"action"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.RunID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "run_id is required"})
		return
	}
	run, ok := h.rm.Get(req.RunID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "run not found"})
		return
	}
	userID, _ := c.Get("user_id")
	userRole, _ := c.Get("user_role")
	ownerID, _ := userID.(string)
	role, _ := userRole.(string)
	if role != "admin" {
		var dbOwnerID string
		err := h.db.QueryRow(`SELECT user_id FROM sessions WHERE session_id = $1`, run.SessionID).Scan(&dbOwnerID)
		if err != nil || dbOwnerID != ownerID {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
			return
		}
	}
	run.mu.Lock()
	state := run.State
	run.mu.Unlock()
	if state != StateWaitingConfirm {
		c.JSON(http.StatusConflict, gin.H{"error": "run is not waiting for confirm", "state": string(state)})
		return
	}
	if !h.rm.Confirm(req.RunID, req.Action) {
		c.JSON(http.StatusConflict, gin.H{"error": "confirm failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *ChatStreamHandler) Stop(c *gin.Context) {
	var req struct {
		RunID string `json:"run_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.RunID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "run_id is required"})
		return
	}
	run, ok := h.rm.Get(req.RunID)
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "run not found"})
		return
	}
	userID, _ := c.Get("user_id")
	userRole, _ := c.Get("user_role")
	ownerID, _ := userID.(string)
	role, _ := userRole.(string)
	if role != "admin" {
		var dbOwnerID string
		err := h.db.QueryRow(`SELECT user_id FROM sessions WHERE session_id = $1`, run.SessionID).Scan(&dbOwnerID)
		if err != nil || dbOwnerID != ownerID {
			c.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
			return
		}
	}
	run.mu.Lock()
	state := run.State
	run.mu.Unlock()
	if state == StateDone || state == StateError || state == StateStopped {
		c.JSON(http.StatusConflict, gin.H{"error": "run already terminal", "state": string(state)})
		return
	}
	h.setRunState(run, StateStopped, "User stopped")
	h.rm.persistEvent(run, EventStateChange, map[string]interface{}{"state": string(StateStopped), "error_message": "User stopped"})
	run.Cancel()
	c.JSON(http.StatusOK, gin.H{"ok": true, "state": string(StateStopped)})
}

const (
	compactionLimit      = 100000
	summarizeThreshold   = 80000
	pruneProtectTokens   = 40000
	pruneMinTokens       = 20000
	protectRounds        = 2
	maxContextTokens     = 100000
)

func (h *ChatStreamHandler) maybeSummarize(ctx context.Context, messages []map[string]interface{}) ([]map[string]interface{}, bool) {
	if len(messages) <= 2 {
		return messages, false
	}
	tokenCount := countMessagesTokens(messages)
	if tokenCount < summarizeThreshold {
		return messages, false
	}

	systemMsg := messages[0]
	var conversationMsgs []map[string]interface{}
	for i := 1; i < len(messages); i++ {
		conversationMsgs = append(conversationMsgs, messages[i])
	}

	summary, err := h.summarizeWithLLM(ctx, conversationMsgs)
	if err != nil {
		log.Printf("Summarization failed, falling back to pruning: %v", err)
		return compactMessages(messages), true
	}

	newMessages := []map[string]interface{}{
		systemMsg,
		{
			"role":    "system",
			"content": fmt.Sprintf("Conversation summary (previous context compacted):\n%s", summary),
		},
	}
	log.Printf("Conversation summarized: %d tokens -> summary", tokenCount)
	return newMessages, true
}

func (h *ChatStreamHandler) summarizeWithLLM(ctx context.Context, messages []map[string]interface{}) (string, error) {
	cfg := GetAIConfigValue()
	if cfg.APIEndpoint == "" || cfg.APIKey == "" || cfg.Model == "" {
		return "", fmt.Errorf("AI config not available")
	}

	prompt := "Summarize the following conversation concisely, preserving key facts, decisions, and pending tasks. Focus on what was accomplished and what remains:\n\n"
	for _, m := range messages {
		role, _ := m["role"].(string)
		content, _ := m["content"].(string)
		if content != "" {
			prompt += fmt.Sprintf("%s: %s\n", role, content)
		}
	}

	body := map[string]interface{}{
		"model":      cfg.Model,
		"messages":   []map[string]interface{}{{"role": "user", "content": prompt}},
		"stream":     false,
		"max_tokens": 2000,
		"temperature": 0.3,
	}
	bodyBytes, _ := json.Marshal(body)

	baseURL := strings.TrimSuffix(strings.TrimRight(cfg.APIEndpoint, "/"), "/chat/completions")
	apiURL := baseURL + "/chat/completions"

	req, err := http.NewRequestWithContext(ctx, "POST", apiURL, bytes.NewReader(bodyBytes))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.APIKey)

	client := &http.Client{Timeout: 60 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("summarization API error (HTTP %d): %s", resp.StatusCode, string(body))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	if len(result.Choices) == 0 {
		return "", fmt.Errorf("empty summarization response")
	}
	return result.Choices[0].Message.Content, nil
}

func estimateTokens(text string) int {
	return len(text)/4 + 1
}

func countMessagesTokens(msgs []map[string]interface{}) int {
	total := 0
	for _, m := range msgs {
		if c, ok := m["content"].(string); ok {
			total += estimateTokens(c)
		}
		if tc, ok := m["tool_calls"]; ok {
			if b, err := json.Marshal(tc); err == nil {
				total += estimateTokens(string(b))
			}
		}
	}
	return total
}

func compactMessages(msgs []map[string]interface{}) []map[string]interface{} {
	if len(msgs) <= 1 {
		return msgs
	}
	if countMessagesTokens(msgs) <= compactionLimit {
		return msgs
	}

	sysIdx := 0
	for i, m := range msgs {
		if role, _ := m["role"].(string); role == "system" {
			sysIdx = i
			break
		}
	}
	if sysIdx >= len(msgs)-1 {
		return msgs
	}

	turnsSeen := 0
	for i := len(msgs) - 1; i > sysIdx; i-- {
		if role, _ := msgs[i]["role"].(string); role == "user" {
			turnsSeen++
			continue
		}
		if role, _ := msgs[i]["role"].(string); role == "tool" && turnsSeen < protectRounds {
			continue
		}
		if role, _ := msgs[i]["role"].(string); role == "tool" {
			if c, ok := msgs[i]["content"].(string); ok && len(c) > 200 {
				msgs[i]["content"] = c[:200] + "... [truncated]"
			}
		}
	}
	return msgs
}

// filterReadOnlyTools strips tool definitions to only those permitted for viewer users.
func filterReadOnlyTools(defs []map[string]interface{}) []map[string]interface{} {
	var filtered []map[string]interface{}
	for _, d := range defs {
		fn, ok := d["function"].(map[string]interface{})
		if !ok {
			continue
		}
		name, ok := fn["name"].(string)
		if !ok {
			continue
		}
		if agent.ReadOnlyTools[name] {
			filtered = append(filtered, d)
		}
	}
	return filtered
}
