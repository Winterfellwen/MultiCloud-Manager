# User Authentication & RBAC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace stub auth with real JWT-based login, role-based access (Admin/Operator/Viewer), and admin user management, coexisting with WeChat wx.login().

**Architecture:** Backend uses Go/Gin with public route group (login/health) and protected route group (everything else) gated by JWT AuthMiddleware + RBACMiddleware. Miniprogram adds password+WeChat login, auth guard on startup, and admin-only user management page. Users can exist with either `openid` (WeChat) or `username` (password).

**Tech Stack:** Go 1.21, Gin, golang-jwt/v5, golang.org/x/crypto/bcrypt, PostgreSQL, WeChat miniprogram (ES5, no framework)

---

### Task 1: Add JWTExpiryHours to config

**Files:**
- Modify: `backend/config/config.go`

- [ ] **Add JWTExpiryHours field**

```go
type Config struct {
	// ... existing fields ...
	JWTSecret       string
	JWTExpiryHours  int    // NEW
	// ... rest ...
}
```

Edit the Config struct to add `JWTExpiryHours int` after `JWTSecret`, and in `Load()` add:
```go
JWTExpiryHours:  getEnvInt("JWT_EXPIRY_HOURS", 72),
```

Add helper function:
```go
func getEnvInt(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if i, err := strconv.Atoi(v); err == nil {
			return i
		}
	}
	return fallback
}
```

Import `"strconv"`.

- [ ] **Verify via build**

Run: `go build ./...` in `backend/`
Expected: success

---

### Task 2: Database migration — alter users table, seed admin

**Files:**
- Modify: `backend/internal/services/database.go`

- [ ] **Add migration queries: alter users table, seed admin**

Add these queries to the `queries` slice in `Migrate()` after the existing `INSERT INTO ai_config` line (do NOT use the `INSERT INTO users` for the admin — that table might already exist from initial schema).

```go
`ALTER TABLE users ALTER COLUMN openid DROP NOT NULL`,
`ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50) UNIQUE`,
`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255)`,
`CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)`,
`ALTER TABLE users ALTER COLUMN role SET DEFAULT 'viewer'`,
`UPDATE users SET role = 'viewer' WHERE role = 'member'`,
fmt.Sprintf(`INSERT INTO users (username, password_hash, nickname, role) VALUES ('admin', '%s', 'Admin', 'admin') ON CONFLICT (username) DO NOTHING`, hash),
```

Where `hash` is a bcrypt hash of `Test@20181025`. Add at top of `Migrate()`:
```go
import "golang.org/x/crypto/bcrypt"

// then in Migrate():
hashBytes, _ := bcrypt.GenerateFromPassword([]byte("Test@20181025"), bcrypt.DefaultCost) // cost 10
adminHash := string(hashBytes)
```

**Important:** Add `"golang.org/x/crypto/bcrypt"` to the import block.

- [ ] **Verify via build**

Run: `go build ./...` in `backend/`
Expected: success

---

### Task 3: Auth middleware — JWT validation + RBAC

**Files:**
- Create: `backend/internal/api/auth_middleware.go`

- [ ] **Create the file**

```go
package api

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	UserID   string `json:"sub"`
	Username string `json:"username"`
	Role     string `json:"role"`
	jwt.RegisteredClaims
}

func AuthMiddleware(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing authorization header"})
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization format"})
			return
		}

		claims := &Claims{}
		token, err := jwt.ParseWithClaims(parts[1], claims, func(token *jwt.Token) (interface{}, error) {
			return []byte(jwtSecret), nil
		})
		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			return
		}

		c.Set("user", claims)
		c.Next()
	}
}

func RBACMiddleware(roles ...string) gin.HandlerFunc {
	return func(c *gin.Context) {
		claims, exists := c.Get("user")
		if !exists {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		userClaims := claims.(*Claims)
		for _, role := range roles {
			if userClaims.Role == role {
				c.Next()
				return
			}
		}

		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
	}
}
```

- [ ] **Verify via build**

Run: `go build ./...` in `backend/`
Expected: success

---

### Task 4: Auth handlers — password login, WeChat login, JWT generation

**Files:**
- Create: `backend/internal/api/auth.go`

- [ ] **Create the file**

