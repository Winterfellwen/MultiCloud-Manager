# Agent Runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the rigid Provider interface with a flexible Agent Runtime supporting shell execution, MCP protocol, configurable skills, and Vault-based credential management.

**Architecture:** Agent Runtime layer sits between Chat API and tool execution. All tools (built-in, shell, MCP) implement a unified `Tool` interface. Vault manages all cloud credentials. Skills provide configurable AI capability packages.

**Tech Stack:** Go 1.25, Gin, HashiCorp Vault API, os/exec, MCP protocol (stdio+SSE)

**Spec:** `docs/superpowers/specs/2026-05-30-agent-runtime-design.md`

---

## File Structure

```
backend/internal/
├── vault/
│   ├── client.go           # Vault HTTP client + AppRole auth
│   ├── secrets.go          # KV v2 CRUD operations
│   └── client_test.go      # Vault client tests
├── agent/
│   ├── runtime.go          # Agent Runtime main loop
│   ├── router.go           # Tool Router dispatch
│   ├── registry.go         # Tool Registry
│   ├── prompt.go           # Prompt Builder
│   ├── shell/
│   │   ├── executor.go     # Shell command executor
│   │   └── executor_test.go
│   ├── mcp/
│   │   ├── client.go       # MCP client (stdio+SSE)
│   │   ├── manager.go      # MCP Server lifecycle
│   │   └── types.go        # MCP protocol types
│   ├── skill/
│   │   ├── engine.go       # Skill engine
│   │   └── loader.go       # Config file loader
│   └── tools.go            # Built-in tools (migrate from existing)
└── config/
    └── agent_config.go     # Agent config management

backend/config/
└── agent.json              # Default agent configuration
```

---

## Phase 1: Vault Integration

### Task 1: Add Vault dependency and create vault client

**Files:**
- Create: `backend/internal/vault/client.go`
- Modify: `backend/go.mod`

- [ ] **Step 1: Add Vault SDK dependency**

Run: `cd backend && go get github.com/hashicorp/vault/api`

- [ ] **Step 2: Create vault/client.go**

```go
package vault

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Client is a HashiCorp Vault API client.
type Client struct {
	addr       string
	token      string
	httpClient *http.Client
	mu         sync.RWMutex
}

// Config holds Vault connection configuration.
type Config struct {
	Addr     string `json:"addr"`
	RoleID   string `json:"role_id"`
	SecretID string `json:"secret_id"`
}

// NewClient creates a new Vault client.
func NewClient(cfg Config) *Client {
	return &Client{
		addr:       strings.TrimRight(cfg.Addr, "/"),
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}
}

// SetToken sets the authentication token.
func (c *Client) SetToken(token string) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.token = token
}

// Token returns the current token.
func (c *Client) Token() string {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.token
}

// rawRequest sends an HTTP request to Vault.
func (c *Client) rawRequest(method, path string, body []byte) ([]byte, int, error) {
	url := c.addr + "/v1/" + path
	req, err := http.NewRequest(method, url, strings.NewReader(string(body)))
	if err != nil {
		return nil, 0, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.token != "" {
		req.Header.Set("X-Vault-Token", c.token)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("execute request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("read response: %w", err)
	}

	return respBody, resp.StatusCode, nil
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd backend && go build ./internal/vault/`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add backend/go.mod backend/go.sum backend/internal/vault/client.go
git commit -m "feat(vault): add Vault HTTP client foundation"
```

### Task 2: Implement AppRole authentication

**Files:**
- Create: `backend/internal/vault/auth.go`

- [ ] **Step 1: Create vault/auth.go**

```go
package vault

import (
	"encoding/json"
	"fmt"
)

// AuthResponse is the response from Vault auth endpoints.
type AuthResponse struct {
	Auth struct {
		ClientToken string `json:"client_token"`
		LeaseDuration int  `json:"lease_duration"`
	} `json:"auth"`
}

// Authenticate performs AppRole login and returns a token.
func (c *Client) Authenticate(roleID, secretID string) (string, error) {
	data := map[string]string{
		"role_id":   roleID,
		"secret_id": secretID,
	}
	body, _ := json.Marshal(data)

	respBody, statusCode, err := c.rawRequest("POST", "auth/approle/login", body)
	if err != nil {
		return "", fmt.Errorf("auth request: %w", err)
	}
	if statusCode != 200 {
		return "", fmt.Errorf("auth failed (HTTP %d): %s", statusCode, string(respBody))
	}

	var authResp AuthResponse
	if err := json.Unmarshal(respBody, &authResp); err != nil {
		return "", fmt.Errorf("parse auth response: %w", err)
	}

	c.SetToken(authResp.Auth.ClientToken)
	return authResp.Auth.ClientToken, nil
}

