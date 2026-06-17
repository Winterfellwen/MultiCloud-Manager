package api

import (
	"database/sql"
	"encoding/json"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
)

// ModelProvider defines a supported AI provider with its available models.
type ModelProvider struct {
	ID       string   `json:"id"`
	Name     string   `json:"name"`
	Endpoint string   `json:"endpoint"`
	Models   []string `json:"models"`
}

// Built-in provider presets.
var BuiltInProviders = []ModelProvider{
	{
		ID:       "openai",
		Name:     "OpenAI",
		Endpoint: "https://api.openai.com/v1",
		Models:   []string{"gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "gpt-3.5-turbo"},
	},
	{
		ID:       "anthropic",
		Name:     "Anthropic",
		Endpoint: "https://api.anthropic.com/v1",
		Models:   []string{"claude-3-5-sonnet-20241022", "claude-3-opus-20240229", "claude-3-haiku-20240307"},
	},
	{
		ID:       "deepseek",
		Name:     "DeepSeek",
		Endpoint: "https://api.deepseek.com/v1",
		Models:   []string{"deepseek-chat", "deepseek-coder", "deepseek-reasoner"},
	},
	{
		ID:       "gemini",
		Name:     "Google Gemini",
		Endpoint: "https://generativelanguage.googleapis.com/v1beta",
		Models:   []string{"gemini-2.0-flash", "gemini-1.5-pro", "gemini-1.5-flash"},
	},
	{
		ID:       "ollama",
		Name:     "Ollama (Local)",
		Endpoint: "http://localhost:11434/v1",
		Models:   []string{"llama3", "llama3.1", "mistral", "codellama", "qwen2"},
	},
	{
		ID:       "custom",
		Name:     "Custom",
		Endpoint: "",
		Models:   []string{},
	},
}

// ModelHubConfig stores the user's model hub configuration.
type ModelHubConfig struct {
	ProviderID string `json:"provider_id"`
	Model      string `json:"model"`
	Endpoint   string `json:"endpoint"`
	APIKey     string `json:"api_key"`
}

var (
	modelHubCache ModelHubConfig
	modelHubMu    sync.RWMutex
	modelHubDB    *sql.DB
)

func InitModelHub(db *sql.DB) {
	modelHubDB = db
	loadModelHubFromDB()
}

// ListModelProviders returns all built-in providers.
func ListModelProviders(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"providers": BuiltInProviders})
}

// GetModelHubConfig returns the current model hub configuration.
func GetModelHubConfig(c *gin.Context) {
	modelHubMu.RLock()
	cfg := modelHubCache
	modelHubMu.RUnlock()

	// Mask API key
	masked := cfg.APIKey
	if len(masked) > 8 {
		masked = masked[:4] + "****" + masked[len(masked)-4:]
	} else if masked != "" {
		masked = "****"
	}

	c.JSON(http.StatusOK, gin.H{
		"provider_id": cfg.ProviderID,
		"model":       cfg.Model,
		"endpoint":    cfg.Endpoint,
		"api_key":     masked,
	})
}

// UpdateModelHubConfig updates the model hub configuration.
func UpdateModelHubConfig(c *gin.Context) {
	var newConfig ModelHubConfig
	if err := c.ShouldBindJSON(&newConfig); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	if modelHubDB == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "database not available"})
		return
	}

	// Preserve existing API key if client sent masked value
	if len(newConfig.APIKey) > 4 && newConfig.APIKey[4:8] == "****" {
		modelHubMu.RLock()
		existing := modelHubCache
		modelHubMu.RUnlock()
		newConfig.APIKey = existing.APIKey
	}

	configJSON, _ := json.Marshal(newConfig)
	_, err := modelHubDB.Exec(
		`INSERT INTO model_hub_config (id, config, updated_at) VALUES (1, $1, CURRENT_TIMESTAMP)
		 ON CONFLICT (id) DO UPDATE SET config = $1, updated_at = CURRENT_TIMESTAMP`,
		configJSON,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save config: " + err.Error()})
		return
	}

	modelHubMu.Lock()
	modelHubCache = newConfig
	modelHubMu.Unlock()

	// Sync to legacy AI config for backward compatibility
	syncToLegacyAIConfig(newConfig)

	c.JSON(http.StatusOK, gin.H{"message": "model hub config updated"})
}

// syncToLegacyAIConfig syncs model hub config to the legacy ai_config table.
func syncToLegacyAIConfig(cfg ModelHubConfig) {
	if aiConfigDB == nil {
		return
	}
	aiConfigDB.Exec(
		`UPDATE ai_config SET api_endpoint = $1, model = $2, api_key = $3, updated_at = CURRENT_TIMESTAMP WHERE id = 1`,
		cfg.Endpoint, cfg.Model, cfg.APIKey,
	)
	aiConfigMu.Lock()
	aiConfigCache.APIEndpoint = cfg.Endpoint
	aiConfigCache.Model = cfg.Model
	aiConfigCache.APIKey = cfg.APIKey
	aiConfigMu.Unlock()
}

// GetActiveModelHubConfig returns the current model hub config (for internal use).
func GetActiveModelHubConfig() ModelHubConfig {
	modelHubMu.RLock()
	defer modelHubMu.RUnlock()
	return modelHubCache
}

func loadModelHubFromDB() {
	if modelHubDB == nil {
		return
	}

	var configJSON []byte
	err := modelHubDB.QueryRow(`SELECT config FROM model_hub_config WHERE id = 1`).Scan(&configJSON)
	if err != nil {
		// Default to OpenAI
		modelHubCache = ModelHubConfig{
			ProviderID: "openai",
			Model:      "gpt-4o-mini",
			Endpoint:   "https://api.openai.com/v1",
		}
		return
	}

	var cfg ModelHubConfig
	if err := json.Unmarshal(configJSON, &cfg); err != nil {
		modelHubCache = ModelHubConfig{
			ProviderID: "openai",
			Model:      "gpt-4o-mini",
			Endpoint:   "https://api.openai.com/v1",
		}
		return
	}

	modelHubMu.Lock()
	modelHubCache = cfg
	modelHubMu.Unlock()
}
