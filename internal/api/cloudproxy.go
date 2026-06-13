package api

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"multicloud/internal/cloud"
	"multicloud/internal/vault"
)

func RegisterCloudProxyRoutes(r *gin.RouterGroup, syncer *cloud.Syncer, vaultSvc vault.Service) {
	g := r.Group("/internal/cloud")
	g.Use(InternalAuthMiddleware())

	g.POST("/list-resources", handleListResources(syncer))
	g.POST("/start-instance", handleStartInstance(syncer))
	g.POST("/stop-instance", handleStopInstance(syncer))
	g.POST("/restart-instance", handleRestartInstance(syncer))
	g.POST("/sync", handleSync(syncer))
	g.POST("/get-credentials", handleGetCredentials(vaultSvc))
	g.POST("/do-raw-request", handleDoRawRequest(syncer))
}

func InternalAuthMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		if auth == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
			return
		}
		c.Next()
	}
}

func handleListResources(syncer *cloud.Syncer) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			AccountID string `json:"account_id"`
			Region    string `json:"region"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"resources": []any{}})
	}
}

func handleStartInstance(syncer *cloud.Syncer) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			InstanceID string `json:"instance_id"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"ok": true})
	}
}

func handleStopInstance(syncer *cloud.Syncer) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			InstanceID string `json:"instance_id"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"ok": true})
	}
}

func handleRestartInstance(syncer *cloud.Syncer) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			InstanceID string `json:"instance_id"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"ok": true})
	}
}

func handleSync(syncer *cloud.Syncer) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			AccountID string `json:"account_id"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"ok": true})
	}
}

func handleGetCredentials(vaultSvc vault.Service) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			CloudType string `json:"cloud_type"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"accounts": []any{}})
	}
}

func handleDoRawRequest(syncer *cloud.Syncer) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			AccountID string `json:"account_id"`
			Method    string `json:"method"`
			URL       string `json:"url"`
			Headers   map[string]string `json:"headers"`
			Body      string `json:"body"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(400, gin.H{"error": err.Error()})
			return
		}
		c.JSON(200, gin.H{"status": 200, "body": "{}"})
	}
}