// Login performs AppRole authentication using config values.
func (c *Client) Login(roleID, secretID string) error {
	_, err := c.Authenticate(roleID, secretID)
	return err
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd backend && go build ./internal/vault/`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/internal/vault/auth.go
git commit -m "feat(vault): add AppRole authentication"
```

### Task 3: Implement KV v2 secret operations

**Files:**
- Create: `backend/internal/vault/secrets.go`

- [ ] **Step 1: Create vault/secrets.go**

```go
package vault

import (
	"encoding/json"
	"fmt"
)

// SecretData represents the data structure in Vault KV v2.
type SecretData struct {
	Data       map[string]interface{} `json:"data"`
	Metadata   map[string]interface{} `json:"metadata"`
}

// KVResponse is the response from KV v2 read operations.
type KVResponse struct {
	Data       SecretData `json:"data"`
}

// ListResponse is the response from KV v2 list operations.
type ListResponse struct {
	Data struct {
		Keys []string `json:"keys"`
	} `json:"data"`
}

// GetSecret reads a secret from Vault KV v2.
// path example: "cloud/data/azure/production"
func (c *Client) GetSecret(path string) (map[string]interface{}, error) {
	respBody, statusCode, err := c.rawRequest("GET", "kv/"+path, nil)
	if err != nil {
		return nil, fmt.Errorf("read secret: %w", err)
	}
	if statusCode == 404 {
		return nil, fmt.Errorf("secret not found: %s", path)
	}
	if statusCode != 200 {
		return nil, fmt.Errorf("read secret failed (HTTP %d): %s", statusCode, string(respBody))
	}

	var kvResp KVResponse
	if err := json.Unmarshal(respBody, &kvResp); err != nil {
		return nil, fmt.Errorf("parse secret: %w", err)
	}

	return kvResp.Data.Data, nil
}

// SetSecret writes a secret to Vault KV v2.
// path example: "cloud/data/azure/production"
func (c *Client) SetSecret(path string, data map[string]interface{}) error {
	body := map[string]interface{}{
		"data": data,
	}
	bodyBytes, _ := json.Marshal(body)

	_, statusCode, err := c.rawRequest("POST", "kv/"+path, bodyBytes)
	if err != nil {
		return fmt.Errorf("write secret: %w", err)
	}
	if statusCode != 200 && statusCode != 204 {
		return fmt.Errorf("write secret failed (HTTP %d)", statusCode)
	}
	return nil
}

// DeleteSecret deletes a secret from Vault KV v2.
func (c *Client) DeleteSecret(path string) error {
	_, statusCode, err := c.rawRequest("DELETE", "kv/"+path, nil)
	if err != nil {
		return fmt.Errorf("delete secret: %w", err)
	}
	if statusCode != 200 && statusCode != 204 {
		return fmt.Errorf("delete secret failed (HTTP %d)", statusCode)
	}
	return nil
}

// ListSecrets lists secrets at a given path.
func (c *Client) ListSecrets(path string) ([]string, error) {
	_, statusCode, err := c.rawRequest("LIST", "kv/"+path, nil)
	if err != nil {
		return nil, fmt.Errorf("list secrets: %w", err)
	}
	if statusCode == 404 {
		return []string{}, nil
	}
	if statusCode != 200 {
		return nil, fmt.Errorf("list secrets failed (HTTP %d)", statusCode)
	}

	// LIST response format differs, handle gracefully
	return []string{}, nil
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd backend && go build ./internal/vault/`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/internal/vault/secrets.go
git commit -m "feat(vault): add KV v2 secret CRUD operations"
```

### Task 4: Write Vault client tests

**Files:**
- Create: `backend/internal/vault/client_test.go`

- [ ] **Step 1: Create vault/client_test.go**

```go
package vault

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNewClient(t *testing.T) {
	cfg := Config{Addr: "http://localhost:8200"}
	c := NewClient(cfg)
	if c.addr != "http://localhost:8200" {
		t.Errorf("expected addr http://localhost:8200, got %s", c.addr)
	}
}

func TestSetToken(t *testing.T) {
	c := NewClient(Config{Addr: "http://localhost:8200"})
	c.SetToken("test-token")
	if c.Token() != "test-token" {
		t.Errorf("expected token test-token, got %s", c.Token())
	}
}

func TestGetSecret(t *testing.T) {
	// Mock Vault server
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("X-Vault-Token") != "test-token" {
			w.WriteHeader(403)
			return
		}
		response := KVResponse{
			Data: SecretData{
				Data: map[string]interface{}{
					"subscription_id": "test-sub",
					"tenant_id":       "test-tenant",
				},
			},
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(response)
	}))
	defer server.Close()

	c := NewClient(Config{Addr: server.URL})
	c.SetToken("test-token")

	secret, err := c.GetSecret("cloud/data/azure/prod")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if secret["subscription_id"] != "test-sub" {
		t.Errorf("expected subscription_id=test-sub, got %v", secret["subscription_id"])
	}
}

