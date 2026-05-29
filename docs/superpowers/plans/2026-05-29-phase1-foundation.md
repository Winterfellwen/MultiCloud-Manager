# Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up Go project structure, HTTP server (Gin), SQLite database, JWT authentication, and basic API endpoints.

**Architecture:** Go backend with Gin HTTP framework, SQLite for storage, JWT for auth. Clean module separation under `internal/`.

**Tech Stack:** Go 1.22, Gin, SQLite, JWT, bcrypt

---

## File Structure

```
backend/
├── cmd/server/main.go           # Entry point
├── internal/
│   ├── api/
│   │   ├── router.go            # Route registration
│   │   ├── auth.go              # Login/logout endpoints
│   │   └── middleware.go        # Auth middleware
│   ├── config/
│   │   └── config.go            # Config from env
│   └── db/
│       └── db.go                # SQLite init + migrations
├── go.mod
└── go.sum
```

---

### Task 1: Initialize Go Module

**Files:**
- Create: `backend/go.mod`
- Create: `backend/cmd/server/main.go`

- [ ] **Step 1: Create go.mod**

```bash
cd backend
go mod init multicloud
```

- [ ] **Step 2: Create minimal main.go**

```go
package main

import (
	"fmt"
	"os"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8099"
	}
	fmt.Printf("Server starting on :%s\n", port)
}
```

- [ ] **Step 3: Verify it compiles**

```bash
cd backend
go build ./cmd/server/
```

Expected: compiles without errors

- [ ] **Step 4: Commit**

```bash
git add backend/go.mod backend/cmd/server/main.go
git commit -m "feat: initialize Go project structure"
```

---

### Task 2: Add Dependencies

**Files:**
- Modify: `backend/go.mod`

- [ ] **Step 1: Install Gin**

```bash
cd backend
go get github.com/gin-gonic/gin@v1.9.1
```

- [ ] **Step 2: Install SQLite driver**

```bash
go get github.com/mattn/go-sqlite3@v1.14.22
```

- [ ] **Step 3: Install JWT**

```bash
go get github.com/golang-jwt/jwt/v5@v5.2.1
```

- [ ] **Step 4: Install UUID and crypto**

```bash
go get github.com/google/uuid@v1.6.0
go get golang.org/x/crypto@v0.23.0
```

- [ ] **Step 5: Verify deps download**

```bash
go mod tidy
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add backend/go.mod backend/go.sum
git commit -m "feat: add Go dependencies (gin, sqlite, jwt, crypto)"
```

---

### Task 3: Config Module

**Files:**
- Create: `backend/internal/config/config.go`

- [ ] **Step 1: Write config.go**

```go
package config

import "os"

type Config struct {
	Port          string
	DBPath        string
	JWTSecret     string
	AdminPassword string
}

func Load() *Config {
	return &Config{
		Port:          getEnv("PORT", "8099"),
		DBPath:        getEnv("DB_PATH", "multicloud.db"),
		JWTSecret:     getEnv("JWT_SECRET", "dev-secret-change-in-prod"),
		AdminPassword: getEnv("ADMIN_PASSWORD", "test123"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd backend
go build ./internal/config/
```

Expected: compiles without errors

- [ ] **Step 3: Commit**

```bash
git add backend/internal/config/config.go
git commit -m "feat: add config module with env var loading"
```

---

### Task 4: SQLite Database Init

**Files:**
- Create: `backend/internal/db/db.go`

- [ ] **Step 1: Write db.go**

