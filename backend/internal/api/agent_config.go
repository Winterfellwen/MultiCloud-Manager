package api

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"multicloud-manager/internal/i18n"
	"multicloud-manager/internal/services"

	"github.com/gin-gonic/gin"
)

type AIConfigResponse struct {
	APIEndpoint     string `json:"api_endpoint"`
	Model           string `json:"model"`
	APIKey          string `json:"api_key"`
	EnableReasoning bool   `json:"enable_reasoning"`
	ReasoningEffort string `json:"reasoning_effort"`
}

type ConfigHandler struct {
	db *services.Database
}

func NewConfigHandler(db *services.Database) *ConfigHandler {
	return &ConfigHandler{db: db}
}

func (h *ConfigHandler) Get(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, AIConfigResponse{
			APIEndpoint: "https://api.openai.com/v1",
			Model:       "gpt-4o-mini",
		})
		return
	}

	cfg := h.loadConfig()
	masked := cfg.APIKey
	if len(masked) > 8 {
		masked = strings.Repeat("*", len(masked)-4) + masked[len(masked)-4:]
	} else if masked != "" {
		masked = "****"
	}

	c.JSON(http.StatusOK, AIConfigResponse{
		APIEndpoint:     cfg.APIEndpoint,
		Model:           cfg.Model,
		APIKey:          masked,
		EnableReasoning: cfg.EnableReasoning,
		ReasoningEffort: cfg.ReasoningEffort,
	})
}

func (h *ConfigHandler) Update(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"message": i18n.T(c, "save_ok")})
		return
	}

	var req struct {
		APIEndpoint     *string `json:"api_endpoint"`
		Model           *string `json:"model"`
		APIKey          *string `json:"api_key"`
		EnableReasoning *bool   `json:"enable_reasoning"`
		ReasoningEffort *string `json:"reasoning_effort"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": i18n.T(c, "invalid_params")})
		return
	}

	var sets []string
	var args []interface{}
	argIdx := 1

	current := h.loadConfig()

	if req.APIEndpoint != nil {
		sets = append(sets, fmt.Sprintf("api_endpoint = $%d", argIdx))
		args = append(args, *req.APIEndpoint)
		argIdx++
	}
	if req.Model != nil {
		sets = append(sets, fmt.Sprintf("model = $%d", argIdx))
		args = append(args, *req.Model)
		argIdx++
	}
	if req.APIKey != nil {
		if *req.APIKey != "..." && *req.APIKey != strings.Repeat("*", len(current.APIKey)) {
			sets = append(sets, fmt.Sprintf("api_key = $%d", argIdx))
			args = append(args, *req.APIKey)
			argIdx++
		}
	}
	if req.EnableReasoning != nil {
		sets = append(sets, fmt.Sprintf("enable_reasoning = $%d", argIdx))
		args = append(args, *req.EnableReasoning)
		argIdx++
	}
	if req.ReasoningEffort != nil {
		sets = append(sets, fmt.Sprintf("reasoning_effort = $%d", argIdx))
		args = append(args, *req.ReasoningEffort)
		argIdx++
	}

	if len(sets) > 0 {
		sets = append(sets, fmt.Sprintf("updated_at = CURRENT_TIMESTAMP"))
		q := fmt.Sprintf("UPDATE ai_config SET %s WHERE id = 1", strings.Join(sets, ", "))
		if _, err := h.db.Exec(q, args...); err != nil {
			log.Printf("ai config update: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "save_failed")})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": i18n.T(c, "save_ok")})
}

func (h *ConfigHandler) loadConfig() struct {
	APIEndpoint     string
	Model           string
	APIKey          string
	EnableReasoning bool
	ReasoningEffort string
} {
	var cfg struct {
		APIEndpoint     string
		Model           string
		APIKey          string
		EnableReasoning bool
		ReasoningEffort string
	}
	err := h.db.QueryRow(
		`SELECT api_endpoint, model, api_key, enable_reasoning, reasoning_effort FROM ai_config WHERE id = 1`,
	).Scan(&cfg.APIEndpoint, &cfg.Model, &cfg.APIKey, &cfg.EnableReasoning, &cfg.ReasoningEffort)
	if err != nil {
		log.Printf("load ai config: %v", err)
		cfg.APIEndpoint = "https://api.openai.com/v1"
		cfg.Model = "gpt-4o-mini"
	}
	return cfg
}

type chatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type chatRequest struct {
	Model            string        `json:"model"`
	Messages         []chatMessage `json:"messages"`
	Stream           bool          `json:"stream"`
	ReasoningEffort  string        `json:"reasoning_effort,omitempty"`
}

type chatChoice struct {
	Message chatMessage `json:"message"`
}

type chatResponse struct {
	Choices []chatChoice `json:"choices"`
}

func callLLM(ctx context.Context, endpoint, model, apiKey string, enableReasoning bool, reasoningEffort string, systemPrompt, userMsg string) (string, error) {
	url := strings.TrimRight(endpoint, "/") + "/chat/completions"

	messages := []chatMessage{
		{Role: "system", Content: systemPrompt},
		{Role: "user", Content: userMsg},
	}

	body := chatRequest{
		Model:    model,
		Messages: messages,
		Stream:   false,
	}

	if enableReasoning && reasoningEffort != "" {
		body.ReasoningEffort = reasoningEffort
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return "", fmt.Errorf("marshal: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(payload))
	if err != nil {
		return "", fmt.Errorf("request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("read: %w", err)
	}

	if resp.StatusCode != 200 {
		return "", fmt.Errorf("api error %d: %s", resp.StatusCode, string(respBody))
	}

	var result chatResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", fmt.Errorf("unmarshal: %w", err)
	}

	if len(result.Choices) == 0 {
		return "", fmt.Errorf("no choices in response")
	}

	return strings.TrimSpace(result.Choices[0].Message.Content), nil
}