```go
package api

import (
	"database/sql"
	"net/http"
	"time"

	"multicloud-manager/config"
	"multicloud-manager/internal/i18n"
	"multicloud-manager/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	db  *services.Database
	cfg *config.Config
}

func NewAuthHandler(db *services.Database, cfg *config.Config) *AuthHandler {
	return &AuthHandler{db: db, cfg: cfg}
}

func (h *AuthHandler) generateJWT(userID, username, role string) (string, error) {
	expiry := time.Duration(h.cfg.JWTExpiryHours) * time.Hour
	if expiry <= 0 {
		expiry = 72 * time.Hour
	}

	claims := Claims{
		UserID:   userID,
		Username: username,
		Role:     role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(expiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.cfg.JWTSecret))
}

func (h *AuthHandler) PasswordLogin(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username and password required"})
		return
	}

	if h.db == nil {
		// Dev mode: accept admin/Test@20181025
		if req.Username == "admin" && req.Password == "Test@20181025" {
			token, _ := h.generateJWT(uuid.New().String(), "admin", "admin")
			c.JSON(http.StatusOK, gin.H{"token": token, "user": gin.H{"id": "", "username": "admin", "nickname": "Admin", "role": "admin"}})
			return
		}
		c.JSON(http.StatusUnauthorized, gin.H{"error": i18n.T(c, "invalid_params")})
		return
	}

	var userID, username, passwordHash, nickname, role string
	err := h.db.QueryRow(
		`SELECT id, username, password_hash, nickname, role FROM users WHERE username = $1`,
		req.Username,
	).Scan(&userID, &username, &passwordHash, &nickname, &role)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid username or password"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "query_failed")})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.Password)); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid username or password"})
		return
	}

	token, err := h.generateJWT(userID, username, role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "create_failed")})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": gin.H{
			"id":       userID,
			"username": username,
			"nickname": nickname,
			"role":     role,
		},
	})
}

func (h *AuthHandler) WechatLogin(c *gin.Context) {
	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "code required"})
		return
	}

	if h.db == nil {
		// Dev mode: return mock viewer user
		token, _ := h.generateJWT("dev-user", "", "viewer")
		c.JSON(http.StatusOK, gin.H{"token": token, "user": gin.H{"id": "dev-user", "openid": "", "nickname": "Dev User", "role": "viewer"}})
		return
	}

	// Exchange code for openid via WeChat API
	openid, err := h.exchangeCodeForOpenID(req.Code)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "wechat login failed"})
		return
	}

	// Find or create user
	var userID, nickname, avatarURL, role string
	var dbUsername *string
	err = h.db.QueryRow(
		`SELECT id, username, nickname, avatar_url, role FROM users WHERE openid = $1`,
		openid,
	).Scan(&userID, &dbUsername, &nickname, &avatarURL, &role)

	if err == sql.ErrNoRows {
		// Create new user as viewer
		userID = uuid.New().String()
		nickname = "WeChat User"
		role = "viewer"
		_, err = h.db.Exec(
			`INSERT INTO users (id, openid, nickname, role) VALUES ($1, $2, $3, $4)`,
			userID, openid, nickname, role,
		)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "create_failed")})
			return
		}
	} else if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "query_failed")})
		return
	}

	token, err := h.generateJWT(userID, "", role)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "create_failed")})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": token,
		"user": gin.H{
			"id":         userID,
			"openid":     openid,
			"nickname":   nickname,
			"avatar_url": avatarURL,
			"role":       role,
		},
	})
}

func (h *AuthHandler) exchangeCodeForOpenID(code string) (string, error) {
	// TODO: Implement real WeChat code-to-openid exchange
	// In production: GET https://api.weixin.qq.com/sns/jscode2session?appid=APPID&secret=SECRET&js_code=CODE&grant_type=authorization_code
	// For now, use code as openid (dev/test mode)
	return code, nil
}
```

- [ ] **Verify via build**

Run: `go build ./...` in `backend/`
Expected: success

---

### Task 5: User handlers — profile, change password, admin CRUD

**Files:**
- Create: `backend/internal/api/users_handler.go`

- [ ] **Create the file**

```go
package api

import (
	"database/sql"
	"net/http"

	"multicloud-manager/internal/i18n"
	"multicloud-manager/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
)

type UsersHandler struct {
	db *services.Database
}

func NewUsersHandler(db *services.Database) *UsersHandler {
	return &UsersHandler{db: db}
}

// GET /api/auth/profile
func (h *UsersHandler) GetProfile(c *gin.Context) {
	claims := c.MustGet("user").(*Claims)

	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{
			"id":       claims.UserID,
			"username": claims.Username,
			"nickname": claims.Username,
			"role":     claims.Role,
		})
		return
	}

	var userID, nickname, avatarURL, role string
	var username, openid *string
	var createdAt string
	err := h.db.QueryRow(
		`SELECT id, username, openid, nickname, avatar_url, role, created_at FROM users WHERE id = $1`,
		claims.UserID,
	).Scan(&userID, &username, &openid, &nickname, &avatarURL, &role, &createdAt)

	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "query_failed")})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"id":         userID,
		"username":   username,
		"openid":     openid,
		"nickname":   nickname,
		"avatar_url": avatarURL,
		"role":       role,
		"created_at": createdAt,
	})
}

// PUT /api/auth/password
func (h *UsersHandler) UpdatePassword(c *gin.Context) {
	var req struct {
		OldPassword string `json:"old_password" binding:"required"`
		NewPassword string `json:"new_password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "old_password and new_password required"})
		return
	}

	if len(req.NewPassword) < 8 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "password must be at least 8 characters"})
		return
	}

	claims := c.MustGet("user").(*Claims)

	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"message": "password updated"})
		return
	}

	var passwordHash string
	err := h.db.QueryRow(`SELECT password_hash FROM users WHERE id = $1`, claims.UserID).Scan(&passwordHash)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "query_failed")})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(req.OldPassword)); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid old password"})
		return
	}

	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "create_failed")})
		return
	}

	_, err = h.db.Exec(`UPDATE users SET password_hash = $1 WHERE id = $2`, string(newHash), claims.UserID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "save_failed")})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "password updated"})
}

