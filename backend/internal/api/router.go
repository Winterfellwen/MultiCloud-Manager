package api

import (
	"database/sql"
	"io/ioutil"
	"net/http"
	"os"
	"path/filepath"

	"github.com/gin-gonic/gin"
)

func SetupRouter(authHandler *AuthHandler, jwtSecret string, db *sql.DB) *gin.Engine {
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

	auth := r.Group("/api")
	auth.Use(AuthMiddleware(jwtSecret))
	{
		auth.GET("/auth/profile", authHandler.Profile)
		auth.GET("/agent/config", GetAIConfig)
		auth.PUT("/agent/config", UpdateAIConfig)
		auth.POST("/agent/chat/stream", chatHandler.Stream)
	}

	webDir := getWebDir()
	r.Static("/static", webDir)

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
	data, err := ioutil.ReadFile(filePath)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
		return
	}
	c.Data(http.StatusOK, "text/html; charset=utf-8", data)
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
