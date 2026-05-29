package api

import (
	"context"
	"database/sql"
	"io/ioutil"
	"net/http"
	"os"
	"path/filepath"
	"time"

	"multicloud/internal/cloud"

	"github.com/gin-gonic/gin"
)

func SetupRouter(authHandler *AuthHandler, jwtSecret string, db *sql.DB, isPostgres bool) *gin.Engine {
	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	r.POST("/api/auth/login", authHandler.Login)

	chatHandler := NewChatStreamHandler(db)

	syncer := cloud.NewSyncer(db, isPostgres)
	accountsHandler := NewAccountsHandler(db, isPostgres)
	resourcesHandler := NewResourcesHandler(syncer, db, isPostgres)
	teamsHandler := NewTeamsHandler(db, isPostgres)
	sessionsHandler := NewSessionsHandler(db, isPostgres)

	syncer.Start(context.Background(), 5*time.Minute)

	auth := r.Group("/api")
	auth.Use(AuthMiddleware(jwtSecret))
	{
		auth.GET("/auth/profile", authHandler.Profile)
		auth.PUT("/auth/password", resourcesHandler.ChangePassword)
		auth.GET("/agent/config", GetAIConfig)
		auth.PUT("/agent/config", UpdateAIConfig)
		auth.POST("/agent/config/test", TestAIConfig)
		auth.POST("/agent/chat/stream", chatHandler.Stream)
		auth.GET("/agent/sessions", sessionsHandler.List)
		auth.POST("/agent/sessions", sessionsHandler.Create)
		auth.GET("/agent/sessions/:sid", sessionsHandler.Get)
		auth.DELETE("/agent/sessions/:sid", sessionsHandler.Delete)
		auth.GET("/accounts", accountsHandler.List)
		auth.POST("/accounts", accountsHandler.Create)
		auth.PUT("/accounts/:id", accountsHandler.Update)
		auth.DELETE("/accounts/:id", accountsHandler.Delete)
		auth.GET("/resources", resourcesHandler.List)
		auth.POST("/resources/sync", resourcesHandler.Sync)
		auth.POST("/resources/:id/:action", resourcesHandler.Action)
		auth.GET("/stats", resourcesHandler.Stats)
		// 团队管理端点
		auth.GET("/teams", teamsHandler.GetTeams)
		auth.GET("/teams/:teamId/members", teamsHandler.GetTeamMembers)
		auth.POST("/teams/:teamId/members", teamsHandler.AddTeamMember)
		auth.DELETE("/teams/:teamId/members/:id", teamsHandler.RemoveTeamMember)
		// Terraform模板端点
		auth.GET("/terraform/templates", GetTerraformTemplatesHandler)
		auth.POST("/terraform/templates", CreateTerraformTemplateHandler)
		auth.GET("/terraform/templates/:id", GetTerraformTemplateHandler)
		auth.POST("/terraform/templates/:id/plan", PlanTerraformTemplateHandler)
		auth.POST("/terraform/templates/:id/apply", ApplyTerraformTemplateHandler)
		auth.DELETE("/terraform/templates/:id", DestroyTerraformTemplateHandler)
		auth.POST("/terraform/templates/:id/destroy", DestroyTerraformTemplateHandler)
	}

	webDir := getWebDir()
	r.Static("/static", webDir)

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
	data, err := ioutil.ReadFile(filePath)
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
		webDir := filepath.Join(execDir, "..", "web")
		if _, err := os.Stat(webDir); err == nil {
			return webDir
		}
	}
	return "../web"
}
