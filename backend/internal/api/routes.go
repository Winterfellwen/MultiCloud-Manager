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
		c.Writer.Header().Set("X-Content-Type-Options", "nosniff")
		c.Writer.Header().Set("X-Frame-Options", "DENY")
		c.Writer.Header().Set("X-XSS-Protection", "1; mode=block")
		c.Writer.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
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
		terraformH := NewTerraformHandler(db)
		terraform := protected.Group("/terraform")
		terraform.Use(RBACMiddleware("admin", "operator"))
		{
			terraform.GET("/templates", terraformH.ListTemplates)
			terraform.POST("/templates", terraformH.UploadTemplate)
			terraform.POST("/templates/:id/plan", terraformH.PlanTemplate)
			terraform.POST("/templates/:id/apply", terraformH.ApplyTemplate)
			terraform.DELETE("/templates/:id", terraformH.DeleteTemplate)
		}

		// Teams (viewer+ for GET, admin for write)
		teamsH := NewTeamsHandler(db)
		teams := protected.Group("/teams")
		{
			teams.GET("/", teamsH.ListTeams)
			teams.GET("/:id", teamsH.GetTeam)
			teamsAdmin := teams.Group("/")
			teamsAdmin.Use(RBACMiddleware("admin"))
			{
				teamsAdmin.POST("/", teamsH.CreateTeam)
				teamsAdmin.PUT("/:id", teamsH.UpdateTeam)
				teamsAdmin.DELETE("/:id", teamsH.DeleteTeam)
				teamsAdmin.POST("/:id/members", teamsH.AddTeamMember)
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

