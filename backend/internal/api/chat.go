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
	db *sql.DB
}

func NewChatStreamHandler(db *sql.DB) *ChatStreamHandler {
	return &ChatStreamHandler{db: db}
}

func (h *ChatStreamHandler) Stream(c *gin.Context) {
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Access-Control-Allow-Origin", "*")

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

	systemPrompt := "You are a helpful AI assistant specialized in cloud resource management and software development. Respond in a concise, technical manner."
	if req.Mode == "plan" {
		systemPrompt += " You are in PLAN mode: analyze and plan before acting."
	} else if req.Mode == "build" {
		systemPrompt += " You are in BUILD mode: implement solutions directly."
	} else if req.Mode == "confirm" {
		systemPrompt += " You are in CONFIRM mode: always explain before making changes."
	}

	apiURL := strings.TrimRight(cfg.APIEndpoint, "/") + "/chat/completions"

	messages := []map[string]interface{}{
		{"role": "system", "content": systemPrompt},
		{"role": "user", "content": req.Message},
	}

	body := map[string]interface{}{
		"model":    cfg.Model,
		"messages": messages,
		"stream":   true,
	}

	if cfg.EnableReasoning {
		body["reasoning_effort"] = cfg.ReasoningEffort
	}

	bodyBytes, _ := json.Marshal(body)
	httpReq, err := http.NewRequest("POST", apiURL, bytes.NewReader(bodyBytes))
	if err != nil {
		sendSSEError(c, "failed to create request: "+err.Error())
		return
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+cfg.APIKey)

	resp, err := http.DefaultClient.Do(httpReq)
	if err != nil {
		sendSSEError(c, "connection failed: "+err.Error())
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		respBody, _ := io.ReadAll(resp.Body)
		sendSSEError(c, fmt.Sprintf("API error (HTTP %d): %s", resp.StatusCode, string(respBody)))
		return
	}

	reader := bufio.NewReader(resp.Body)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			if err == io.EOF {
				break
			}
			sendSSEError(c, "stream read error: "+err.Error())
			return
		}

		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}

		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
				FinishReason *string `json:"finish_reason"`
			} `json:"choices"`
		}

		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}

		for _, choice := range chunk.Choices {
			if choice.Delta.Content != "" {
				fmt.Fprintf(c.Writer, "event: token\ndata: %s\n\n", toJSON(map[string]string{"content": choice.Delta.Content}))
				flusher.Flush()
			}
			if choice.FinishReason != nil && *choice.FinishReason == "stop" {
				fmt.Fprintf(c.Writer, "event: done\ndata: {}\n\n")
				flusher.Flush()
			}
		}
	}
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