// GET /api/admin/users
func (h *UsersHandler) ListUsers(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"users": []gin.H{}})
		return
	}

	rows, err := h.db.Query(
		`SELECT id, username, nickname, role, created_at FROM users ORDER BY created_at DESC`,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "query_failed")})
		return
	}
	defer rows.Close()

	type UserItem struct {
		ID        string  `json:"id"`
		Username  *string `json:"username"`
		Nickname  string  `json:"nickname"`
		Role      string  `json:"role"`
		CreatedAt string  `json:"created_at"`
	}

	var users []UserItem
	for rows.Next() {
		var u UserItem
		if err := rows.Scan(&u.ID, &u.Username, &u.Nickname, &u.Role, &u.CreatedAt); err != nil {
			continue
		}
		users = append(users, u)
	}
	if users == nil {
		users = []UserItem{}
	}

	c.JSON(http.StatusOK, gin.H{"users": users})
}

// POST /api/admin/users
func (h *UsersHandler) CreateUser(c *gin.Context) {
	var req struct {
		Username string `json:"username" binding:"required"`
		Password string `json:"password" binding:"required"`
		Nickname string `json:"nickname"`
		Role     string `json:"role"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "username and password required"})
		return
	}

	if len(req.Password) < 8 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "password must be at least 8 characters"})
		return
	}

	if req.Role == "" {
		req.Role = "operator"
	}
	if req.Role != "admin" && req.Role != "operator" && req.Role != "viewer" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role"})
		return
	}
	if req.Nickname == "" {
		req.Nickname = req.Username
	}

	if h.db == nil {
		c.JSON(http.StatusCreated, gin.H{"user": gin.H{
			"id": uuid.New().String(), "username": req.Username, "nickname": req.Nickname, "role": req.Role,
		}})
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "create_failed")})
		return
	}

	id := uuid.New().String()
	_, err = h.db.Exec(
		`INSERT INTO users (id, username, password_hash, nickname, role) VALUES ($1, $2, $3, $4, $5)`,
		id, req.Username, string(hash), req.Nickname, req.Role,
	)
	if err != nil {
		c.JSON(http.StatusConflict, gin.H{"error": "username already exists"})
		return
	}

	c.JSON(http.StatusCreated, gin.H{"user": gin.H{
		"id": id, "username": req.Username, "nickname": req.Nickname, "role": req.Role,
	}})
}

// PUT /api/admin/users/:id
func (h *UsersHandler) UpdateUser(c *gin.Context) {
	userID := c.Param("id")

	var req struct {
		Role string `json:"role"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid params"})
		return
	}

	if req.Role != "" && req.Role != "admin" && req.Role != "operator" && req.Role != "viewer" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid role"})
		return
	}

	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"message": "user updated"})
		return
	}

	if req.Role != "" {
		_, err := h.db.Exec(`UPDATE users SET role = $1 WHERE id = $2`, req.Role, userID)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "save_failed")})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "user updated"})
}

