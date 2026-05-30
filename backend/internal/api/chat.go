package api

import (
	"bufio"
	"bytes"
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
}

func NewChatStreamHandler(db *sql.DB, executor *agent.Executor, runtime *agent.Runtime) *ChatStreamHandler {
	return &ChatStreamHandler{db: db, executor: executor, runtime: runtime}
}

// Stream handles SSE streaming chat with tool calling support.
func (h *ChatStreamHandler) Stream(c *gin.Context) {
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Access-Control-Allow-Origin", "*")
	c.Header("X-Accel-Buffering", "no")

	var req ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		sendSSEError(c, err.Error())
		return
	}

	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		sendSSEError(c, "streaming not supported")
		return
	}

	cfg := GetAIConfigValue()

	if cfg.APIEndpoint == "" || cfg.APIKey == "" || cfg.Model == "" {
		sendSSEError(c, "AI config not configured")
		return
	}

	systemPrompt := h.runtime.GetSystemPrompt(req.Mode)
	messages := []map[string]interface{}{
		{"role": "system", "content": systemPrompt},
		{"role": "user", "content": req.Message},
	}

	maxIterations := 50
	var allContent strings.Builder

	httpClient := &http.Client{Timeout: 120 * time.Second}

	var stopReason string
	var iterCount int
	var lastToolCalls []map[string]interface{}

	// Doom loop detection: track last 3 tool calls (name+args)
	type toolCallKey struct {
		name string
		args string
	}
	var recentToolCalls [3]toolCallKey
	var toolCallIdx int

	for i := 0; i < maxIterations; i++ {
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

		resp, err := httpClient.Do(httpReq)
		if err != nil {
			stopReason = "connection failed: " + err.Error()
			break
		}

		if resp.StatusCode != 200 {
			respBody, _ := io.ReadAll(resp.Body)
			resp.Body.Close()
			stopReason = fmt.Sprintf("API error (HTTP %d)", resp.StatusCode)
			// Try to extract meaningful error
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

		fullContent, toolCalls, _ := h.collectStreamResponse(resp.Body)
		allContent.WriteString(fullContent)
		lastToolCalls = toolCalls

		// Stream content tokens to the client
		if fullContent != "" {
			chunkSize := 4
			runes := []rune(fullContent)
			for j := 0; j < len(runes); j += chunkSize {
				end := j + chunkSize
				if end > len(runes) {
					end = len(runes)
				}
				select {
				case <-c.Request.Context().Done():
					return
				default:
				}
				fmt.Fprintf(c.Writer, "event: token\ndata: %s\n\n", toJSON(map[string]string{"content": string(runes[j:end])}))
				flusher.Flush()
			}
		}

		// If no tool calls, we're done
		if len(toolCalls) == 0 {
			messages = append(messages, map[string]interface{}{
				"role":    "assistant",
				"content": fullContent,
			})
			break
		}

		// Process tool calls
		fmt.Fprintf(c.Writer, "event: tool_start\ndata: %s\n\n", toJSON(map[string]interface{}{
			"tool_calls": toolCalls,
		}))
		flusher.Flush()

		assistantMsg := map[string]interface{}{
			"role":       "assistant",
			"content":    fullContent,
			"tool_calls": toolCalls,
		}
		messages = append(messages, assistantMsg)

		for _, tc := range toolCalls {
			select {
			case <-c.Request.Context().Done():
				stopReason = "client disconnected"
				goto done
			default:
			}

			toolName, _ := tc["function"].(map[string]interface{})["name"].(string)
			toolArgsStr, _ := tc["function"].(map[string]interface{})["arguments"].(string)
			toolID, _ := tc["id"].(string)

			// Doom loop detection: same tool + same args 3x in a row → warn
			recentToolCalls[toolCallIdx%3] = toolCallKey{name: toolName, args: toolArgsStr}
			toolCallIdx++
			if toolCallIdx >= 3 &&
				recentToolCalls[0] == recentToolCalls[1] &&
				recentToolCalls[1] == recentToolCalls[2] {
				messages = append(messages, map[string]interface{}{
					"role":    "system",
					"content": "⚠️ DOOM LOOP DETECTED: You have called the same tool with the same arguments 3 times in a row. This approach is not working. STOP retrying. Instead: (1) try a completely different approach, or (2) tell the user what went wrong and ask for guidance. Do NOT call the same tool with the same parameters again.",
				})
				recentToolCalls = [3]toolCallKey{} // reset
			}

			// Hard block: Plan mode must not execute state-changing commands
			if req.Mode == "plan" && toolName == "shell_exec" {
				var targs map[string]interface{}
				json.Unmarshal([]byte(toolArgsStr), &targs)
				cmd, _ := targs["command"].(string)
				if isDestructiveCommand(cmd) {
					fmt.Fprintf(c.Writer, "event: tool_result\ndata: %s\n\n", toJSON(map[string]interface{}{
						"tool_name": toolName,
						"result":    "",
						"error":     "BLOCKED: Shell execution is disabled in Plan mode. Use Build mode to execute commands.",
					}))
					flusher.Flush()
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

			result, execErr := h.runtime.ExecuteTool(c.Request.Context(), toolName, toolArgs)

			fmt.Fprintf(c.Writer, "event: tool_result\ndata: %s\n\n", toJSON(map[string]interface{}{
				"tool_name": toolName,
				"result":    result,
				"error":     errToString(execErr),
			}))
			flusher.Flush()

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
	}

done:
	// Build summary if the loop was interrupted
	if stopReason != "" {
		summary := fmt.Sprintf("\n\n---\n> ⚠️ AI 在第 %d 步中断：%s\n> 请重新发送消息继续操作。\n", iterCount, stopReason)
		allContent.WriteString(summary)
		for _, part := range chunkRunes(summary, 10) {
			fmt.Fprintf(c.Writer, "event: token\ndata: %s\n\n", toJSON(map[string]string{"content": part}))
			flusher.Flush()
		}
	} else if iterCount >= maxIterations && len(lastToolCalls) > 0 {
		// opencode-style: inject MAX_STEPS as system-level assistant message
		messages = append(messages, map[string]interface{}{
			"role":    "system",
			"content": fmt.Sprintf("CRITICAL — MAXIMUM STEPS REACHED (%d). The maximum number of operations has been reached. Tools are disabled until next user input. Summarize what has been done, explain what remains, and ask the user if they want to continue.", maxIterations),
		})
		// One more LLM call to get the final summary
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
				finalContent, _, _ := h.collectStreamResponse(finalResp.Body)
				allContent.WriteString(finalContent)
				for _, part := range chunkRunes(finalContent, 10) {
					fmt.Fprintf(c.Writer, "event: token\ndata: %s\n\n", toJSON(map[string]string{"content": part}))
					flusher.Flush()
				}
			}
		}
	}

	h.saveSessionMessages(req.SessionID, req.Message, allContent.String())

	fmt.Fprintf(c.Writer, "event: done\ndata: {}\n\n")
	flusher.Flush()
}

// Chat handles non-streaming chat for miniprogram compatibility.
func (h *ChatStreamHandler) Chat(c *gin.Context) {
	var req ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	cfg := GetAIConfigValue()
	if cfg.APIEndpoint == "" || cfg.APIKey == "" || cfg.Model == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "AI config not configured"})
		return
	}

	systemPrompt := h.runtime.GetSystemPrompt(req.Mode)
	messages := []map[string]interface{}{
		{"role": "system", "content": systemPrompt},
		{"role": "user", "content": req.Message},
	}

	// Tool calling loop (non-streaming)
	maxIterations := 5
	var finalContent string

	for i := 0; i < maxIterations; i++ {
		body := map[string]interface{}{
			"model":      cfg.Model,
			"messages":   messages,
			"stream":     false,
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
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create request"})
			return
		}

		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("Authorization", "Bearer "+cfg.APIKey)

		httpClient := &http.Client{Timeout: 120 * time.Second}
		resp, err := httpClient.Do(httpReq)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "connection failed: " + err.Error()})
			return
		}
		defer resp.Body.Close()

		if resp.StatusCode != 200 {
			respBody, _ := io.ReadAll(resp.Body)
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("API error (HTTP %d): %s", resp.StatusCode, string(respBody))})
			return
		}

		var result struct {
			Choices []struct {
				Message struct {
					Content    string                   `json:"content"`
					ToolCalls  []map[string]interface{} `json:"tool_calls"`
				} `json:"message"`
				FinishReason string `json:"finish_reason"`
			} `json:"choices"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse response"})
			return
		}

		if len(result.Choices) == 0 {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "empty response from AI"})
			return
		}

		choice := result.Choices[0]
		finalContent = choice.Message.Content

		// If no tool calls, we're done
		if len(choice.Message.ToolCalls) == 0 {
			messages = append(messages, map[string]interface{}{
				"role":    "assistant",
				"content": finalContent,
			})
			break
		}

		// Process tool calls
		assistantMsg := map[string]interface{}{
			"role":       "assistant",
			"content":    finalContent,
			"tool_calls": choice.Message.ToolCalls,
		}
		messages = append(messages, assistantMsg)

		for _, tc := range choice.Message.ToolCalls {
			toolName, _ := tc["function"].(map[string]interface{})["name"].(string)
			toolArgsStr, _ := tc["function"].(map[string]interface{})["arguments"].(string)
			toolID, _ := tc["id"].(string)

			// Skip tool calls with empty name
			if toolName == "" {
				continue
			}

			var toolArgs map[string]interface{}
			if err := json.Unmarshal([]byte(toolArgsStr), &toolArgs); err != nil {
				toolArgs = map[string]interface{}{}
			}

			result, execErr := h.runtime.ExecuteTool(c.Request.Context(), toolName, toolArgs)

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
	}

	// Build response for miniprogram compatibility
	response := map[string]interface{}{
		"message": finalContent,
	}

	c.JSON(http.StatusOK, response)
}

// Execute handles plan execution for miniprogram compatibility.
func (h *ChatStreamHandler) Execute(c *gin.Context) {
	var req struct {
		SessionID string `json:"session_id"`
		PlanID    string `json:"plan_id"`
		Mode      string `json:"mode"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	// For now, execute is a simpler endpoint that just returns execution status
	// In the full implementation, this would process a saved plan
	c.JSON(http.StatusOK, map[string]interface{}{
		"execution_id": fmt.Sprintf("exec_%d", len(req.SessionID)),
		"status":      "running",
		"message":     "Execution started",
	})
}