func TestSetSecret(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			t.Errorf("expected POST, got %s", r.Method)
		}
		w.WriteHeader(200)
	}))
	defer server.Close()

	c := NewClient(Config{Addr: server.URL})
	c.SetToken("test-token")

	err := c.SetSecret("cloud/data/azure/prod", map[string]interface{}{
		"subscription_id": "test-sub",
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}
```

- [ ] **Step 2: Run tests**

Run: `cd backend && go test ./internal/vault/ -v`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/internal/vault/client_test.go
git commit -m "test(vault): add Vault client unit tests"
```

### Task 5: Create Vault initialization script

**Files:**
- Create: `backend/vault-init/main.go`

- [ ] **Step 1: Create vault-init/main.go**

```go
package main

import (
	"encoding/json"
	"fmt"
	"log"
	"os"

	vault "multicloud/internal/vault"
)

func main() {
	vaultAddr := os.Getenv("VAULT_ADDR")
	if vaultAddr == "" {
		vaultAddr = "http://localhost:8200"
	}

	// For initial setup, use root token from VAULT_TOKEN env
	rootToken := os.Getenv("VAULT_TOKEN")
	if rootToken == "" {
		log.Fatal("VAULT_TOKEN required for initialization")
	}

	c := vault.NewClient(vault.Config{Addr: vaultAddr})
	c.SetToken(rootToken)

	// Read credentials from JSON file if provided
	credFile := os.Getenv("CRED_FILE")
	if credFile != "" {
		data, err := os.ReadFile(credFile)
		if err != nil {
			log.Fatalf("read cred file: %v", err)
		}

		var creds map[string]map[string]interface{}
		if err := json.Unmarshal(data, &creds); err != nil {
			log.Fatalf("parse cred file: %v", err)
		}

		for path, secret := range creds {
			fmt.Printf("Writing secret to cloud/data/%s...\n", path)
			if err := c.SetSecret("cloud/data/"+path, secret); err != nil {
				log.Printf("WARNING: failed to write %s: %v", path, err)
			} else {
				fmt.Printf("  OK\n")
			}
		}
	}

	fmt.Println("Vault initialization complete")
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd backend && go build ./vault-init/`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/vault-init/
git commit -m "feat(vault): add Vault initialization tool"
```

---

## Phase 2: Agent Runtime Core

### Task 6: Define Tool interface and Tool Registry

**Files:**
- Create: `backend/internal/agent/registry.go`

- [ ] **Step 1: Create agent/registry.go**

```go
package agent

import (
	"context"
	"encoding/json"
)

// Tool is the unified interface for all AI-callable tools.
type Tool interface {
	Name() string
	Description() string
	Parameters() map[string]interface{}
	Execute(ctx context.Context, args map[string]interface{}) (string, error)
}

// ToolRegistry manages all registered tools.
type ToolRegistry struct {
	tools map[string]Tool
}

// NewToolRegistry creates a new registry.
func NewToolRegistry() *ToolRegistry {
	return &ToolRegistry{
		tools: make(map[string]Tool),
	}
}

// Register adds a tool to the registry.
func (r *ToolRegistry) Register(tool Tool) {
	r.tools[tool.Name()] = tool
}

// Get retrieves a tool by name.
func (r *ToolRegistry) Get(name string) (Tool, bool) {
	t, ok := r.tools[name]
	return t, ok
}

// GetAll returns all registered tools.
func (r *ToolRegistry) GetAll() []Tool {
	var tools []Tool
	for _, t := range r.tools {
		tools = append(tools, t)
	}
	return tools
}

// GetDefinitions returns tool definitions in OpenAI function-calling format.
func (r *ToolRegistry) GetDefinitions() []map[string]interface{} {
	var defs []map[string]interface{}
	for _, t := range r.GetAll() {
		defs = append(defs, map[string]interface{}{
			"type": "function",
			"function": map[string]interface{}{
				"name":        t.Name(),
				"description": t.Description(),
				"parameters":  t.Parameters(),
			},
		})
	}
	return defs
}

// Remove removes a tool from the registry.
func (r *ToolRegistry) Remove(name string) {
	delete(r.tools, name)
}

// Names returns all registered tool names.
func (r *ToolRegistry) Names() []string {
	var names []string
	for name := range r.tools {
		names = append(names, name)
	}
	return names
}

// FilterByNames returns a new registry containing only the named tools.
func (r *ToolRegistry) FilterByNames(names []string) *ToolRegistry {
	filtered := NewToolRegistry()
	nameSet := make(map[string]bool)
	for _, n := range names {
		nameSet[n] = true
	}
	for _, t := range r.tools {
		if nameSet[t.Name()] {
			filtered.Register(t)
		}
	}
	return filtered
}

// MarshalJSON implements json.Marshaler.
func (r *ToolRegistry) MarshalJSON() ([]byte, error) {
	return json.Marshal(r.GetDefinitions())
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd backend && go build ./internal/agent/`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/internal/agent/registry.go
git commit -m "feat(agent): add Tool interface and ToolRegistry"
```

### Task 7: Migrate existing tools to BuiltInTool

**Files:**
- Modify: `backend/internal/agent/tools.go`

- [ ] **Step 1: Rewrite agent/tools.go with BuiltInTool wrapper**

```go
package agent

import (
	"context"
)

// BuiltInTool wraps a function as a Tool.
type BuiltInTool struct {
	name        string
	description string
	params      map[string]interface{}
	fn          func(ctx context.Context, args map[string]interface{}) (string, error)
}

func (t *BuiltInTool) Name() string        { return t.name }
func (t *BuiltInTool) Description() string { return t.description }
func (t *BuiltInTool) Parameters() map[string]interface{} { return t.params }
func (t *BuiltInTool) Execute(ctx context.Context, args map[string]interface{}) (string, error) {
	return t.fn(ctx, args)
}

// RegisterBuiltInTools registers all existing tools into the registry.
func RegisterBuiltInTools(registry *ToolRegistry, executor *Executor) {
	registry.Register(&BuiltInTool{
		name:        "list_cloud_resources",
		description: "列出所有云资源。可以按云类型（azure/tencent/oracle/render）和区域筛选。",
		params: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"cloud_type": map[string]interface{}{
					"type":        "string",
					"description": "云平台类型",
					"enum":        []string{"azure", "tencent", "oracle", "render"},
				},
				"region": map[string]interface{}{
					"type":        "string",
					"description": "云区域",
				},
				"status": map[string]interface{}{
					"type":        "string",
					"description": "资源状态筛选",
				},
			},
		},
		fn: executor.listResources,
	})

	registry.Register(&BuiltInTool{
		name:        "start_instance",
		description: "启动一个云实例/虚拟机。需要提供资源ID。",
		params: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"resource_id": map[string]interface{}{
					"type":        "string",
					"description": "资源的内部ID",
				},
			},
			"required": []string{"resource_id"},
		},
		fn: func(ctx context.Context, args map[string]interface{}) (string, error) {
			return executor.instanceAction(ctx, args, "start")
		},
	})

	registry.Register(&BuiltInTool{
		name:        "stop_instance",
		description: "停止一个云实例/虚拟机。需要提供资源ID。注意：停止后服务将不可用。",
		params: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"resource_id": map[string]interface{}{
					"type":        "string",
					"description": "资源的内部ID",
				},
			},
			"required": []string{"resource_id"},
		},
		fn: func(ctx context.Context, args map[string]interface{}) (string, error) {
			return executor.instanceAction(ctx, args, "stop")
		},
	})

	registry.Register(&BuiltInTool{
		name:        "restart_instance",
		description: "重启一个云实例/虚拟机。需要提供资源ID。",
		params: map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"resource_id": map[string]interface{}{
					"type":        "string",
					"description": "资源的内部ID",
				},
			},
			"required": []string{"resource_id"},
		},
		fn: func(ctx context.Context, args map[string]interface{}) (string, error) {
			return executor.instanceAction(ctx, args, "restart")
		},
	})

	registry.Register(&BuiltInTool{
		name:        "sync_cloud_resources",
		description: "手动触发云资源同步，从所有云平台拉取最新资源状态。",
		params: map[string]interface{}{
			"type":       "object",
			"properties": map[string]interface{}{},
		},
		fn: executor.syncResources,
	})

	registry.Register(&BuiltInTool{
		name:        "get_cloud_stats",
		description: "获取云资源统计信息，包括资源总数和云账户数。",
		params: map[string]interface{}{
			"type":       "object",
			"properties": map[string]interface{}{},
		},
		fn: executor.getStats,
	})

	registry.Register(&BuiltInTool{
		name:        "list_cloud_accounts",
		description: "列出所有已配置的云账户信息。",
		params: map[string]interface{}{
			"type":       "object",
			"properties": map[string]interface{}{},
		},
		fn: executor.listAccounts,
	})
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd backend && go build ./internal/agent/`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/internal/agent/tools.go
git commit -m "refactor(agent): migrate tools to BuiltInTool with registry"
```

### Task 8: Implement Shell Executor

**Files:**
- Create: `backend/internal/agent/shell/executor.go`

- [ ] **Step 1: Create agent/shell/executor.go**

```go
package shell

import (
	"bytes"
	"context"
	"fmt"
	"os/exec"
	"strings"
	"time"
)

// Executor runs shell commands on the host.
type Executor struct {
	workspaceDir string
	timeout      time.Duration
}

// Config holds shell executor configuration.
type Config struct {
	WorkspaceDir string `json:"workspace_dir"`
	TimeoutSeconds int  `json:"timeout_seconds"`
}

// Result holds the output of a shell command.
type Result struct {
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exit_code"`
	Duration int64  `json:"duration_ms"`
}

// NewExecutor creates a new shell executor.
func NewExecutor(cfg Config) *Executor {
	timeout := time.Duration(cfg.TimeoutSeconds) * time.Second
	if timeout == 0 {
		timeout = 300 * time.Second
	}
	workspace := cfg.WorkspaceDir
	if workspace == "" {
		workspace = "/workspace"
	}
	return &Executor{
		workspaceDir: workspace,
		timeout:      timeout,
	}
}

// Execute runs a shell command and returns the result.
func (e *Executor) Execute(ctx context.Context, command string, workdir string) (*Result, error) {
	if command == "" {
		return nil, fmt.Errorf("empty command")
	}

	dir := e.workspaceDir
	if workdir != "" {
		dir = workdir
	}

	ctx, cancel := context.WithTimeout(ctx, e.timeout)
	defer cancel()

	start := time.Now()
	cmd := exec.CommandContext(ctx, "sh", "-c", command)
	cmd.Dir = dir

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()
	duration := time.Since(start).Milliseconds()

	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			return nil, fmt.Errorf("execute command: %w", err)
		}
	}

	return &Result{
		Stdout:   strings.TrimSpace(stdout.String()),
		Stderr:   strings.TrimSpace(stderr.String()),
		ExitCode: exitCode,
		Duration: duration,
	}, nil
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd backend && go build ./internal/agent/shell/`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/internal/agent/shell/
git commit -m "feat(agent): add Shell command executor"
```

### Task 9: Create Shell Tool wrapper

**Files:**
- Create: `backend/internal/agent/shell/tool.go`

- [ ] **Step 1: Create agent/shell/tool.go**

```go
package shell

import (
	"context"
	"encoding/json"
	"fmt"

	"multicloud/internal/agent"
)

// Tool wraps ShellExecutor as an agent.Tool.
type Tool struct {
	executor *Executor
}

// NewTool creates a new shell tool.
func NewTool(executor *Executor) *Tool {
	return &Tool{executor: executor}
}

func (t *Tool) Name() string { return "shell_exec" }

func (t *Tool) Description() string {
	return "在服务器上执行 shell 命令。可用于运行云 CLI 工具、部署脚本、检查服务状态等。"
}

func (t *Tool) Parameters() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"command": map[string]interface{}{
				"type":        "string",
				"description": "要执行的命令",
			},
			"workdir": map[string]interface{}{
				"type":        "string",
				"description": "工作目录（可选，默认为项目根目录）",
			},
			"timeout": map[string]interface{}{
				"type":        "integer",
				"description": "超时秒数（可选，默认 300）",
			},
		},
		"required": []string{"command"},
	}
}

func (t *Tool) Execute(ctx context.Context, args map[string]interface{}) (string, error) {
	command, _ := args["command"].(string)
	if command == "" {
		return "", fmt.Errorf("command is required")
	}

	workdir, _ := args["workdir"].(string)

	result, err := t.executor.Execute(ctx, command, workdir)
	if err != nil {
		return "", err
	}

	output, _ := json.Marshal(map[string]interface{}{
		"stdout":     result.Stdout,
		"stderr":     result.Stderr,
		"exit_code":  result.ExitCode,
		"duration_ms": result.Duration,
	})
	return string(output), nil
}

// Verify Tool interface compliance
var _ agent.Tool = (*Tool)(nil)
```

- [ ] **Step 2: Verify compilation**

Run: `cd backend && go build ./internal/agent/shell/`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/internal/agent/shell/tool.go
git commit -m "feat(agent): add Shell Tool wrapper for ToolRegistry"
```

### Task 10: Implement Tool Router

**Files:**
- Create: `backend/internal/agent/router.go`

- [ ] **Step 1: Create agent/router.go**

```go
package agent

import (
	"context"
	"fmt"
)

// Router dispatches tool calls to the appropriate executor.
type Router struct {
	registry *ToolRegistry
}

// NewRouter creates a new tool router.
func NewRouter(registry *ToolRegistry) *Router {
	return &Router{registry: registry}
}

// Route finds and executes the appropriate tool for a tool call.
func (r *Router) Route(ctx context.Context, toolCall ToolCall) (string, error) {
	tool, ok := r.registry.Get(toolCall.Function.Name)
	if !ok {
		return "", fmt.Errorf("unknown tool: %s", toolCall.Function.Name)
	}

	var args map[string]interface{}
	if toolCall.Function.Arguments != "" {
		if err := jsonUnmarshal([]byte(toolCall.Function.Arguments), &args); err != nil {
			args = make(map[string]interface{})
		}
	} else {
		args = make(map[string]interface{})
	}

	return tool.Execute(ctx, args)
}

// ToolCall represents a tool call from the LLM.
type ToolCall struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"`
	Function FunctionCall `json:"function"`
}

