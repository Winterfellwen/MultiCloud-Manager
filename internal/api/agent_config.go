package api

import (
	"bytes"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type AIConfig struct {
	APIEndpoint     string `json:"api_endpoint"`
	Model           string `json:"model"`
	APIKey          string `json:"api_key"`
	EnableReasoning bool   `json:"enable_reasoning"`
	ReasoningEffort string `json:"reasoning_effort"`
}

var (
	aiConfigCache AIConfig
	aiConfigMu    sync.RWMutex
	aiConfigDB    *sql.DB
)

func InitAIConfig(db *sql.DB) {
	aiConfigDB = db
	loadAIConfigFromDB()
}

func GetAIConfig(c *gin.Context) {
	aiConfigMu.RLock()
	cfg := aiConfigCache
	aiConfigMu.RUnlock()
	// Mask API key for security
	masked := cfg.APIKey
	if len(masked) > 8 {
		masked = masked[:4] + "****" + masked[len(masked)-4:]
	} else if masked != "" {
		masked = "****"
	}
	c.JSON(http.StatusOK, map[string]interface{}{
		"api_endpoint":     cfg.APIEndpoint,
		"model":            cfg.Model,
		"api_key":          masked,
		"enable_reasoning": cfg.EnableReasoning,
		"reasoning_effort": cfg.ReasoningEffort,
	})
}

func UpdateAIConfig(c *gin.Context) {
	var newConfig AIConfig
	if err := c.ShouldBindJSON(&newConfig); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	if aiConfigDB == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database not available"})
		return
	}

	// Preserve existing API key if client sent masked value (from GET)
	if strings.Contains(newConfig.APIKey, "****") {
		existing := GetAIConfigValue()
		newConfig.APIKey = existing.APIKey
	}

	_, err := aiConfigDB.Exec(
		`UPDATE ai_config SET api_endpoint = $1, model = $2, api_key = $3, enable_reasoning = $4, reasoning_effort = $5, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
		newConfig.APIEndpoint, newConfig.Model, newConfig.APIKey, newConfig.EnableReasoning, newConfig.ReasoningEffort,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save config: " + err.Error()})
		return
	}

	aiConfigMu.Lock()
	aiConfigCache = newConfig
	aiConfigMu.Unlock()

	c.JSON(http.StatusOK, gin.H{"message": "config updated"})
}

func TestAIConfig(c *gin.Context) {
	cfg := GetAIConfigValue()

	if cfg.APIEndpoint == "" || cfg.APIKey == "" || cfg.Model == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "AI config not fully configured. Please set API endpoint, model, and API key."})
		return
	}

	baseURL := strings.TrimSuffix(strings.TrimRight(cfg.APIEndpoint, "/"), "/chat/completions")
	apiURL := baseURL + "/chat/completions"
	messages := []map[string]interface{}{
		{"role": "user", "content": "Say hello in one word."},
	}
	body := map[string]interface{}{
		"model":      cfg.Model,
		"messages":   messages,
		"stream":     false,
		"max_tokens": 10,
	}

	bodyBytes, _ := json.Marshal(body)
	req, err := http.NewRequest("POST", apiURL, bytes.NewReader(bodyBytes))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create request: " + err.Error()})
		return
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.APIKey)

	httpClient := &http.Client{Timeout: 30 * time.Second}
	resp, err := httpClient.Do(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "connection failed: " + err.Error()})
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("API returned HTTP %d: %s", resp.StatusCode, string(respBody))})
		return
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse response: " + err.Error()})
		return
	}

	reply := ""
	if len(result.Choices) > 0 {
		reply = result.Choices[0].Message.Content
	}

	c.JSON(http.StatusOK, gin.H{"message": "Connection successful!", "reply": reply})
}

func GetAIConfigValue() AIConfig {
	aiConfigMu.RLock()
	defer aiConfigMu.RUnlock()
	return aiConfigCache
}

func loadAIConfigFromDB() {
	if aiConfigDB == nil {
		return
	}

	var cfg AIConfig
	var enableReasoning bool
	err := aiConfigDB.QueryRow(
		`SELECT api_endpoint, model, api_key, COALESCE(enable_reasoning, false), COALESCE(reasoning_effort, 'medium') FROM ai_config WHERE id = 1`,
	).Scan(&cfg.APIEndpoint, &cfg.Model, &cfg.APIKey, &enableReasoning, &cfg.ReasoningEffort)
	if err != nil {
		cfg = AIConfig{
			APIEndpoint:     "https://api.openai.com/v1",
			Model:           "gpt-4o-mini",
			APIKey:          "",
			EnableReasoning: false,
			ReasoningEffort: "medium",
		}
	}

	cfg.EnableReasoning = enableReasoning

	aiConfigMu.Lock()
	aiConfigCache = cfg
	aiConfigMu.Unlock()
}
