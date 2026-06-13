package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type TSClient struct {
	BaseURL    string
	JWTToken   string
	httpClient *http.Client
}

func NewTSClient(baseURL, jwtToken string) *TSClient {
	return &TSClient{
		BaseURL:    baseURL,
		JWTToken:   jwtToken,
		httpClient: &http.Client{Timeout: 120 * time.Second},
	}
}

type AgentRunRequest struct {
	SessionID string `json:"sessionId"`
	Message   string `json:"message"`
	Mode      string `json:"mode"`
	UserRole  string `json:"userRole"`
}

type RunResponse struct {
	RunID     string `json:"runId"`
	SessionID string `json:"sessionId"`
}

func (c *TSClient) RunAgent(ctx context.Context, req AgentRunRequest) (*RunResponse, error) {
	body, _ := json.Marshal(req)
	reqHTTP, _ := http.NewRequestWithContext(ctx, "POST", c.BaseURL+"/rpc/agent.run", bytes.NewReader(body))
	reqHTTP.Header.Set("Content-Type", "application/json")
	reqHTTP.Header.Set("Authorization", "Bearer "+c.JWTToken)

	resp, err := c.httpClient.Do(reqHTTP)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Result *RunResponse `json:"result"`
		Error  *struct{ Message string } `json:"error"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	if result.Error != nil {
		return nil, fmt.Errorf(result.Error.Message)
	}
	return result.Result, nil
}

type SSEEvent struct {
	Type    string `json:"type"`
	RunID   string `json:"runId"`
	Content string `json:"content,omitempty"`
	Tool    any    `json:"tool,omitempty"`
	Result  string `json:"result,omitempty"`
	Error   string `json:"error,omitempty"`
}

func (c *TSClient) StreamEvents(ctx context.Context, runID string) (<-chan SSEEvent, error) {
	ch := make(chan SSEEvent, 10)
	go func() {
		defer close(ch)
		req, _ := http.NewRequestWithContext(ctx, "GET", c.BaseURL+"/sse/"+runID, nil)
		req.Header.Set("Authorization", "Bearer "+c.JWTToken)
		resp, err := c.httpClient.Do(req)
		if err != nil {
			return
		}
		defer resp.Body.Close()
		// Parse SSE stream
		// For now, just return empty channel
	}()
	return ch, nil
}

// ToolCallRequest represents a request to execute a tool via the TS agent
 type ToolCallRequest struct {
	ToolName string                 `json:"toolName"`
	Args     map[string]interface{} `json:"args"`
 }

// ExecuteTool delegates tool execution to the TS Agent Service.
func (c *TSClient) ExecuteTool(ctx context.Context, toolName string, args map[string]interface{}) (string, error) {
	body, _ := json.Marshal(ToolCallRequest{
		ToolName: toolName,
		Args:     args,
	})
	req, _ := http.NewRequestWithContext(ctx, "POST", c.BaseURL+"/rpc/tool.execute", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.JWTToken)

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	bodyBytes, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("tool execution failed: %s", string(bodyBytes))
	}

	var result struct {
		Result string `json:"result"`
		Error  string `json:"error"`
	}
	if err := json.Unmarshal(bodyBytes, &result); err != nil {
		return string(bodyBytes), nil
	}
	if result.Error != "" {
		return "", fmt.Errorf(result.Error)
	}
	return result.Result, nil
}