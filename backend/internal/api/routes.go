package api

import (
	"context"
	"time"

	"multicloud-manager/config"
	"multicloud-manager/internal/cloud"
	"multicloud-manager/internal/services"

	"github.com/gin-gonic/gin"
)

func SetupRoutes(router *gin.Engine, db *services.Database, redis *services.RedisClient, cfg *config.Config) {
	// 静态文件 - Web 前端（不设置 JSON Content-Type）
	router.StaticFile("/", "static/index.html")
	router.Static("/static", "static")

	api := router.Group("/api")

	// API 路由统一设置 JSON Content-Type
	api.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Content-Type", "application/json; charset=utf-8")
		c.Next()
	})

	// 认证中间件
	api.Use(AuthMiddleware(cfg.JWTSecret))

	// 健康检查
	api.GET("/health", func(c *gin.Context) {
		c.JSON(200, gin.H{"status": "ok"})
	})

	// 统计
	statsH := NewStatsHandler(db)
	api.GET("/stats", statsH.GetStats)

	// 调试
	api.GET("/debug/db", func(c *gin.Context) {
		if db == nil {
			c.JSON(200, gin.H{"db": nil})
			return
		}
		var tableCount int
		db.QueryRow("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'").Scan(&tableCount)
		tables := []string{}
		rows, err := db.Query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")
		if err == nil {
			defer rows.Close()
			for rows.Next() {
				var name string
				rows.Scan(&name)
				tables = append(tables, name)
			}
		}
		c.JSON(200, gin.H{"db": "connected", "tables": tables, "table_count": tableCount})
	})

	// AI Agent 路由
	agent := NewAgentHandler(db, redis)
	agentGroup := api.Group("/agent")
	{
		agentGroup.POST("/chat", agent.Chat)
		agentGroup.POST("/execute", agent.Execute)
		agentGroup.GET("/sessions", agent.ListSessions)
		agentGroup.GET("/sessions/:id", agent.SessionDetail)
	}

	// 云账户管理
	accountsH := NewAccountsHandler(db)
	accounts := api.Group("/accounts")
	{
		accounts.GET("/", accountsH.List)
		accounts.POST("/", accountsH.Add)
		accounts.PUT("/:id", accountsH.Update)
		accounts.DELETE("/:id", accountsH.Delete)
		accounts.POST("/:id/sync", accountsH.Sync)
	}

	// 资源管理
	syncer := &cloud.Syncer{}
	if db != nil {
		syncer = &cloud.Syncer{DB: db}
		syncer.Start(context.Background(), 60*time.Second)
	}
	resourcesH := NewResourcesHandler(syncer)
	resources := api.Group("/resources")
	{
		resources.GET("/", resourcesH.List)
		resources.POST("/sync", resourcesH.Sync)
		resources.GET("/deletions", resourcesH.ListDeletions)
		resources.GET("/:id", resourcesH.Detail)
		resources.POST("/:id/start", resourcesH.Start)
		resources.POST("/:id/stop", resourcesH.Stop)
		resources.POST("/:id/restart", resourcesH.Restart)
	}

	// Terraform 管理
	terraform := api.Group("/terraform")
	{
		terraform.GET("/templates", handleListTemplates)
		terraform.POST("/templates", handleUploadTemplate)
		terraform.POST("/templates/:id/plan", handlePlanTemplate)
		terraform.POST("/templates/:id/apply", handleApplyTemplate)
	}

	// 团队管理
	teams := api.Group("/teams")
	{
		teams.GET("/", handleListTeams)
		teams.POST("/", handleCreateTeam)
		teams.POST("/:id/members", handleAddTeamMember)
	}

	// 微信登录
	router.POST("/api/auth/login", handleWechatLogin)
}

// 占位符处理函数 (Terraform, Teams, Auth)
func handleListTemplates(c *gin.Context)    { c.JSON(200, gin.H{"templates": []gin.H{}}) }
func handleUploadTemplate(c *gin.Context)   { c.JSON(200, gin.H{"message": "upload template"}) }
func handlePlanTemplate(c *gin.Context)     { c.JSON(200, gin.H{"message": "plan template"}) }
func handleApplyTemplate(c *gin.Context)    { c.JSON(200, gin.H{"message": "apply template"}) }
func handleListTeams(c *gin.Context)        { c.JSON(200, gin.H{"members": []gin.H{}}) }
func handleCreateTeam(c *gin.Context)       { c.JSON(200, gin.H{"message": "create team"}) }
func handleAddTeamMember(c *gin.Context)    { c.JSON(200, gin.H{"message": "add team member"}) }
func handleWechatLogin(c *gin.Context)      { c.JSON(200, gin.H{"message": "wechat login"}) }

func AuthMiddleware(secret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Next()
	}
}