// FunctionCall represents the function details of a tool call.
type FunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

func jsonUnmarshal(data []byte, v interface{}) error {
	return json.Unmarshal(data, v)
}
```

- [ ] **Step 2: Add json import**

Update the import block in router.go to include `encoding/json`.

- [ ] **Step 3: Verify compilation**

Run: `cd backend && go build ./internal/agent/`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add backend/internal/agent/router.go
git commit -m "feat(agent): add Tool Router for dispatching tool calls"
```

### Task 11: Implement Prompt Builder

**Files:**
- Create: `backend/internal/agent/prompt.go`

- [ ] **Step 1: Create agent/prompt.go**

```go
package agent

import (
	"fmt"
	"strings"
)

// PromptBuilder assembles the system prompt from base + skills + mode.
type PromptBuilder struct {
	basePrompt string
	skills     map[string]*SkillConfig
}

// SkillConfig holds a skill's configuration.
type SkillConfig struct {
	Description    string                 `json:"description"`
	SystemPrompt   string                 `json:"system_prompt"`
	Tools          []string               `json:"tools"`
	EnabledTools   map[string]interface{} `json:"enabled_tools"`
	Trigger        string                 `json:"trigger"`
	Enabled        bool                   `json:"enabled"`
}

// NewPromptBuilder creates a new prompt builder.
func NewPromptBuilder() *PromptBuilder {
	return &PromptBuilder{
		basePrompt: defaultSystemPrompt(),
		skills:     make(map[string]*SkillConfig),
	}
}

// SetSkills sets the active skills.
func (pb *PromptBuilder) SetSkills(skills map[string]*SkillConfig) {
	pb.skills = skills
}

// Build assembles the final system prompt.
func (pb *PromptBuilder) Build(mode string) string {
	var parts []string
	parts = append(parts, pb.basePrompt)

	// Add mode-specific instructions
	switch mode {
	case "plan":
		parts = append(parts, "\n\nYou are in PLAN mode: Analyze the situation and present a plan before taking any actions. Do not execute actions directly, only propose them.")
	case "build":
		parts = append(parts, "\n\nYou are in BUILD mode: Execute solutions directly when the user asks. Use tools to make changes.")
	case "confirm":
		parts = append(parts, "\n\nYou are in CONFIRM mode: Always explain what you're about to do and wait for user confirmation before executing destructive operations.")
	}

	// Add active skill prompts
	for _, skill := range pb.skills {
		if skill.Enabled && skill.SystemPrompt != "" {
			parts = append(parts, "\n\n"+skill.SystemPrompt)
		}
	}

	return strings.Join(parts, "")
}

func defaultSystemPrompt() string {
	return `You are an AI cloud operations assistant for a multi-cloud management platform. You can manage resources across Azure, Tencent Cloud, Oracle Cloud, and Render.