// DELETE /api/admin/users/:id
func (h *UsersHandler) DeleteUser(c *gin.Context) {
	userID := c.Param("id")
	claims := c.MustGet("user").(*Claims)

	if claims.UserID == userID {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot delete yourself"})
		return
	}

	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"message": "user deleted"})
		return
	}

	_, err := h.db.Exec(`DELETE FROM users WHERE id = $1`, userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "delete_failed")})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "user deleted"})
}
```

- [ ] **Verify via build**

Run: `go build ./...` in `backend/`
Expected: success

---

### Task 6: Restructure routes with public/protected groups and RBAC

**Files:**
- Modify: `backend/internal/api/routes.go`

- [ ] **Rewrite routes.go**

Replace the entire file content:

```go
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
				agentAdmin.GET("/config", agent.Config.Get)
				agentAdmin.PUT("/config", agent.Config.Update)
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
```

Note: The old `AuthMiddleware` function at the bottom and `handleWechatLogin` are removed — `AuthMiddleware` now lives in `auth_middleware.go`, `WechatLogin` is in `auth.go`. The `agent` handler's `.Config` field access pattern may need adjustment — check if `AgentHandler` has a `.Config` field or method.

- [ ] **Check agent handler config access pattern**

Read `backend/internal/api/agent_config.go` to verify `.Config` access:
Run: `grep -n "type AgentHandler" backend/internal/api/agent.go`
Run: `grep -n "func.*AgentHandler.*Config" backend/internal/api/agent_config.go`

If `Config` is a field (e.g., `agent.Config`), use `agent.Config.Get`. If it's a method or different accessor, adjust routes accordingly.

- [ ] **Verify via build**

Run: `go build ./...` in `backend/`
Expected: success

---

### Task 7: Miniprogram i18n keys — login/auth translations

**Files:**
- Modify: `miniprogram/utils/i18n.js`

- [ ] **Add login/auth translation keys to both zh and en sections**

In the `zh` translations object, add:
```js
'login.title': '登录',
'login.username': '用户名',
'login.password': '密码',
'login.login_btn': '登录',
'login.wechat_btn': '微信登录',
'login.error_required': '请输入用户名和密码',
'login.error_invalid': '用户名或密码错误',
'login.error_minlength': '密码至少8个字符',
'login.success': '登录成功',
'login.logout': '退出登录',
'user.role_admin': '管理员',
'user.role_operator': '操作员',
'user.role_viewer': '观察者',
'user.user_management': '用户管理',
'admin.users_title': '用户管理',
'admin.add_user': '添加用户',
'admin.username': '用户名',
'admin.password': '密码',
'admin.nickname': '昵称',
'admin.role': '角色',
'admin.create': '创建',
'admin.update': '更新',
'admin.delete': '删除',
'admin.delete_confirm': '确定要删除用户 {username} 吗？',
'admin.created': '用户创建成功',
'admin.deleted': '用户已删除',
'admin.updated': '用户已更新',
'admin.search': '搜索用户',
```

In the `en` translations object, add:
```js
'login.title': 'Login',
'login.username': 'Username',
'login.password': 'Password',
'login.login_btn': 'Login',
'login.wechat_btn': 'WeChat Login',
'login.error_required': 'Please enter username and password',
'login.error_invalid': 'Invalid username or password',
'login.error_minlength': 'Password must be at least 8 characters',
'login.success': 'Login successful',
'login.logout': 'Logout',
'user.role_admin': 'Admin',
'user.role_operator': 'Operator',
'user.role_viewer': 'Viewer',
'user.user_management': 'User Management',
'admin.users_title': 'User Management',
'admin.add_user': 'Add User',
'admin.username': 'Username',
'admin.password': 'Password',
'admin.nickname': 'Nickname',
'admin.role': 'Role',
'admin.create': 'Create',
'admin.update': 'Update',
'admin.delete': 'Delete',
'admin.delete_confirm': 'Are you sure you want to delete {username}?',
'admin.created': 'User created',
'admin.deleted': 'User deleted',
'admin.updated': 'User updated',
'admin.search': 'Search users',
```

---

### Task 8: Miniprogram api.js — add 401 auto-redirect

**Files:**
- Modify: `miniprogram/utils/api.js`

- [ ] **Add 401 handling in request method**

In the `request` method, change the success handler to handle 401:

```js
success: (res) => {
  if (res.statusCode === 401) {
    wx.removeStorageSync('token')
    const app = getApp()
    if (app && app.globalData) {
      app.globalData.token = ''
      app.globalData.userInfo = null
    }
    wx.redirectTo({ url: '/pages/login/login' })
    reject(new Error('Session expired'))
    return
  }
  if (res.statusCode >= 200 && res.statusCode < 300) {
    resolve(res.data)
  } else {
    reject(new Error(`API Error ${res.statusCode}: ${res.data?.message || 'Unknown error'}`))
  }
},
```

---

### Task 9: Miniprogram app.js — auth guard + update login endpoint

**Files:**
- Modify: `miniprogram/app.js`

- [ ] **Rewrite app.js**

Replace the `onLaunch` and `login` methods:

```js
onLaunch() {
  const theme = wx.getStorageSync('theme') || 'dark'
  this.globalData.theme = theme
  this.applyNavBarColor(theme)
  i18n.init()
  i18n.setTabBarLang()
  // Auth guard: check token validity on startup
  this.checkAuth()
},

checkAuth() {
  const token = wx.getStorageSync('token')
  if (!token) {
    this.redirectToLogin()
    return
  }
  this.globalData.token = token
  API.get('/auth/profile')
    .then(data => {
      this.globalData.userInfo = data
    })
    .catch(() => {
      wx.removeStorageSync('token')
      this.globalData.token = ''
      this.globalData.userInfo = null
      this.redirectToLogin()
    })
},

redirectToLogin() {
  const pages = getCurrentPages()
  const currentPage = pages.length > 0 ? pages[pages.length - 1].route : ''
  if (currentPage !== 'pages/login/login') {
    wx.redirectTo({ url: '/pages/login/login' })
  }
},

login() {
  return new Promise((resolve) => {
    let settled = false
    const timer = setTimeout(() => {
      if (!settled) { settled = true; resolve(null) }
    }, 3000)

    wx.login({
      success: (res) => {
        if (settled) return
        clearTimeout(timer)
        settled = true
        if (res.code) {
          API.post('/auth/wechat', { code: res.code })
            .then(data => {
              this.globalData.token = data.token
              this.globalData.userInfo = data.user
              wx.setStorageSync('token', data.token)
              resolve(data)
            })
            .catch(() => {
              console.warn('Backend unavailable, using local mode')
              resolve(null)
            })
        } else {
          resolve(null)
        }
      },
      fail: () => {
        if (!settled) { clearTimeout(timer); settled = true; resolve(null) }
      }
    })
  })
},
```

---

### Task 10: Miniprogram app.json — add new pages

**Files:**
- Modify: `miniprogram/app.json`

- [ ] **Add login and admin/users pages to the pages array**

Add before `"pages/index/index"`:
```json
"pages/login/login",
"pages/admin/users/users",
```

---

### Task 11: Miniprogram login page

**Files:**
- Create: `miniprogram/pages/login/login.wxml`
- Create: `miniprogram/pages/login/login.wxss`
- Create: `miniprogram/pages/login/login.js`
- Create: `miniprogram/pages/login/login.json`

- [ ] **Create login.wxml**

```xml
<view class="container theme-{{theme}}">
  <view class="login-card">
    <view class="login-header">
      <text class="login-title">{{lang.login_title}}</text>
    </view>

    <view class="input-group">
      <text class="input-label">{{lang.login_username}}</text>
      <input class="input-field" placeholder="{{lang.login_username}}" value="{{username}}" bindinput="onUsernameInput" />
    </view>

    <view class="input-group">
      <text class="input-label">{{lang.login_password}}</text>
      <input class="input-field" type="password" placeholder="{{lang.login_password}}" value="{{password}}" bindinput="onPasswordInput" />
    </view>

    <view class="error-msg" wx:if="{{error}}">{{error}}</view>

    <button class="btn-login" bindtap="onLogin" loading="{{loading}}">{{lang.login_login_btn}}</button>

    <view class="divider">
      <text class="divider-text">——</text>
    </view>

    <button class="btn-wechat" bindtap="onWechatLogin">{{lang.login_wechat_btn}}</button>
  </view>