```go
package db

import (
	"database/sql"
	"log"

	_ "github.com/mattn/go-sqlite3"
)

func Init(dbPath string) *sql.DB {
	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL")
	if err != nil {
		log.Fatal("Failed to open database:", err)
	}

	if err := db.Ping(); err != nil {
		log.Fatal("Failed to ping database:", err)
	}

	runMigrations(db)
	return db
}

func runMigrations(db *sql.DB) {
	migrations := []string{
		`CREATE TABLE IF NOT EXISTS sessions (
			id TEXT PRIMARY KEY,
			title TEXT,
			status TEXT DEFAULT 'idle',
			mode TEXT DEFAULT 'plan',
			parent_id TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			archived_at DATETIME,
			share_url TEXT
		)`,
		`CREATE TABLE IF NOT EXISTS messages (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			role TEXT NOT NULL,
			content TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS parts (
			id TEXT PRIMARY KEY,
			message_id TEXT NOT NULL,
			type TEXT NOT NULL,
			content TEXT,
			metadata TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS tool_calls (
			id TEXT PRIMARY KEY,
			part_id TEXT NOT NULL,
			tool_name TEXT NOT NULL,
			params TEXT,
			status TEXT DEFAULT 'pending',
			output TEXT,
			requires_confirm INTEGER DEFAULT 0,
			confirmed_by TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (part_id) REFERENCES parts(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS file_changes (
			id TEXT PRIMARY KEY,
			session_id TEXT NOT NULL,
			message_id TEXT,
			path TEXT NOT NULL,
			action TEXT NOT NULL,
			diff TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
		)`,
		`CREATE TABLE IF NOT EXISTS credentials (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			provider TEXT NOT NULL,
			credential TEXT NOT NULL,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE TABLE IF NOT EXISTS audit_logs (
			id TEXT PRIMARY KEY,
			session_id TEXT,
			action TEXT NOT NULL,
			details TEXT,
			created_at DATETIME DEFAULT CURRENT_TIMESTAMP
		)`,
		`CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_parts_message ON parts(message_id)`,
		`CREATE INDEX IF NOT EXISTS idx_tool_calls_part ON tool_calls(part_id)`,
		`CREATE INDEX IF NOT EXISTS idx_file_changes_session ON file_changes(session_id, created_at)`,
		`CREATE INDEX IF NOT EXISTS idx_audit_logs_session ON audit_logs(session_id, created_at)`,
	}

	for _, m := range migrations {
		if _, err := db.Exec(m); err != nil {
			log.Fatalf("Migration failed: %v\nSQL: %s", err, m)
		}
	}
	log.Println("Database migrations completed")
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd backend
go build ./internal/db/
```

Expected: compiles without errors

- [ ] **Step 3: Commit**

```bash
git add backend/internal/db/db.go
git commit -m "feat: add SQLite database init with schema migrations"
```

---

### Task 5: JWT Auth Middleware

**Files:**
- Create: `backend/internal/api/middleware.go`

- [ ] **Step 1: Write middleware.go**

```go
package api

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func AuthMiddleware(jwtSecret string) gin.HandlerFunc {
	return func(c *gin.Context) {
		authHeader := c.GetHeader("Authorization")
		if authHeader == "" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "missing authorization header"})
			c.Abort()
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid authorization format"})
			c.Abort()
			return
		}

		token, err := jwt.Parse(parts[1], func(t *jwt.Token) (interface{}, error) {
			return []byte(jwtSecret), nil
		})
		if err != nil || !token.Valid {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			c.Abort()
			return
		}

		claims, ok := token.Claims.(jwt.MapClaims)
		if !ok {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid claims"})
			c.Abort()
			return
		}

		c.Set("user_id", claims["sub"])
		c.Next()
	}
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd backend
go build ./internal/api/
```

Expected: compiles without errors

- [ ] **Step 3: Commit**

```bash
git add backend/internal/api/middleware.go
git commit -m "feat: add JWT auth middleware"
```

---

### Task 6: Auth Endpoints

**Files:**
- Create: `backend/internal/api/auth.go`

- [ ] **Step 1: Write auth.go**

```go
package api

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type AuthHandler struct {
	jwtSecret     string
	adminPassword string
}

func NewAuthHandler(jwtSecret, adminPassword string) *AuthHandler {
	return &AuthHandler{
		jwtSecret:     jwtSecret,
		adminPassword: adminPassword,
	}
}

type LoginRequest struct {
	Username string `json:"username" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func (h *AuthHandler) Login(c *gin.Context) {
	var req LoginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	if req.Username != "admin" {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	if err := bcrypt.CompareHashAndPassword(
		[]byte(hashPassword(h.adminPassword)),
		[]byte(req.Password),
	); err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": req.Username,
		"exp": time.Now().Add(24 * time.Hour).Unix(),
	})

	tokenString, err := token.SignedString([]byte(h.jwtSecret))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"token": tokenString})
}

func (h *AuthHandler) Profile(c *gin.Context) {
	userID, _ := c.Get("user_id")
	c.JSON(http.StatusOK, gin.H{"user": userID})
}

func hashPassword(password string) string {
	hash, _ := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	return string(hash)
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd backend
go build ./internal/api/
```

Expected: compiles without errors

- [ ] **Step 3: Commit**

```bash
git add backend/internal/api/auth.go
git commit -m "feat: add auth login and profile endpoints"
```

---

### Task 7: Router Setup

**Files:**
- Create: `backend/internal/api/router.go`

- [ ] **Step 1: Write router.go**

```go
package api

import (
	"github.com/gin-gonic/gin"
)

func SetupRouter(authHandler *AuthHandler, jwtSecret string) *gin.Engine {
	r := gin.Default()

	// CORS
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

	// Auth routes
	r.POST("/api/auth/login", authHandler.Login)

	// Protected routes
	auth := r.Group("/api")
	auth.Use(AuthMiddleware(jwtSecret))
	{
		auth.GET("/auth/profile", authHandler.Profile)
	}

	return r
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd backend
go build ./internal/api/
```

Expected: compiles without errors

- [ ] **Step 3: Commit**

```bash
git add backend/internal/api/router.go
git commit -m "feat: add HTTP router with auth routes"
```

---

### Task 8: Wire Up main.go

**Files:**
- Modify: `backend/cmd/server/main.go`

- [ ] **Step 1: Update main.go**

```go
package main

import (
	"fmt"
	"log"
	"os"

	"multicloud/internal/api"
	"multicloud/internal/config"
	"multicloud/internal/db"
)

func main() {
	cfg := config.Load()

	database := db.Init(cfg.DBPath)
	defer database.Close()

	authHandler := api.NewAuthHandler(cfg.JWTSecret, cfg.AdminPassword)
	router := api.SetupRouter(authHandler, cfg.JWTSecret)

	addr := fmt.Sprintf(":%s", cfg.Port)
	log.Printf("Server starting on %s", addr)
	if err := router.Run(addr); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd backend
go build -o server.exe ./cmd/server/
```

Expected: compiles without errors, creates server.exe

- [ ] **Step 3: Commit**

```bash
git add backend/cmd/server/main.go
git commit -m "feat: wire up main.go with config, db, and router"
```

---

### Task 9: Integration Test

**Files:**
- None (manual test)

- [ ] **Step 1: Start the server**

```bash
cd backend
./server.exe
```

Expected: "Server starting on :8099" and "Database migrations completed"

- [ ] **Step 2: Test login endpoint**

```bash
curl -X POST http://localhost:8099/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"test123"}'
```

Expected: `{"token":"eyJ..."}`

- [ ] **Step 3: Test profile endpoint (without token)**

```bash
curl http://localhost:8099/api/auth/profile
```

Expected: 401 Unauthorized

- [ ] **Step 4: Test profile endpoint (with token)**

```bash
TOKEN=$(curl -s -X POST http://localhost:8099/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"test123"}' | jq -r .token)

curl http://localhost:8099/api/auth/profile \
  -H "Authorization: Bearer $TOKEN"
```

Expected: `{"user":"admin"}`

- [ ] **Step 5: Stop server and commit**

```bash
# Ctrl+C to stop server
git add .
git commit -m "feat: Phase 1 foundation complete - server, db, auth"
```

---

## Verification Checklist

After completing all tasks:
- [ ] Server starts without errors
- [ ] SQLite database created with all tables
- [ ] Login returns JWT token
- [ ] Profile requires auth
- [ ] Profile returns user info with valid token
- [ ] CORS headers present
- [ ] All code compiles cleanly (`go build ./...`)
