package api

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"time"

	"multicloud/internal/agent"

	"github.com/gin-gonic/gin"
)

// ChatTSProxyHandler proxies chat requests to the TS Agent Service.
// It is used when the USE_TS_AGENT feature flag is enabled.
type ChatTSProxyHandler struct {
	tsClient *agent.TSClient
}

func NewChatTSProxyHandler(tsClient *agent.TSClient) *ChatTSProxyHandler {
	return &ChatTSProxyHandler{tsClient: tsClient}
}

// ProxyStream handles the SSE stream from the TS Agent Service.
func (h *ChatTSProxyHandler) ProxyStream(c *gin.Context) {
	var req ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if h.tsClient == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "TS agent not available"})
		return
	}

	// Build the request body for the TS agent
	body := map[string]interface{}{
		"message":    req.Message,
		"session_id": req.SessionID,
		"mode":       req.Mode,
	}
	if req.ConfirmAction != "" {
		body["confirm_action"] = req.ConfirmAction
	}
	if req.ToolName != "" {
		body["tool_name"] = req.ToolName
		body["tool_params"] = req.ToolParams
	}

	bodyJSON, err := json.Marshal(body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	// Create the request to the TS agent service
	url := h.tsClient.BaseURL + "/chat/stream"
	httpReq, err := http.NewRequestWithContext(c.Request.Context(), "POST", url, bytes.NewBuffer(bodyJSON))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if h.tsClient.JWTToken != "" {
		httpReq.Header.Set("Authorization", "Bearer "+h.tsClient.JWTToken)
	}

	client := &http.Client{Timeout: 0} // No timeout for SSE
	resp, err := client.Do(httpReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "TS agent unreachable: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		c.JSON(resp.StatusCode, gin.H{"error": string(body)})
		return
	}

	// Stream the response back as SSE
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	c.Stream(func(w io.Writer) bool {
		buf := make([]byte, 4096)
		for {
			n, err := resp.Body.Read(buf)
			if n > 0 {
				w.Write(buf[:n])
			}
			if err != nil {
				return false
			}
			if c.Request.Context().Err() != nil {
				return false
			}
		}
	})
}

// ProxyConfirm handles confirm requests to the TS agent.
func (h *ChatTSProxyHandler) ProxyConfirm(c *gin.Context) {
	if h.tsClient == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "TS agent not available"})
		return
	}

	var req struct {
		RunID   string `json:"run_id" binding:"required"`
		Confirm bool   `json:"confirm"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	url := h.tsClient.BaseURL + "/chat/confirm"
	bodyJSON, _ := json.Marshal(req)
	httpReq, _ := http.NewRequestWithContext(c.Request.Context(), "POST", url, bytes.NewBuffer(bodyJSON))
	httpReq.Header.Set("Content-Type", "application/json")
	if h.tsClient.JWTToken != "" {
		httpReq.Header.Set("Authorization", "Bearer "+h.tsClient.JWTToken)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "TS agent unreachable: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	c.Data(resp.StatusCode, "application/json", body)
}

// ProxyStop handles stop requests to the TS agent.
func (h *ChatTSProxyHandler) ProxyStop(c *gin.Context) {
	if h.tsClient == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "TS agent not available"})
		return
	}

	var req struct {
		RunID string `json:"run_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	url := h.tsClient.BaseURL + "/chat/stop"
	bodyJSON, _ := json.Marshal(req)
	httpReq, _ := http.NewRequestWithContext(c.Request.Context(), "POST", url, bytes.NewBuffer(bodyJSON))
	httpReq.Header.Set("Content-Type", "application/json")
	if h.tsClient.JWTToken != "" {
		httpReq.Header.Set("Authorization", "Bearer "+h.tsClient.JWTToken)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		c.JSON(http.StatusBadGateway, gin.H{"error": "TS agent unreachable: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	c.Data(resp.StatusCode, "application/json", body)
}