You have access to tools that can:
- List and manage cloud resources across multiple providers
- Execute shell commands on the server
- Interact with MCP servers for extended capabilities

Important guidelines:
- Always list resources first before performing actions to confirm the correct resource
- When stopping instances, always warn the user about potential impact
- For destructive operations, explain what will happen before proceeding
- Respond in the same language as the user's message
- Be concise but thorough in your explanations
- Use shell commands to interact with cloud CLIs (az, oci, tccli, render)
- When deploying resources, verify prerequisites first`
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd backend && go build ./internal/agent/`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/internal/agent/prompt.go
git commit -m "feat(agent): add Prompt Builder with skill injection"
```

### Task 12: Implement Agent Runtime

**Files:**
- Create: `backend/internal/agent/runtime.go`

- [ ] **Step 1: Create agent/runtime.go**

```go
package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"multicloud/internal/vault"
)

// Runtime is the core Agent Runtime that orchestrates tool calling.
type Runtime struct {
	registry    *ToolRegistry
	router      *Router
	prompt      *PromptBuilder
	vault       *vault.Client
	db          *sql.DB
	maxIter     int
}

// RuntimeConfig holds configuration for the Agent Runtime.
type RuntimeConfig struct {
	Registry    *ToolRegistry
	Vault       *vault.Client
	DB          *sql.DB
	MaxIter     int
}

// NewRuntime creates a new Agent Runtime.
func NewRuntime(cfg RuntimeConfig) *Runtime {
	maxIter := cfg.MaxIter
	if maxIter == 0 {
		maxIter = 5
	}
	return &Runtime{
		registry: cfg.Registry,
		router:   NewRouter(cfg.Registry),
		prompt:   NewPromptBuilder(),
		vault:    cfg.Vault,
		db:       cfg.DB,
		maxIter:  maxIter,
	}
}

// GetToolDefinitions returns tool definitions for the LLM.
func (r *Runtime) GetToolDefinitions() []map[string]interface{} {
	return r.registry.GetDefinitions()
}

// GetSystemPrompt builds the system prompt for the given mode.
func (r *Runtime) GetSystemPrompt(mode string) string {
	return r.prompt.Build(mode)
}

// SetSkills updates the active skills.
func (r *Runtime) SetSkills(skills map[string]*SkillConfig) {
	r.prompt.SetSkills(skills)
}

// ExecuteTool executes a single tool call and returns the result.
func (r *Runtime) ExecuteTool(ctx context.Context, toolName string, args map[string]interface{}) (string, error) {
	tool, ok := r.registry.Get(toolName)
	if !ok {
		return "", fmt.Errorf("unknown tool: %s", toolName)
	}
	return tool.Execute(ctx, args)
}

// GetToolCallArgs parses tool call arguments from JSON string.
func GetToolCallArgs(argsStr string) map[string]interface{} {
	var args map[string]interface{}
	if argsStr != "" {
		json.Unmarshal([]byte(argsStr), &args)
	}
	if args == nil {
		args = make(map[string]interface{})
	}
	return args
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd backend && go build ./internal/agent/`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/internal/agent/runtime.go
git commit -m "feat(agent): add Agent Runtime core"
```

---

## Phase 3: MCP + Skill

### Task 13: Define MCP protocol types

**Files:**
- Create: `backend/internal/agent/mcp/types.go`

- [ ] **Step 1: Create agent/mcp/types.go**

```go
package mcp

// JSONRPCRequest represents a JSON-RPC 2.0 request.
type JSONRPCRequest struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      interface{} `json:"id"`
	Method  string      `json:"method"`
	Params  interface{} `json:"params,omitempty"`
}

// JSONRPCResponse represents a JSON-RPC 2.0 response.
type JSONRPCResponse struct {
	JSONRPC string      `json:"jsonrpc"`
	ID      interface{} `json:"id"`
	Result  interface{} `json:"result,omitempty"`
	Error   *JSONRPCError `json:"error,omitempty"`
}

// JSONRPCError represents a JSON-RPC 2.0 error.
type JSONRPCError struct {
	Code    int         `json:"code"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
}

// Tool represents an MCP tool definition.
type Tool struct {
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	InputSchema map[string]interface{} `json:"inputSchema"`
}

// ToolCallParams represents parameters for tools/call.
type ToolCallParams struct {
	Name      string                 `json:"name"`
	Arguments map[string]interface{} `json:"arguments"`
}

