package api

import (
	"bufio"
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
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
		h.db.Exec(`UPDATE runs SET state=$1, error_message=$2, started_at=CASE WHEN $1='running' AND started_at IS NULL THEN CURRENT_TIMESTAMP ELSE started_at END, terminal_at=CASE WHEN $1 IN ('done','error','stopped') THEN CURRENT_TIMESTAMP ELSE terminal_at END WHERE id=$3`, string(s), errMsg, r.ID)
	}
}

func (h *ChatStreamHandler) terminateRun(r *Run, errMsg string) {
	final := StateDone
	if errMsg != "" {
		final = StateError
	}
	h.setRunState(r, final, errMsg)
	h.rm.persistEvent(r, EventStateChange, map[string]interface{}{
		"state": string(final), "error_message": errMsg,
	})
	if final == StateDone {
		h.rm.AggregateOnDone(r)
	}
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

	systemPrompt := h.runtime.GetSystemPrompt(r.Mode)
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
			h.db.Exec(`UPDATE sessions SET status = 'running', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, sid)
		}
	}

	maxIterations := 100
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
		body := map[string]interface{}{
			"model":      cfg.Model,
			"messages":   messages,
			"stream":     true,
			"tools":      h.runtime.GetToolDefinitions(),
			"max_tokens": 4096,
		}

		if cfg.EnableReasoning {
			body["reasoning_effort"] = cfg.ReasoningEffort
		}

		apiURL := strings.TrimRight(cfg.APIEndpoint, "/") + "/chat/completions"
		bodyBytes, _ := json.Marshal(body)
		httpReq, err := http.NewRequest("POST", apiURL, bytes.NewReader(bodyBytes))
		if err != nil {
			stopReason = "failed to create request: " + err.Error()
			break
		}

		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("Authorization", "Bearer "+cfg.APIKey)

		resp, err := h.doWithRetry(ctx, httpClient, httpReq)
		if err != nil {
			stopReason = "connection failed after retries: " + err.Error()
			break
		}

		if resp.StatusCode != 200 {
			respBody, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
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

		fullContent, toolCalls, _ := h.collectStreamResponse(resp.Body, nil, nil)
		lastTurnContent = fullContent
		lastToolCalls = toolCalls

		if fullContent != "" {
			h.rm.persistEvent(r, EventToken, map[string]interface{}{
				"content": fullContent,
			})
		}

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

			var toolArgs map[string]interface{}
			if err := json.Unmarshal([]byte(toolArgsStr), &toolArgs); err != nil {
				toolArgs = map[string]interface{}{}
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
			if len(toolResultContent) > 2000 {
				toolResultContent = toolResultContent[:2000] + "...[truncated]"
			}
			messages = append(messages, map[string]interface{}{
				"role":         "tool",
				"tool_call_id": toolID,
				"content":      toolResultContent,
			})
		}

		messages = pruneMessages(messages)
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
		finalURL := strings.TrimRight(cfg.APIEndpoint, "/") + "/chat/completions"
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

	h.saveSessionMessages(r.SessionID, messages)

	if r.SessionID != "" && h.db != nil {
		var sid string
		if h.db.QueryRow(`SELECT id FROM sessions WHERE session_id = $1`, r.SessionID).Scan(&sid) == nil {
			h.db.Exec(`UPDATE sessions SET status = 'idle', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, sid)
		}
	}

	h.terminateRun(r, "")
}

func (h *ChatStreamHandler) doWithRetry(ctx context.Context, client *http.Client, req *http.Request) (*http.Response, error) {
	var resp *http.Response
	var lastErr error
	for retry := 0; retry < 3; retry++ {
		resp, lastErr = client.Do(req)
		if lastErr == nil && (resp.StatusCode < 500 || resp.StatusCode == 429) {
			return resp, nil
		}
		if lastErr != nil {
			if retry < 2 {
				select {
				case <-ctx.Done():
					return nil, ctx.Err()
				case <-time.After(time.Duration(1<<uint(retry)) * time.Second):
				}
			}
			continue
		}
		resp.Body.Close()
		if retry < 2 {
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(time.Duration(1<<uint(retry)) * time.Second):
			}
		}
	}
	return resp, lastErr
}

func (h *ChatStreamHandler) collectStreamResponse(body io.ReadCloser, c *gin.Context, flusher http.Flusher) (string, []map[string]interface{}, string) {
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
					"role": "agent", "content": content,
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
						"role": "tool-calls", "content": string(jsonBytes),
					})
				}
			}
			continue
		}
		if role == "user" {
			saveMsgs = append(saveMsgs, map[string]interface{}{
				"role": "user", "content": content,
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

	h.db.Exec(`DELETE FROM messages WHERE session_id = $1`, internalID)
	h.db.Exec(`INSERT INTO messages (session_id, role, content) VALUES ($1, 'history', $2)`, internalID, string(historyJSON))

	for _, m := range saveMsgs {
		if m["role"] == "user" {
			if title, ok := m["content"].(string); ok && title != "" {
				h.db.Exec(`UPDATE sessions SET title = LEFT($1, 100), updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND title = '新对话'`, title, internalID)
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
			return convertHistoryToWireFormat(history)
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
	return convertHistoryToWireFormat(history)
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
			assistantMsg := map[string]interface{}{"role": "assistant", "content": content}
			if i+1 < len(history) {
				if nextRole, _ := history[i+1]["role"].(string); nextRole == "tool-calls" {
					if tcs := convertToolCallsRow(history[i+1]["content"].(string)); tcs != nil {
						toolCalls, results := tcs.calls, tcs.results
						if len(toolCalls) > 0 {
							assistantMsg["tool_calls"] = toolCalls
						}
						out = append(out, assistantMsg)
						for idx, result := range results {
							out = append(out, map[string]interface{}{
								"role":         "tool",
								"tool_call_id": fmt.Sprintf("tc_%d", idx),
								"content":      result,
							})
						}
						i++
						continue
					}
				}
			}
			out = append(out, assistantMsg)
		case "tool-calls":
			if tcs := convertToolCallsRow(content); tcs != nil {
				out = append(out, map[string]interface{}{
					"role":       "assistant",
					"content":    "",
					"tool_calls": tcs.calls,
				})
				for idx, result := range tcs.results {
					out = append(out, map[string]interface{}{
						"role":         "tool",
						"tool_call_id": fmt.Sprintf("tc_%d", idx),
						"content":      result,
					})
				}
			}
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
	for _, ro := range readOnly {
		if strings.HasPrefix(cmdLower, ro+" ") || cmdLower == ro {
			return false
		}
	}
	for _, d := range destructive {
		if strings.Contains(cmdLower, d) {
			return true
		}
	}
	return false
}

func pruneMessages(msgs []map[string]interface{}) []map[string]interface{} {
	const maxMessages = 30
	if len(msgs) <= maxMessages {
		return msgs
	}
	keep := make([]map[string]interface{}, 0, maxMessages)
	keep = append(keep, msgs[0])
	keep = append(keep, msgs[len(msgs)-(maxMessages-1):]...)
	return keep
}
