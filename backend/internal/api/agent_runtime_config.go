package api

import (
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
)

type AgentConfigHandler struct {
	db *sql.DB
}

func NewAgentConfigHandler(db *sql.DB) *AgentConfigHandler {
	return &AgentConfigHandler{db: db}
}

// GetConfig retrieves configuration for a given type (shell/mcp/skills).
func (h *AgentConfigHandler) GetConfig(c *gin.Context) {
	configType := c.Param("type")
	if configType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "config type required"})
		return
	}

	var config string
	err := h.db.QueryRow(`SELECT config::text FROM agent_config WHERE config_type = $1`, configType).Scan(&config)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "config not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.Data(http.StatusOK, "application/json", []byte(config))
}

// UpdateConfig updates configuration for a given type.
func (h *AgentConfigHandler) UpdateConfig(c *gin.Context) {
	configType := c.Param("type")
	if configType == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "config type required"})
		return
	}

	var config interface{}
	if err := c.ShouldBindJSON(&config); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err := h.db.Exec(`
		INSERT INTO agent_config (config_type, config, updated_at) 
		VALUES ($1, $2::jsonb, CURRENT_TIMESTAMP)
		ON CONFLICT (config_type) 
		DO UPDATE SET config = $2::jsonb, updated_at = CURRENT_TIMESTAMP`,
		configType, config)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "config updated"})
}