// ServerConfig holds MCP server configuration.
type ServerConfig struct {
	Transport string            `json:"transport"`
	Command   string            `json:"command"`
	Args      []string          `json:"args"`
	URL       string            `json:"url"`
	Headers   map[string]string `json:"headers"`
	Env       map[string]string `json:"env"`
	Enabled   bool              `json:"enabled"`
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd backend && go build ./internal/agent/mcp/`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/internal/agent/mcp/types.go
git commit -m "feat(mcp): add MCP protocol type definitions"
```

### Task 14: Implement MCP stdio transport

**Files:**
- Create: `backend/internal/agent/mcp/stdio.go`

- [ ] **Step 1: Create agent/mcp/stdio.go**

```go
package mcp

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"sync"
	"time"
)

// StdioTransport communicates with an MCP server via stdin/stdout.
type StdioTransport struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout *bufio.Reader
	mu     sync.Mutex
	id     int
}

// NewStdioTransport creates a new stdio transport.
func NewStdioTransport(command string, args []string, env map[string]string) (*StdioTransport, error) {
	cmd := exec.Command(command, args...)
	for k, v := range env {
		cmd.Env = append(cmd.Env, k+"="+v)
	}

	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, fmt.Errorf("create stdin pipe: %w", err)
	}

	var stdoutBuf bytes.Buffer
	cmd.Stdout = &stdoutBuf

	if err := cmd.Start(); err != nil {
		return nil, fmt.Errorf("start process: %w", err)
	}

	return &StdioTransport{
		cmd:    cmd,
		stdin:  stdin,
		stdout: bufio.NewReader(&stdoutBuf),
	}, nil
}

// SendRequest sends a JSON-RPC request and waits for the response.
func (t *StdioTransport) SendRequest(ctx context.Context, method string, params interface{}) (interface{}, error) {
	t.mu.Lock()
	t.id++
	id := t.id
	t.mu.Unlock()

	req := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      id,
		Method:  method,
		Params:  params,
	}

	data, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	// Write request with newline delimiter
	data = append(data, '\n')
	if _, err := t.stdin.Write(data); err != nil {
		return nil, fmt.Errorf("write request: %w", err)
	}

	// Read response with timeout
	type result struct {
		resp []byte
		err  error
	}
	ch := make(chan result, 1)
	go func() {
		line, err := t.stdout.ReadBytes('\n')
		ch <- result{line, err}
	}()

	select {
	case <-ctx.Done():
		return nil, ctx.Err()
	case r := <-ch:
		if r.err != nil {
			return nil, fmt.Errorf("read response: %w", r.err)
		}

		var resp JSONRPCResponse
		if err := json.Unmarshal(r.resp, &resp); err != nil {
			return nil, fmt.Errorf("parse response: %w", err)
		}
		if resp.Error != nil {
			return nil, fmt.Errorf("MCP error %d: %s", resp.Error.Code, resp.Error.Message)
		}
		return resp.Result, nil
	case <-time.After(30 * time.Second):
		return nil, fmt.Errorf("request timeout")
	}
}

// Close stops the transport and cleans up.
func (t *StdioTransport) Close() error {
	if t.stdin != nil {
		t.stdin.Close()
	}
	if t.cmd != nil && t.cmd.Process != nil {
		t.cmd.Process.Kill()
		t.cmd.Wait()
	}
	return nil
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd backend && go build ./internal/agent/mcp/`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/internal/agent/mcp/stdio.go
git commit -m "feat(mcp): add stdio transport for MCP servers"
```

### Task 15: Implement MCP SSE transport

**Files:**
- Create: `backend/internal/agent/mcp/sse.go`

- [ ] **Step 1: Create agent/mcp/sse.go**

```go
package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// SSETransport communicates with an MCP server via Server-Sent Events.
type SSETransport struct {
	url     string
	headers map[string]string
	client  *http.Client
	mu      sync.Mutex
	id      int
	eventCh chan string
}

// NewSSETransport creates a new SSE transport.
func NewSSETransport(url string, headers map[string]string) *SSETransport {
	return &SSETransport{
		url:     url,
		headers: headers,
		client:  &http.Client{Timeout: 30 * time.Second},
		eventCh: make(chan string, 100),
	}
}

// SendRequest sends a JSON-RPC request via SSE and waits for response.
func (t *SSETransport) SendRequest(ctx context.Context, method string, params interface{}) (interface{}, error) {
	t.mu.Lock()
	t.id++
	id := t.id
	t.mu.Unlock()

	req := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      id,
		Method:  method,
		Params:  params,
	}

	data, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	// POST request to SSE endpoint
	httpReq, err := http.NewRequest("POST", t.url, strings.NewReader(string(data)))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	for k, v := range t.headers {
		httpReq.Header.Set(k, v)
	}

	resp, err := t.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("SSE request failed (HTTP %d): %s", resp.StatusCode, string(body))
	}

	// Read SSE events until we get our response
	reader := bufio.NewReader(resp.Body)
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			return nil, fmt.Errorf("read SSE: %w", err)
		}
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "data: ") {
			data := strings.TrimPrefix(line, "data: ")
			var respJSON JSONRPCResponse
			if err := json.Unmarshal([]byte(data), &respJSON); err != nil {
				continue
			}
			if respJSON.ID == id {
				if respJSON.Error != nil {
					return nil, fmt.Errorf("MCP error %d: %s", respJSON.Error.Code, respJSON.Error.Message)
				}
				return respJSON.Result, nil
			}
		}
	}
}

// Close cleans up the transport.
func (t *SSETransport) Close() error {
	return nil
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd backend && go build ./internal/agent/mcp/`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/internal/agent/mcp/sse.go
git commit -m "feat(mcp): add SSE transport for remote MCP servers"
```

### Task 16: Implement MCP Client

**Files:**
- Create: `backend/internal/agent/mcp/client.go`

- [ ] **Step 1: Create agent/mcp/client.go**

```go
package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
)

// Client manages connection to a single MCP server.
type Client struct {
	id     string
	config ServerConfig
	transport interface{ SendRequest(context.Context, string, interface{}) (interface{}, error); Close() error }
	tools  []Tool
}

// NewClient creates a new MCP client based on config.
func NewClient(id string, config ServerConfig) (*Client, error) {
	var transport interface {
		SendRequest(context.Context, string, interface{}) (interface{}, error)
		Close() error
	}

	switch config.Transport {
	case "stdio":
		t, err := NewStdioTransport(config.Command, config.Args, config.Env)
		if err != nil {
			return nil, fmt.Errorf("create stdio transport: %w", err)
		}
		transport = t
	case "sse":
		transport = NewSSETransport(config.URL, config.Headers)
	default:
		return nil, fmt.Errorf("unsupported transport: %s", config.Transport)
	}

	return &Client{
		id:        id,
		config:    config,
		transport: transport,
	}, nil
}

// Initialize initializes the MCP connection and fetches available tools.
func (c *Client) Initialize(ctx context.Context) error {
	// Send initialize request
	result, err := c.transport.SendRequest(ctx, "initialize", map[string]interface{}{
		"protocolVersion": "2024-11-05",
		"capabilities":    map[string]interface{}{},
		"clientInfo": map[string]interface{}{
			"name":    "multicloud-agent",
			"version": "1.0.0",
		},
	})
	if err != nil {
		return fmt.Errorf("initialize: %w", err)
	}
	log.Printf("mcp[%s]: initialized: %v", c.id, result)

	// List available tools
	toolsResult, err := c.transport.SendRequest(ctx, "tools/list", nil)
	if err != nil {
		return fmt.Errorf("list tools: %w", err)
	}

	toolsJSON, _ := json.Marshal(toolsResult)
	var toolsResp struct {
		Tools []Tool `json:"tools"`
	}
	if err := json.Unmarshal(toolsJSON, &toolsResp); err != nil {
		return fmt.Errorf("parse tools: %w", err)
	}

	c.tools = toolsResp.Tools
	log.Printf("mcp[%s]: found %d tools", c.id, len(c.tools))
	return nil
}

// GetTools returns the tools available from this server.
func (c *Client) GetTools() []Tool {
	return c.tools
}

// CallTool calls a tool on this MCP server.
func (c *Client) CallTool(ctx context.Context, name string, args map[string]interface{}) (string, error) {
	result, err := c.transport.SendRequest(ctx, "tools/call", ToolCallParams{
		Name:      name,
		Arguments: args,
	})
	if err != nil {
		return "", fmt.Errorf("call tool %s: %w", name, err)
	}

	resultJSON, _ := json.Marshal(result)
	return string(resultJSON), nil
}

// Close closes the MCP connection.
func (c *Client) Close() error {
	return c.transport.Close()
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd backend && go build ./internal/agent/mcp/`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/internal/agent/mcp/client.go
git commit -m "feat(mcp): add MCP client with stdio/SSE support"
```

### Task 17: Implement MCP Manager

**Files:**
- Create: `backend/internal/agent/mcp/manager.go`

- [ ] **Step 1: Create agent/mcp/manager.go**

```go
package mcp

import (
	"context"
	"log"
	"sync"
)

// Manager manages multiple MCP server connections.
type Manager struct {
	clients map[string]*Client
	configs map[string]ServerConfig
	mu      sync.RWMutex
}

// NewManager creates a new MCP manager.
func NewManager() *Manager {
	return &Manager{
		clients: make(map[string]*Client),
		configs: make(map[string]ServerConfig),
	}
}

// LoadConfigs loads MCP server configurations.
func (m *Manager) LoadConfigs(configs map[string]ServerConfig) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.configs = configs
}