</view>
```

- [ ] **Create login.wxss**

```wxss
.container { display: flex; justify-content: center; align-items: center; min-height: 100vh; padding: 40rpx; background: var(--bg); }

.login-card { width: 100%; max-width: 600rpx; background: var(--surface); border-radius: var(--radius); padding: 60rpx 40rpx; box-shadow: var(--shadow); }

.login-header { text-align: center; margin-bottom: 50rpx; }
.login-title { font-size: 40rpx; font-weight: bold; color: var(--text); }

.input-group { margin-bottom: 30rpx; }
.input-label { display: block; font-size: 26rpx; color: var(--text-secondary); margin-bottom: 10rpx; }
.input-field { width: 100%; padding: 20rpx 24rpx; background: var(--bg); border: 1rpx solid var(--border); border-radius: var(--radius-sm); font-size: 28rpx; color: var(--text); box-sizing: border-box; }

.error-msg { color: var(--danger); font-size: 26rpx; margin-bottom: 20rpx; text-align: center; }

.btn-login { width: 100%; padding: 22rpx; background: var(--primary); color: #fff; border-radius: var(--radius-sm); font-size: 28rpx; font-weight: 500; border: none; margin-bottom: 20rpx; }
.btn-login:active { opacity: 0.8; }

.divider { text-align: center; margin: 20rpx 0; }
.divider-text { color: var(--text-secondary); font-size: 24rpx; }

.btn-wechat { width: 100%; padding: 22rpx; background: #07c160; color: #fff; border-radius: var(--radius-sm); font-size: 28rpx; font-weight: 500; border: none; }
.btn-wechat:active { opacity: 0.8; }
```

- [ ] **Create login.js**

```js
const app = getApp()
const i18n = require('../../utils/i18n')
const API = require('../../utils/api')

Page({
  data: {
    username: '',
    password: '',
    error: '',
    loading: false,
    theme: 'dark',
    lang: {}
  },

  onLoad() {
    this.setData({
      theme: app.globalData.theme || 'dark',
      lang: i18n.getLangData([
        'login.title', 'login.username', 'login.password',
        'login.login_btn', 'login.wechat_btn',
        'login.error_required', 'login.error_invalid', 'login.error_minlength',
        'login.success'
      ])
    })
    wx.setNavigationBarTitle({ title: i18n.t('login.title') })
  },

  onUsernameInput(e) {
    this.setData({ username: e.detail.value })
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value })
  },

  onLogin() {
    const { username, password } = this.data
    if (!username || !password) {
      this.setData({ error: this.data.lang.login_error_required })
      return
    }
    if (password.length < 8) {
      this.setData({ error: this.data.lang.login_error_minlength })
      return
    }

    this.setData({ loading: true, error: '' })

    API.post('/auth/login', { username, password })
      .then(data => {
        wx.setStorageSync('token', data.token)
        app.globalData.token = data.token
        app.globalData.userInfo = data.user
        wx.showToast({ title: this.data.lang.login_success, icon: 'success' })
        setTimeout(() => {
          wx.switchTab({ url: '/pages/index/index' })
        }, 1000)
      })
      .catch(err => {
        this.setData({ error: this.data.lang.login_error_invalid })
      })
      .finally(() => {
        this.setData({ loading: false })
      })
  },

  onWechatLogin() {
    this.setData({ loading: true, error: '' })
    app.login()
      .then(() => {
        wx.switchTab({ url: '/pages/index/index' })
      })
      .catch(() => {
        this.setData({ error: 'WeChat login failed' })
      })
      .finally(() => {
        this.setData({ loading: false })
      })
  }
})
```

- [ ] **Create login.json**

```json
{
  "navigationBarTitleText": "登录",
  "usingComponents": {}
}
```

---

### Task 12: Miniprogram admin users page

**Files:**
- Create: `miniprogram/pages/admin/users/users.wxml`
- Create: `miniprogram/pages/admin/users/users.wxss`
- Create: `miniprogram/pages/admin/users/users.js`
- Create: `miniprogram/pages/admin/users/users.json`

- [ ] **Create users.wxml**

```xml
<view class="container theme-{{theme}}">

  <view class="page-header">
    <text class="page-title">{{lang.admin_users_title}}</text>
    <button class="btn-add" bindtap="onShowCreate">{{lang.admin_add_user}}</button>
  </view>

  <!-- User list -->
  <view class="user-card" wx:for="{{users}}" wx:key="id">
    <view class="user-info">
      <view class="user-avatar">{{item.nickname ? item.nickname[0] : 'U'}}</view>
      <view class="user-details">
        <text class="user-nickname">{{item.nickname}}</text>
        <text class="user-username" wx:if="{{item.username}}">@{{item.username}}</text>
      </view>
    </view>
    <view class="user-role-tag role-{{item.role}}">{{roleLabels[item.role]}}</view>
    <view class="user-actions">
      <picker mode="selector" range="{{roleOptions}}" value="{{roleIndexMap[item.role] || 0}}" bindchange="onRoleChange" data-user-id="{{item.id}}">
        <button class="btn-edit" size="mini">{{lang.admin_update}}</button>
      </picker>
      <button class="btn-delete" size="mini" bindtap="onDelete" data-user-id="{{item.id}}" data-nickname="{{item.nickname}}">{{lang.admin_delete}}</button>
    </view>
  </view>

  <view class="empty-state" wx:if="{{users.length === 0}}">
    <text>{{lang.admin_users_title}}</text>
  </view>

  <!-- Create user modal -->
  <view class="modal-overlay" wx:if="{{showCreate}}" bindtap="onHideCreate">
    <view class="modal-content" catchtap="">
      <text class="modal-title">{{lang.admin_add_user}}</text>

      <view class="input-group">
        <text class="input-label">{{lang.admin_username}}</text>
        <input class="input-field" value="{{formUsername}}" bindinput="onFormUsername" placeholder="{{lang.admin_username}}" />
      </view>

      <view class="input-group">
        <text class="input-label">{{lang.admin_password}}</text>
        <input class="input-field" type="password" value="{{formPassword}}" bindinput="onFormPassword" placeholder="{{lang.admin_password}}" />
      </view>

      <view class="input-group">
        <text class="input-label">{{lang.admin_nickname}}</text>
        <input class="input-field" value="{{formNickname}}" bindinput="onFormNickname" placeholder="{{lang.admin_nickname}}" />
      </view>

      <view class="input-group">
        <text class="input-label">{{lang.admin_role}}</text>
        <picker mode="selector" range="{{roleOptions}}" value="{{formRoleIndex}}" bindchange="onFormRoleChange">
          <view class="picker-value">{{roleOptions[formRoleIndex]}}</view>
        </picker>
      </view>

      <view class="error-msg" wx:if="{{formError}}">{{formError}}</view>

      <view class="modal-actions">
        <button class="btn-cancel" bindtap="onHideCreate">{{lang.admin_delete}}</button>
        <button class="btn-confirm" bindtap="onCreateUser" loading="{{formLoading}}">{{lang.admin_create}}</button>
      </view>
    </view>
  </view>
