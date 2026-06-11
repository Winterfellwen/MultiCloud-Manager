package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"multicloud/internal/agent"
	"multicloud/internal/cloud"
	"multicloud/internal/vault"

	"github.com/gin-gonic/gin"
)

func SetupRouter(authHandler *AuthHandler, jwtSecret string, db *sql.DB, runMgr *RunManager) *gin.Engine {
	r := gin.Default()

	// Health check endpoint for Render
	r.GET("/api/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	r.Use(func(c *gin.Context) {
		origin := c.Request.Header.Get("Origin")
		allowedOrigins := getEnv("ALLOWED_ORIGINS", "http://localhost:8099,http://127.0.0.1:8099")
		for _, o := range strings.Split(allowedOrigins, ",") {
			o = strings.TrimSpace(o)
			if o == origin {
				c.Header("Access-Control-Allow-Origin", origin)
				c.Header("Vary", "Origin")
				break
			}
		}
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	r.Use(func(c *gin.Context) {
		c.Header("X-Content-Type-Options", "nosniff")
		c.Header("X-Frame-Options", "DENY")
		c.Header("Referrer-Policy", "strict-origin-when-cross-origin")
		if os.Getenv("ENVIRONMENT") == "production" {
			c.Header("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
		}
		c.Next()
	})

	r.POST("/api/auth/login", authHandler.Login)

	// Built-in vault — no external dependency
	vaultService, err := vault.NewService(db)
	if err != nil {
		log.Printf("WARNING: Vault init failed: %v (vault features disabled)", err)
	}

	syncer := cloud.NewSyncer(db, vaultService)
	executor := agent.NewExecutor(syncer, db, vaultService)

	runtime := agent.NewRuntime(agent.RuntimeConfig{
		DB:     db,
		Syncer: syncer,
		Vault:  vaultService,
	})

	accountsHandler := NewAccountsHandler(db, vaultService)
	agentConfigHandler := NewAgentConfigHandler(db)
	resourcesHandler := NewResourcesHandler(syncer, db)
	teamsHandler := NewTeamsHandler(db)
	terraformHandler := NewTerraformHandler(db)
	sessionsHandler := NewSessionsHandler(db, runMgr)

	syncer.Start(context.Background(), 5*time.Minute)

	auth := r.Group("/api")
	auth.Use(AuthMiddleware(jwtSecret))
	{
		// Profile & password — all roles
		auth.GET("/auth/profile", authHandler.Profile)
		auth.PUT("/auth/password", resourcesHandler.ChangePassword)

		// AI config — admin only
		auth.GET("/agent/config", RequireRole("admin"), GetAIConfig)
		auth.PUT("/agent/config", RequireRole("admin"), UpdateAIConfig)
		auth.POST("/agent/config/test", RequireRole("admin"), TestAIConfig)
		auth.GET("/agent/config/:type", RequireRole("admin"), agentConfigHandler.GetConfig)
		auth.PUT("/agent/config/:type", RequireRole("admin"), agentConfigHandler.UpdateConfig)

		// Chat endpoints — all roles (viewer: plan only, enforced in handler)
		chatHandler := NewChatStreamHandler(db, executor, runtime, runMgr)
		eventsHandler := NewEventsSSEHandler(db, runMgr)
		auth.POST("/agent/chat/stream", chatHandler.Stream)
		auth.POST("/agent/chat/confirm", RequireRole("admin", "user"), chatHandler.Confirm)
		auth.POST("/agent/chat/stop", chatHandler.Stop)
		auth.GET("/agent/events", eventsHandler.Stream)

		// Session endpoints — all roles (viewer can view history)
		auth.GET("/agent/sessions", sessionsHandler.List)
		auth.POST("/agent/sessions", sessionsHandler.Create)
		auth.GET("/agent/sessions/:sid", sessionsHandler.Get)
		auth.DELETE("/agent/sessions/:sid", sessionsHandler.Delete)
		auth.PUT("/agent/sessions/:sid", RequireRole("admin", "user"), sessionsHandler.Update)

		// Cloud accounts — read: all roles; write: admin only
		auth.GET("/accounts", accountsHandler.List)
		auth.GET("/accounts/:id", accountsHandler.Get)
		auth.POST("/accounts", RequireRole("admin"), accountsHandler.Create)
		auth.PUT("/accounts/:id", RequireRole("admin"), accountsHandler.Update)
		auth.DELETE("/accounts/:id", RequireRole("admin"), accountsHandler.Delete)

		// Resources — read: all roles; sync/action: admin + user
		auth.GET("/resources", resourcesHandler.List)
		auth.POST("/resources/sync", RequireRole("admin", "user"), resourcesHandler.Sync)
		auth.POST("/resources/:id/:action", RequireRole("admin", "user"), resourcesHandler.Action)
		auth.GET("/stats", resourcesHandler.Stats)

		// Team management — read: all roles; write: admin only
		auth.GET("/teams", teamsHandler.GetTeams)
		auth.GET("/teams/:teamId/members", teamsHandler.GetTeamMembers)
		auth.POST("/teams/:teamId/members", RequireRole("admin"), teamsHandler.AddTeamMember)
		auth.PUT("/teams/:teamId/members/:id", RequireRole("admin"), teamsHandler.UpdateTeamMember)
		auth.PUT("/teams/:teamId/members/:id/password", RequireRole("admin"), teamsHandler.ResetPassword)
		auth.DELETE("/teams/:teamId/members/:id", RequireRole("admin"), teamsHandler.RemoveTeamMember)

		// Terraform templates — read: all roles; write: admin + user
		auth.GET("/terraform/templates", terraformHandler.GetTemplates)
		auth.POST("/terraform/templates", RequireRole("admin", "user"), terraformHandler.CreateTemplate)
		auth.GET("/terraform/templates/:id", terraformHandler.GetTemplate)
		auth.PUT("/terraform/templates/:id", RequireRole("admin", "user"), terraformHandler.UpdateTemplate)
		auth.POST("/terraform/templates/:id/plan", RequireRole("admin", "user"), terraformHandler.PlanTemplate)
		auth.POST("/terraform/templates/:id/apply", RequireRole("admin", "user"), terraformHandler.ApplyTemplate)
		auth.DELETE("/terraform/templates/:id", RequireRole("admin"), terraformHandler.DeleteTemplate)
		auth.POST("/terraform/templates/:id/destroy", RequireRole("admin", "user"), terraformHandler.DestroyTemplate)

		// Vault — admin only
		auth.GET("/vault/health", RequireRole("admin"), func(c *gin.Context) {
			if vaultService == nil {
				c.JSON(http.StatusOK, gin.H{"status": "error", "message": "Vault not initialized"})
				return
			}
			c.JSON(http.StatusOK, vaultService.Health())
		})
		auth.GET("/vault/secrets", RequireRole("admin"), func(c *gin.Context) {
			if vaultService == nil {
				c.JSON(http.StatusOK, gin.H{"secrets": []string{}})
				return
			}
			prefix := c.DefaultQuery("prefix", "")
			paths, err := vaultService.ListSecrets(prefix)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"secrets": paths})
		})
		auth.GET("/vault/secrets/:path", RequireRole("admin"), func(c *gin.Context) {
			if vaultService == nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "vault not available"})
				return
			}
			path := c.Param("path")
			data, err := vaultService.GetSecret(path)
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"path": path, "data": data})
		})
		auth.PUT("/vault/secrets/:path", RequireRole("admin"), func(c *gin.Context) {
			if vaultService == nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "vault not available"})
				return
			}
			path := c.Param("path")
			var body struct {
				Data map[string]interface{} `json:"data" binding:"required"`
			}
			if err := c.ShouldBindJSON(&body); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
				return
			}
			if err := vaultService.SetSecret(path, body.Data); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"ok": true})
		})
		auth.DELETE("/vault/secrets/:path", RequireRole("admin"), func(c *gin.Context) {
			if vaultService == nil {
				c.JSON(http.StatusNotFound, gin.H{"error": "vault not available"})
				return
			}
			path := c.Param("path")
			if err := vaultService.DeleteSecret(path); err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			c.JSON(http.StatusOK, gin.H{"ok": true})
		})
		// Migrate existing plaintext credentials to vault
		auth.POST("/vault/migrate", RequireRole("admin"), func(c *gin.Context) {
			if vaultService == nil {
				c.JSON(http.StatusOK, gin.H{"error": "vault not available", "migrated": 0})
				return
			}
			rows, err := db.Query(`SELECT id, cloud_type, credentials, COALESCE(vault_path, '') FROM cloud_accounts WHERE credentials != '' AND (vault_path IS NULL OR vault_path = '')`)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
				return
			}
			defer rows.Close()
			migrated := 0
			for rows.Next() {
				var id, cloudType, credJSON, vaultPath string
				if err := rows.Scan(&id, &cloudType, &credJSON, &vaultPath); err != nil {
					continue
				}
				vaultPath = fmt.Sprintf("cloud/%s/%s", cloudType, id)
				var credData map[string]interface{}
				if err := json.Unmarshal([]byte(credJSON), &credData); err != nil {
					credData = map[string]interface{}{"raw": credJSON}
				}
				if err := vaultService.SetSecret(vaultPath, credData); err != nil {
					log.Printf("vault migrate: %s: %v", id, err)
					continue
				}
				// Set vault_path and clear plaintext credentials
				db.Exec(`UPDATE cloud_accounts SET vault_path = $1, credentials = '' WHERE id = $2`, vaultPath, id)
				migrated++
			}
			c.JSON(http.StatusOK, gin.H{"migrated": migrated})
		})
	}

	webDir := getWebDir()
	r.StaticFile("/static/login.html", filepath.Join(webDir, "login.html"))
	r.StaticFile("/static/index.html", filepath.Join(webDir, "index.html"))
	r.StaticFile("/static/embedded.js", filepath.Join(webDir, "embedded.js"))
	r.Static("/static/js", filepath.Join(webDir, "js"))

	r.GET("/embedded.js", func(c *gin.Context) {
		serveFileWithType(c, filepath.Join(webDir, "embedded.js"), "application/javascript; charset=utf-8")
	})
	r.GET("/login.html", func(c *gin.Context) {
		serveFile(c, filepath.Join(webDir, "login.html"))
	})
	r.GET("/index.html", func(c *gin.Context) {
		serveFile(c, filepath.Join(webDir, "index.html"))
	})
	r.GET("/", func(c *gin.Context) {
		serveFile(c, filepath.Join(webDir, "index.html"))
	})

	return r
}

func serveFile(c *gin.Context, filePath string) {
	serveFileWithType(c, filePath, "text/html; charset=utf-8")
}

func serveFileWithType(c *gin.Context, filePath string, contentType string) {
	data, err := os.ReadFile(filePath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
		return
	}
	c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
	c.Header("Pragma", "no-cache")
	c.Header("Expires", "0")
	c.Data(http.StatusOK, contentType, data)
}

func getWebDir() string {
	execPath, err := os.Executable()
	if err == nil {
		execDir := filepath.Dir(execPath)
		webDir := filepath.Join(execDir, "web")
		if _, err := os.Stat(webDir); err == nil {
			return webDir
		}
	}
	return "web"
}

func getEnv(key, defaultVal string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return defaultVal
}