// collectStreamResponse reads an SSE stream from the LLM and collects
// the full content and tool calls.
func (h *ChatStreamHandler) collectStreamResponse(body io.ReadCloser) (string, []map[string]interface{}, string) {
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
			}

			// Accumulate tool calls from streaming chunks
			for _, tc := range choice.Delta.ToolCalls {
				idx := 0
				if v, ok := tc["index"].(float64); ok {
					idx = int(v)
				}

				if existing, ok := toolCallsMap[idx]; ok {
					// Merge into existing
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
					// New tool call — build from chunk
					fn := tc["function"]
					if fn == nil {
						fn = map[string]interface{}{"name": "", "arguments": "{}"}
					}
					fnMap, _ := fn.(map[string]interface{})
					if fnMap == nil {
						fnMap = map[string]interface{}{"name": "", "arguments": "{}"}
					}
					// Ensure arguments defaults to valid JSON
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

	// Convert map to sorted slice, validating each tool call
	if len(toolCallsMap) > 0 {
		for i := 0; i < len(toolCallsMap); i++ {
			if tc, ok := toolCallsMap[i]; ok {
				fn, fnOk := tc["function"].(map[string]interface{})
				if !fnOk || fn == nil {
					continue
				}
				// Skip tool calls with empty name (streaming didn't capture it)
				name, _ := fn["name"].(string)
				if name == "" {
					continue
				}
				// Ensure arguments is always a valid JSON string
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

// saveSessionMessages persists user and assistant messages to the database.
func (h *ChatStreamHandler) saveSessionMessages(sessionID, userMsg, assistantMsg string) {
	if sessionID == "" || h.db == nil {
		return
	}
	// Look up internal session UUID
	var internalID string
	err := h.db.QueryRow(`SELECT id FROM sessions WHERE session_id = $1`, sessionID).Scan(&internalID)
	if err != nil {
		return
	}
	// Save user message
	h.db.Exec(`INSERT INTO messages (session_id, role, content) VALUES ($1, 'user', $2)`, internalID, userMsg)
	// Save assistant message
	if assistantMsg != "" {
		h.db.Exec(`INSERT INTO messages (session_id, role, content) VALUES ($1, 'assistant', $2)`, internalID, assistantMsg)
	}
	// Update session title from first message if still default
	h.db.Exec(`UPDATE sessions SET title = LEFT($1, 100), updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND title = '新对话'`, userMsg, internalID)
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
	return true // default: block unknown commands in plan mode
}