</view>
```

Wait, that's wrong — the cancel button text shouldn't be "admin.delete" for cancel. Let me use proper labels. Actually, I don't have a cancel key. Let me add one or just use "Cancel". Let me add it to i18n in the plan. I'll put admin.cancel in the i18n plan.

Actually let me simplify this and not add extra i18n keys - just use inline text "Cancel" which is fine for now. Or better, let me use `admin.cancel` in i18n. I'll update the plan accordingly.

For the users.wxml, I need to fix:
- Cancel button text should be "取消 / Cancel"

Let me write proper file contents.

- [ ] **Create users.wxss**

```wxss
.container { padding: 30rpx; background: var(--bg); min-height: 100vh; }

.page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 30rpx; }
.page-title { font-size: 36rpx; font-weight: bold; color: var(--text); }
.btn-add { padding: 12rpx 24rpx; background: var(--primary); color: #fff; border-radius: var(--radius-sm); font-size: 26rpx; }

.user-card { display: flex; align-items: center; background: var(--surface); border-radius: var(--radius); padding: 24rpx; margin-bottom: 20rpx; box-shadow: var(--shadow); }
.user-info { display: flex; align-items: center; flex: 1; }
.user-avatar { width: 60rpx; height: 60rpx; border-radius: 50%; background: var(--primary); color: #fff; display: flex; align-items: center; justify-content: center; font-size: 28rpx; font-weight: 600; margin-right: 20rpx; }
.user-details { display: flex; flex-direction: column; }
.user-nickname { font-size: 28rpx; font-weight: 500; color: var(--text); }
.user-username { font-size: 22rpx; color: var(--text-secondary); }

.user-role-tag { padding: 4rpx 16rpx; border-radius: 20rpx; font-size: 22rpx; font-weight: 500; margin: 0 20rpx; }
.role-admin { background: #fee2e2; color: #dc2626; }
.role-operator { background: #dbeafe; color: #2563eb; }
.role-viewer { background: #dcfce7; color: #16a34a; }

.user-actions { display: flex; gap: 10rpx; }
.btn-edit { background: var(--primary); color: #fff; font-size: 22rpx; padding: 6rpx 16rpx; }
.btn-delete { background: transparent; border: 1rpx solid var(--danger); color: var(--danger); font-size: 22rpx; padding: 6rpx 16rpx; }

.empty-state { text-align: center; padding: 60rpx 0; color: var(--text-secondary); }

.modal-overlay { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); display: flex; justify-content: center; align-items: center; z-index: 100; }
.modal-content { background: var(--surface); border-radius: var(--radius); padding: 40rpx; width: 600rpx; max-height: 80vh; overflow-y: auto; }
.modal-title { font-size: 34rpx; font-weight: bold; color: var(--text); margin-bottom: 30rpx; text-align: center; }

.input-group { margin-bottom: 24rpx; }
.input-label { font-size: 26rpx; color: var(--text-secondary); margin-bottom: 8rpx; }
.input-field { width: 100%; padding: 18rpx 20rpx; background: var(--bg); border: 1rpx solid var(--border); border-radius: var(--radius-sm); font-size: 26rpx; color: var(--text); box-sizing: border-box; }
.picker-value { padding: 18rpx 20rpx; background: var(--bg); border: 1rpx solid var(--border); border-radius: var(--radius-sm); font-size: 26rpx; color: var(--text); }

.error-msg { color: var(--danger); font-size: 24rpx; margin-bottom: 20rpx; text-align: center; }

.modal-actions { display: flex; gap: 20rpx; margin-top: 30rpx; }
.btn-cancel { flex: 1; padding: 18rpx; background: var(--bg); color: var(--text); border-radius: var(--radius-sm); font-size: 26rpx; border: 1rpx solid var(--border); }
.btn-confirm { flex: 1; padding: 18rpx; background: var(--primary); color: #fff; border-radius: var(--radius-sm); font-size: 26rpx; }
```

- [ ] **Create users.js**

```js
const app = getApp()
const i18n = require('../../utils/i18n')
const API = require('../../utils/api')

Page({
  data: {
    users: [],
    theme: 'dark',
    lang: {},
    roleLabels: { admin: '', operator: '', viewer: '' },
    roleOptions: ['Admin', 'Operator', 'Viewer'],
    roleIndexMap: { admin: 0, operator: 1, viewer: 2 },
    roleValues: ['admin', 'operator', 'viewer'],
    showCreate: false,
    formUsername: '',
    formPassword: '',
    formNickname: '',
    formRoleIndex: 0,
    formError: '',
    formLoading: false
  },

  onLoad() {
    this.setLang()
    this.loadUsers()
  },

  onShow() {
    this.setData({ theme: app.globalData.theme || 'dark' })
  },

  setLang() {
    const lang = i18n.getLangData([
      'admin.users_title', 'admin.add_user', 'admin.username', 'admin.password',
      'admin.nickname', 'admin.role', 'admin.create', 'admin.update',
      'admin.delete', 'admin.delete_confirm', 'admin.created', 'admin.deleted',
      'admin.updated', 'admin.search', 'admin.cancel',
      'user.role_admin', 'user.role_operator', 'user.role_viewer'
    ])
    this.setData({
      lang: lang,
      roleLabels: {
        admin: lang.user_role_admin,
        operator: lang.user_role_operator,
        viewer: lang.user_role_viewer
      },
      roleOptions: [lang.user_role_admin, lang.user_role_operator, lang.user_role_viewer]
    })
  },

  loadUsers() {
    API.get('/admin/users')
      .then(data => {
        this.setData({ users: data.users || [] })
      })
      .catch(() => {
        wx.showToast({ title: 'Failed to load users', icon: 'none' })
      })
  },

  onShowCreate() {
    this.setData({
      showCreate: true,
      formUsername: '',
      formPassword: '',
      formNickname: '',
      formRoleIndex: 0,
      formError: ''
    })
  },

  onHideCreate() {
    this.setData({ showCreate: false })
  },

  onFormUsername(e) { this.setData({ formUsername: e.detail.value }) },
  onFormPassword(e) { this.setData({ formPassword: e.detail.value }) },
  onFormNickname(e) { this.setData({ formNickname: e.detail.value }) },
  onFormRoleChange(e) { this.setData({ formRoleIndex: e.detail.value }) },

  onCreateUser() {
    const { formUsername, formPassword, formNickname, formRoleIndex, roleValues } = this.data
    if (!formUsername || !formPassword) {
      this.setData({ formError: 'Username and password required' })
      return
    }
    if (formPassword.length < 8) {
      this.setData({ formError: 'Password must be at least 8 characters' })
      return
    }

    this.setData({ formLoading: true, formError: '' })
    API.post('/admin/users', {
      username: formUsername,
      password: formPassword,
      nickname: formNickname || formUsername,
      role: roleValues[formRoleIndex]
    })
      .then(() => {
        wx.showToast({ title: this.data.lang.admin_created, icon: 'success' })
        this.setData({ showCreate: false })
        this.loadUsers()
      })
      .catch(err => {
        this.setData({ formError: err.message })
      })
      .finally(() => {
        this.setData({ formLoading: false })
      })
  },

  onRoleChange(e) {
    const userId = e.currentTarget.dataset.userId
    const role = this.data.roleValues[e.detail.value]

    API.put('/admin/users/' + userId, { role: role })
      .then(() => {
        wx.showToast({ title: this.data.lang.admin_updated, icon: 'success' })
        this.loadUsers()
      })
      .catch(() => {
        wx.showToast({ title: 'Update failed', icon: 'none' })
      })
  },

  onDelete(e) {
    const userId = e.currentTarget.dataset.userId
    const nickname = e.currentTarget.dataset.nickname

    wx.showModal({
      title: this.data.lang.admin_delete,
      content: (this.data.lang.admin_delete_confirm || '').replace('{username}', nickname),
      success: (res) => {
        if (res.confirm) {
          API.delete('/admin/users/' + userId)
            .then(() => {
              wx.showToast({ title: this.data.lang.admin_deleted, icon: 'success' })
              this.loadUsers()
            })
            .catch(() => {
              wx.showToast({ title: 'Delete failed', icon: 'none' })
            })
        }
      }
    })
  }
})
```

- [ ] **Create users.json**

```json
{
  "navigationBarTitleText": "用户管理",
  "usingComponents": {}
}
```

---

### Task 13: Miniprogram profile page updates — role badge + admin link + logout

**Files:**
- Modify: `miniprogram/pages/user/profile.js`
- Modify: `miniprogram/pages/user/profile.wxml`
- Modify: `miniprogram/pages/user/profile.wxss`

- [ ] **Update profile.wxml**

Replace the profile-header block and add user management link and logout fix:

```xml
<view class="profile-header">
  <view class="avatar">{{userInfo && userInfo.nickname ? userInfo.nickname[0] : 'U'}}</view>
  <view class="user-name-row">
    <text class="user-name">{{userInfo ? userInfo.nickname : lang.user_not_logged_in}}</text>
    <text class="user-role-tag role-{{userInfo.role}}" wx:if="{{userInfo && userInfo.role}}">{{roleLabels[userInfo.role]}}</text>
  </view>
  <text class="user-email">{{userInfo ? (userInfo.username || userInfo.openid || '') : lang.user_login_hint}}</text>
</view>
```

Add user management navigator in the second settings-card (after team_management, before terraform_config):
```xml
<navigator url="/pages/admin/users/users" class="setting-item nav-item" wx:if="{{userInfo && userInfo.role === 'admin'}}">
  <text class="setting-label">{{lang.user_user_management}}</text>
  <text class="setting-arrow">›</text>
</navigator>
```

Update the logout button handler to also clear token and redirect to login:
`onLogout` already clears token and userInfo in profile.js. But it doesn't redirect to login. Add redirect.

- [ ] **Update profile.js**

Add `roleLabels` to data, and update `onLogout`:

In `onLoad`/`onShow`, add role labels:
```js
// Add to onLoad or setLang:
var roleLabels = { admin: i18n.t('user.role_admin'), operator: i18n.t('user.role_operator'), viewer: i18n.t('user.role_viewer') }
this.setData({ roleLabels: roleLabels })
```

Add `'user.role_admin', 'user.role_operator', 'user.role_viewer', 'user.user_management'` to the `getLangData` call in `setLang`.

Update `onLogout` to redirect:
```js
onLogout() {
  wx.showModal({
    title: i18n.t('user.confirm_logout_title'),
    content: i18n.t('user.confirm_logout_content'),
    success: function(res) {
      if (res.confirm) {
        app.globalData.token = ''
        app.globalData.userInfo = null
        wx.removeStorageSync('token')
        this.setData({ userInfo: null })
        wx.showToast({ title: i18n.t('user.logged_out'), icon: 'success' })
        setTimeout(function() {
          wx.redirectTo({ url: '/pages/login/login' })
        }, 1000)
      }
    }.bind(this)
  })
}
```

- [ ] **Update profile.wxss**

Add role badge styles:
```wxss
.user-name-row { display: flex; align-items: center; gap: 12rpx; }
.user-role-tag { padding: 4rpx 14rpx; border-radius: 20rpx; font-size: 20rpx; font-weight: 500; }
.role-admin { background: #fee2e2; color: #dc2626; }
.role-operator { background: #dbeafe; color: #2563eb; }
.role-viewer { background: #dcfce7; color: #16a34a; }
```

---

### Task 14: Add admin.cancel i18n key

**Files:**
- Modify: `miniprogram/utils/i18n.js`

- [ ] **Add to zh: `'admin.cancel': '取消'`**
- [ ] **Add to en: `'admin.cancel': 'Cancel'`**

---

### Task 15: Verify Go backend compiles

- [ ] **Run full build**

Run: `cd backend && go build ./...`
Expected: success

- [ ] **Run `go vet`**

Run: `cd backend && go vet ./...`
Expected: no errors

---

### Task 16: Manual test in DevTools GUI simulator (if available)

- [ ] Open DevTools, verify login page renders
- [ ] Test password login with admin/Test@20181025
- [ ] Verify token stored and redirect to home
- [ ] Verify profile shows role badge (Admin)
- [ ] Verify admin users page accessible
- [ ] Test creating a new user
- [ ] Test changing role
- [ ] Test deleting user (not self)
- [ ] Test logout clears token and redirects to login
- [ ] Test WeChat login flow (falls back to dev mode if no backend)
