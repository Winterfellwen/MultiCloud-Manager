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
	router.StaticFile("/", "static/index.html")
	router.Static("/static", "static")

	api := router.Group("/api")
	api.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Content-Type", "application/json; charset=utf-8")
		c.Next()
	})

	// Public routes (no auth)
	public := api.Group("/")
	{
		authH := NewAuthHandler(db, cfg)
		public.POST("/auth/login", authH.PasswordLogin)
		public.POST("/auth/wechat", authH.WechatLogin)
		public.GET("/health", func(c *gin.Context) {
			c.JSON(200, gin.H{"status": "ok"})
		})
	}

	// Protected routes (require valid JWT)
	protected := api.Group("/")
	protected.Use(AuthMiddleware(cfg.JWTSecret))
	{
		statsH := NewStatsHandler(db)
		protected.GET("/stats", statsH.GetStats)

		protected.GET("/debug/db", func(c *gin.Context) {
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

		// Auth profile (viewer+)
		profileH := NewUsersHandler(db)
		protected.GET("/auth/profile", profileH.GetProfile)
		protected.PUT("/auth/password", profileH.UpdatePassword)

		// Agent routes
		agent := NewAgentHandler(db, redis)
		agentGroup := protected.Group("/agent")
		{
			agentGroup.POST("/chat", agent.Chat)
			agentGroup.GET("/sessions", agent.ListSessions)
			agentGroup.GET("/sessions/:id", agent.SessionDetail)

			// Operator+
			agentOp := agentGroup.Group("/")
			agentOp.Use(RBACMiddleware("admin", "operator"))
			{
				agentOp.POST("/execute", agent.Execute)
			}

			// Admin only
			agentAdmin := agentGroup.Group("/")
			agentAdmin.Use(RBACMiddleware("admin"))
			{
				agentAdmin.GET("/config", agent.config.Get)
				agentAdmin.PUT("/config", agent.config.Update)
			}
		}

		// Cloud accounts (operator+)
		accountsH := NewAccountsHandler(db)
		accounts := protected.Group("/accounts")
		accounts.Use(RBACMiddleware("admin", "operator"))
		{
			accounts.GET("/", accountsH.List)
			accounts.POST("/", accountsH.Add)
			accounts.PUT("/:id", accountsH.Update)
			accounts.DELETE("/:id", accountsH.Delete)
			accounts.POST("/:id/sync", accountsH.Sync)
		}

		// Resources
		syncer := &cloud.Syncer{}
		if db != nil {
			syncer = &cloud.Syncer{DB: db}
			syncer.Start(context.Background(), 60*time.Second)
		}
		resourcesH := NewResourcesHandler(syncer)
		resources := protected.Group("/resources")
		{
			resources.GET("/", resourcesH.List)
			resources.POST("/sync", resourcesH.Sync)
			resources.GET("/deletions", resourcesH.ListDeletions)
			resources.GET("/:id", resourcesH.Detail)

			// Operator+ for resource actions
			resourcesOp := resources.Group("/")
			resourcesOp.Use(RBACMiddleware("admin", "operator"))
			{
				resourcesOp.POST("/:id/start", resourcesH.Start)
				resourcesOp.POST("/:id/stop", resourcesH.Stop)
				resourcesOp.POST("/:id/restart", resourcesH.Restart)
			}
		}

		// Terraform (operator+)
		terraform := protected.Group("/terraform")
		terraform.Use(RBACMiddleware("admin", "operator"))
		{
			terraform.GET("/templates", handleListTemplates)
			terraform.POST("/templates", handleUploadTemplate)
			terraform.POST("/templates/:id/plan", handlePlanTemplate)
			terraform.POST("/templates/:id/apply", handleApplyTemplate)
		}

		// Teams (viewer+ for GET, admin for write)
		teams := protected.Group("/teams")
		{
			teams.GET("/", handleListTeams)
			teamsAdmin := teams.Group("/")
			teamsAdmin.Use(RBACMiddleware("admin"))
			{
				teamsAdmin.POST("/", handleCreateTeam)
				teamsAdmin.POST("/:id/members", handleAddTeamMember)
			}
		}

		// Admin user management (admin only)
		usersH := NewUsersHandler(db)
		adminUsers := protected.Group("/admin/users")
		adminUsers.Use(RBACMiddleware("admin"))
		{
			adminUsers.GET("/", usersH.ListUsers)
			adminUsers.POST("/", usersH.CreateUser)
			adminUsers.PUT("/:id", usersH.UpdateUser)
			adminUsers.DELETE("/:id", usersH.DeleteUser)
		}
	}
}

func handleListTemplates(c *gin.Context)    { c.JSON(200, gin.H{"templates": []gin.H{}}) }
func handleUploadTemplate(c *gin.Context)   { c.JSON(200, gin.H{"message": "upload template"}) }
func handlePlanTemplate(c *gin.Context)     { c.JSON(200, gin.H{"message": "plan template"}) }
func handleApplyTemplate(c *gin.Context)    { c.JSON(200, gin.H{"message": "apply template"}) }
func handleListTeams(c *gin.Context)        { c.JSON(200, gin.H{"members": []gin.H{}}) }
func handleCreateTeam(c *gin.Context)       { c.JSON(200, gin.H{"message": "create team"}) }
func handleAddTeamMember(c *gin.Context)    { c.JSON(200, gin.H{"message": "add team member"}) }
