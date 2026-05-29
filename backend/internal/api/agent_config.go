package api

import (
	"database/sql"
	"net/http"
	"sync"

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
	defer aiConfigMu.RUnlock()
	c.JSON(http.StatusOK, aiConfigCache)
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

	_, err := aiConfigDB.Exec(
		`UPDATE ai_config SET api_endpoint = ?, model = ?, api_key = ?, enable_reasoning = ?, reasoning_effort = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
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
	var enableReasoning int
	err := aiConfigDB.QueryRow(
		`SELECT api_endpoint, model, api_key, COALESCE(enable_reasoning, 0), COALESCE(reasoning_effort, 'medium') FROM ai_config WHERE id = 1`,
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

	cfg.EnableReasoning = enableReasoning != 0

	aiConfigMu.Lock()
	aiConfigCache = cfg
	aiConfigMu.Unlock()
}