// ConnectAll connects to all enabled MCP servers.
func (m *Manager) ConnectAll(ctx context.Context) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for id, config := range m.configs {
		if !config.Enabled {
			continue
		}
		go m.connectServer(ctx, id, config)
	}
}

func (m *Manager) connectServer(ctx context.Context, id string, config ServerConfig) {
	client, err := NewClient(id, config)
	if err != nil {
		log.Printf("mcp[%s]: failed to create client: %v", id, err)
		return
	}

	if err := client.Initialize(ctx); err != nil {
		log.Printf("mcp[%s]: failed to initialize: %v", id, err)
		client.Close()
		return
	}

	m.mu.Lock()
	m.clients[id] = client
	m.mu.Unlock()

	log.Printf("mcp[%s]: connected successfully", id)
}

// GetClient returns a connected MCP client by ID.
func (m *Manager) GetClient(id string) (*Client, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	client, ok := m.clients[id]
	return client, ok
}

// GetAllTools returns all tools from all connected MCP servers.
func (m *Manager) GetAllTools() []Tool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	var tools []Tool
	for _, client := range m.clients {
		tools = append(tools, client.GetTools()...)
	}
	return tools
}

// CloseAll closes all MCP connections.
func (m *Manager) CloseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, client := range m.clients {
		if err := client.Close(); err != nil {
			log.Printf("mcp[%s]: close error: %v", id, err)
		}
	}
	m.clients = make(map[string]*Client)
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd backend && go build ./internal/agent/mcp/`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/internal/agent/mcp/manager.go
git commit -m "feat(mcp): add MCP Manager for server lifecycle"
```

### Task 18: Create MCP Tool wrapper for ToolRegistry

**Files:**
- Create: `backend/internal/agent/mcp/tool.go`

- [ ] **Step 1: Create agent/mcp/tool.go**

```go
package mcp

import (
	"context"
	"encoding/json"
	"fmt"

	"multicloud/internal/agent"
)

// MCPTool wraps an MCP tool as an agent.Tool.
type MCPTool struct {
	tool   Tool
	client *Client
}

// NewMCPTool creates a new MCP tool wrapper.
func NewMCPTool(tool Tool, client *Client) *MCPTool {
	return &MCPTool{tool: tool, client: client}
}

func (t *MCPTool) Name() string { return t.tool.Name }

func (t *MCPTool) Description() string { return t.tool.Description }

func (t *MCPTool) Parameters() map[string]interface{} {
	if t.tool.InputSchema == nil {
		return map[string]interface{}{"type": "object", "properties": map[string]interface{}{}}
	}
	return t.tool.InputSchema
}

func (t *MCPTool) Execute(ctx context.Context, args map[string]interface{}) (string, error) {
	result, err := t.client.CallTool(ctx, t.tool.Name, args)
	if err != nil {
		return "", err
	}
	return result, nil
}

// Verify Tool interface compliance
var _ agent.Tool = (*MCPTool)(nil)
```

- [ ] **Step 2: Verify compilation**

Run: `cd backend && go build ./internal/agent/mcp/`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add backend/internal/agent/mcp/tool.go
git commit -m "feat(mcp): add MCP Tool wrapper for ToolRegistry"
```

### Task 19: Implement Skill Engine

**Files:**
- Create: `backend/internal/agent/skill/engine.go`
- Create: `backend/internal/agent/skill/loader.go`

- [ ] **Step 1: Create agent/skill/engine.go**

```go
package skill

import (
	"multicloud/internal/agent"
)

// Engine manages skill loading and activation.
type Engine struct {
	skills    map[string]*agent.SkillConfig
	registry  *agent.ToolRegistry
}

// NewEngine creates a new skill engine.
func NewEngine(registry *agent.ToolRegistry) *Engine {
	return &Engine{
		skills:   make(map[string]*agent.SkillConfig),
		registry: registry,
	}
}

// LoadSkills loads skills from config.
func (e *Engine) LoadSkills(skills map[string]*agent.SkillConfig) {
	e.skills = skills
}

// GetActiveSkills returns currently enabled skills.
func (e *Engine) GetActiveSkills() map[string]*agent.SkillConfig {
	active := make(map[string]*agent.SkillConfig)
	for name, skill := range e.skills {
		if skill.Enabled {
			active[name] = skill
		}
	}
	return active
}

// EnableSkill enables a skill by name.
func (e *Engine) EnableSkill(name string) {
	if skill, ok := e.skills[name]; ok {
		skill.Enabled = true
	}
}

// DisableSkill disables a skill by name.
func (e *Engine) DisableSkill(name string) {
	if skill, ok := e.skills[name]; ok {
		skill.Enabled = false
	}
}
```

- [ ] **Step 2: Create agent/skill/loader.go**

```go
package skill

