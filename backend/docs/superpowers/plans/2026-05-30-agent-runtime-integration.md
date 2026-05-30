# Agent Runtime Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate Agent Runtime into Chat API and add agent config API endpoints for shell/mcp/skill configuration.

**Architecture:** We will modify `ChatStreamHandler` to accept `*agent.Runtime` instead of `*agent.Executor`, update router to create ToolRegistry and Runtime, and add new endpoints for agent configuration stored in `agent_config` table.

**Tech Stack:** Go, Gin, PostgreSQL (JSONB), Agent Runtime

---

## Task 1: Add GetSystemPrompt method to Runtime

**Files:**
- Modify: `internal/agent/runtime.go:100-105`

- [ ] **Step 1: Add GetSystemPrompt method**

Add after BuildPrompt method:

```go
// GetSystemPrompt builds the system prompt for the given mode.
func (r *Runtime) GetSystemPrompt(mode string) string {
	prompt := r.prompt
	if mode != "" {
		prompt = prompt.SetMode(mode)
	}
	return prompt.Build()
}
```

- [ ] **Step 2: Verify it compiles**

Run: `go build ./internal/agent/...`

---

## Task 2: Update ChatStreamHandler to use Runtime

**Files:**
- Modify: `internal/api/chat.go:28-35`
- Modify: `internal/api/chat.go:164`

- [ ] **Step 1: Add runtime field and update constructor**

Replace lines 28-35 with:

```go
type ChatStreamHandler struct {
	db       *sql.DB
	executor *agent.Executor
	runtime  *agent.Runtime
}

func NewChatStreamHandler(db *sql.DB, executor *agent.Executor, runtime *agent.Runtime) *ChatStreamHandler {
	return &ChatStreamHandler{db: db, executor: executor, runtime: runtime}
}
```

- [ ] **Step 2: Update Stream() to use runtime.GetSystemPrompt**

Replace line 63:
```go
systemPrompt := buildSystemPrompt(req.Mode)
```
with:
```go
systemPrompt := h.runtime.GetSystemPrompt(req.Mode)
```

- [ ] **Step 3: Update Stream() to use runtime.GetToolDefinitions**

Replace line 77:
```go
"tools":    agent.GetToolDefinitions(),
```
with:
```go
"tools":    h.runtime.GetToolDefinitions(),
```

- [ ] **Step 4: Update Stream() to use runtime.ExecuteTool**

Replace lines 158-165:
```go
var toolArgs map[string]interface{}
if err := json.Unmarshal([]byte(toolArgsStr), &toolArgs); err != nil {
	toolArgs = map[string]interface{}{}
}

// Execute the tool
result, execErr := h.executor.ExecuteTool(c.Request.Context(), toolName, toolArgs)
```
with:
```go
var toolArgs map[string]interface{}
if err := json.Unmarshal([]byte(toolArgsStr), &toolArgs); err != nil {
	toolArgs = map[string]interface{}{}
}

// Execute the tool
result, execErr := h.runtime.ExecuteTool(c.Request.Context(), toolName, toolArgs)
```

- [ ] **Step 5: Update Chat() similarly**

Replace line 210:
```go
systemPrompt := buildSystemPrompt(req.Mode)
```
with:
```go
systemPrompt := h.runtime.GetSystemPrompt(req.Mode)
```

Replace line 225:
```go
"tools":    agent.GetToolDefinitions(),
```
with:
```go
"tools":    h.runtime.GetToolDefinitions(),
```

Replace line 311:
```go
result, execErr := h.executor.ExecuteTool(c.Request.Context(), toolName, toolArgs)
```
with:
```go
result, execErr := h.runtime.ExecuteTool(c.Request.Context(), toolName, toolArgs)
```

- [ ] **Step 6: Verify compilation**

Run: `go build ./internal/api/...`

---

## Task 3: Update Router to create Runtime

**Files:**
- Modify: `internal/api/router.go:18-42`

- [ ] **Step 1: Add vault import**

Add to imports:
```go
"multicloud/internal/vault"
```

- [ ] **Step 2: Update SetupRouter to create Runtime**

Replace lines 34-36:
```go
syncer := cloud.NewSyncer(db)
executor := agent.NewExecutor(syncer, db)
chatHandler := NewChatStreamHandler(db, executor)
```
with:
```go
syncer := cloud.NewSyncer(db)
executor := agent.NewExecutor(syncer, db)

// Create Vault client (optional)
var vaultClient *vault.Client
vaultAddr := os.Getenv("VAULT_ADDR")
if vaultAddr != "" {
    vaultClient = vault.NewClient(vault.Config{Addr: vaultAddr})
}

runtime := agent.NewRuntime(agent.RuntimeConfig{
    DB:     db,
    Syncer: syncer,
    Vault:  vaultClient,
})

chatHandler := NewChatStreamHandler(db, executor, runtime)
```

- [ ] **Step 3: Verify compilation**

Run: `go build ./internal/api/...`

---

## Task 4: Create agent_config table migration

**Files:**
- Modify: `internal/db/db.go:189-191`

- [ ] **Step 1: Add agent_config table migration**

Add before the closing bracket of queries slice (around line 190):
```go
`CREATE TABLE IF NOT EXISTS agent_config (
    id SERIAL PRIMARY KEY,
    config_type VARCHAR(50) NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(config_type)
)`,
```

- [ ] **Step 2: Add default configs**

Add after the CREATE TABLE:
```go
`INSERT INTO agent_config (config_type, config) VALUES 
    ('shell', '{"workspace_dir": "/workspace", "timeout_seconds": 300}'),
    ('mcp', '{}'),
    ('skills', '[]')
ON CONFLICT (config_type) DO NOTHING`,
```

- [ ] **Step 3: Verify migration compiles**

Run: `go build ./internal/db/...`

---

## Task 5: Create agent config API handler

**Files:**
- Create: `internal/api/agent_runtime_config.go`

- [ ] **Step 1: Create the file**

```go
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
```

- [ ] **Step 2: Verify compilation**

Run: `go build ./internal/api/...`

---

## Task 6: Register agent config routes

**Files:**
- Modify: `internal/api/router.go:44-84`

- [ ] **Step 1: Create AgentConfigHandler**

Replace line 37:
```go
accountsHandler := NewAccountsHandler(db)
```
with:
```go
accountsHandler := NewAccountsHandler(db)
agentConfigHandler := NewAgentConfigHandler(db)
```

- [ ] **Step 2: Add routes**

Add after line 51 (after the AI config routes):
```go
auth.GET("/agent/config/:type", agentConfigHandler.GetConfig)
auth.PUT("/agent/config/:type", agentConfigHandler.UpdateConfig)
```

- [ ] **Step 3: Verify compilation**

Run: `go build ./internal/api/...`

---

## Task 7: Full build verification

- [ ] **Step 1: Build entire project**

Run: `go build ./...`

- [ ] **Step 2: Run tests if they exist**

Run: `go test ./...`

- [ ] **Step 3: Commit changes**

```bash
git add -A
git commit -m "feat: integrate agent runtime and add config API endpoints"
```

---

## Task 8: Report completion

- [ ] **Step 1: Document what was done**

Report back to user:
- Integrated `*agent.Runtime` into `ChatStreamHandler`
- Updated `Stream()` and `Chat()` to use runtime methods
- Created `agent_config` table for storing shell/mcp/skills config
- Added `GET/PUT /api/agent/config/:type` endpoints
- All code compiles and tests pass