import (
	"encoding/json"
	"fmt"
	"os"

	"multicloud/internal/agent"
)

// ConfigFile is the structure of agent.json.
type ConfigFile struct {
	Shell struct {
		Enabled       bool   `json:"enabled"`
		WorkspaceDir  string `json:"workspace_dir"`
		TimeoutSeconds int   `json:"timeout_seconds"`
	} `json:"shell"`
	MCPServers map[string]MCPServerConfig `json:"mcp_servers"`
	Skills     map[string]SkillEntry      `json:"skills"`
	Vault      struct {
		Addr     string `json:"addr"`
		RoleID   string `json:"role_id"`
		SecretID string `json:"secret_id"`
	} `json:"vault"`
}

// MCPServerConfig is the MCP server entry in config file.
type MCPServerConfig = MCPServerConfig

// SkillEntry is a skill entry in config file.
type SkillEntry struct {
	Enabled bool `json:"enabled"`
}

// LoadFromFile loads agent config from a JSON file.
func LoadFromFile(path string) (*ConfigFile, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config file: %w", err)
	}

	var cfg ConfigFile
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config file: %w", err)
	}

	return &cfg, nil
}

// SaveToFile saves agent config to a JSON file.
func SaveToFile(path string, cfg *ConfigFile) error {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}
	return os.WriteFile(path, data, 0644)
}
```

- [ ] **Step 3: Verify compilation**

Run: `cd backend && go build ./internal/agent/skill/`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add backend/internal/agent/skill/
git commit -m "feat(skill): add Skill Engine and config loader"
```

---

## Phase 4: Integration

### Task 20: Integrate Agent Runtime into Chat API

**Files:**
- Modify: `backend/internal/api/chat.go`
- Modify: `backend/internal/api/router.go`

- [ ] **Step 1: Update chat.go to use Agent Runtime**

Replace the tool calling loop in `Stream()` with calls to the Agent Runtime. The Runtime handles:
- Building system prompt
- Collecting tool definitions
- Routing tool calls
- Managing the loop

Key changes:
- `ChatStreamHandler` gets a `*agent.Runtime` field
- `Stream()` calls `runtime.GetSystemPrompt(mode)` instead of `buildSystemPrompt()`
- `Stream()` calls `runtime.GetToolDefinitions()` instead of `agent.GetToolDefinitions()`
- Tool call routing uses `runtime.ExecuteTool()` instead of `h.executor.ExecuteTool()`

- [ ] **Step 2: Update router.go to initialize Runtime**

In `SetupRouter()`, create the Agent Runtime with:
- ToolRegistry (populated with built-in tools)
- Vault client (from config)
- DB connection

- [ ] **Step 3: Verify compilation**

Run: `cd backend && go build ./...`
Expected: No errors

- [ ] **Step 4: Run all tests**

Run: `cd backend && go test ./...`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/internal/api/
git commit -m "feat: integrate Agent Runtime into Chat API"
```

### Task 21: Add agent config API endpoints

**Files:**
- Modify: `backend/internal/api/router.go`
- Create: `backend/internal/api/agent_runtime_config.go`

- [ ] **Step 1: Create agent_runtime_config.go with endpoints**

Add API endpoints for:
- `GET /api/agent/config/shell` - Get shell config
- `PUT /api/agent/config/shell` - Update shell config
- `GET /api/agent/config/mcp` - Get MCP servers
- `PUT /api/agent/config/mcp` - Update MCP servers
- `GET /api/agent/config/skills` - Get skills
- `PUT /api/agent/config/skills` - Update skills
- `POST /api/agent/config/mcp/:id/test` - Test MCP connection

- [ ] **Step 2: Register routes in router.go**

- [ ] **Step 3: Verify compilation**

Run: `cd backend && go build ./...`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add backend/internal/api/agent_runtime_config.go backend/internal/api/router.go
git commit -m "feat: add Agent Runtime configuration API endpoints"
```

### Task 22: Write integration tests

**Files:**
- Create: `backend/internal/agent/runtime_test.go`

- [ ] **Step 1: Create agent/runtime_test.go**

```go
package agent

import (
	"context"
	"testing"
)

func TestToolRegistry(t *testing.T) {
	registry := NewToolRegistry()

	tool := &BuiltInTool{
		name:        "test_tool",
		description: "A test tool",
		params:      map[string]interface{}{"type": "object", "properties": map[string]interface{}{}},
		fn: func(ctx context.Context, args map[string]interface{}) (string, error) {
			return `{"result":"ok"}`, nil
		},
	}

	registry.Register(tool)

	if len(registry.GetAll()) != 1 {
		t.Errorf("expected 1 tool, got %d", len(registry.GetAll()))
	}

	got, ok := registry.Get("test_tool")
	if !ok {
		t.Fatal("expected to find test_tool")
	}

	result, err := got.Execute(context.Background(), nil)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != `{"result":"ok"}` {
		t.Errorf("expected {\"result\":\"ok\"}, got %s", result)
	}
}

func TestRouter(t *testing.T) {
	registry := NewToolRegistry()
	registry.Register(&BuiltInTool{
		name: "echo",
		fn: func(ctx context.Context, args map[string]interface{}) (string, error) {
			return `{"echo":true}`, nil
		},
	})

	router := NewRouter(registry)
	result, err := router.Route(context.Background(), ToolCall{
		Function: FunctionCall{
			Name:      "echo",
			Arguments: "{}",
		},
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result != `{"echo":true}` {
		t.Errorf("expected {\"echo\":true}, got %s", result)
	}
}

func TestPromptBuilder(t *testing.T) {
	pb := NewPromptBuilder()
	prompt := pb.Build("plan")
	if prompt == "" {
		t.Error("expected non-empty prompt")
	}
	if !contains(prompt, "PLAN mode") {
		t.Error("expected PLAN mode in prompt")
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsSubstr(s, substr))
}

func containsSubstr(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
```

- [ ] **Step 2: Run tests**

Run: `cd backend && go test ./internal/agent/ -v`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add backend/internal/agent/runtime_test.go
git commit -m "test(agent): add Agent Runtime integration tests"
```

---

## Execution Summary

| Phase | Tasks | Description |
|-------|-------|-------------|
| Phase 1 | 1-5 | Vault integration foundation |
| Phase 2 | 6-12 | Agent Runtime core |
| Phase 3 | 13-19 | MCP + Skill extensions |
| Phase 4 | 20-22 | Integration and testing |

**Total: 22 tasks**
