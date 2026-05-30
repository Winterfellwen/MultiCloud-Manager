# Agent Runtime Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the core agent runtime components: tool interface, registry, shell executor, router, prompt builder, and runtime struct.

**Architecture:** Create a modular agent package with clear separation of concerns: tool definitions, execution, routing, and prompt construction. The runtime will orchestrate these components, using existing executor and vault modules.

**Tech Stack:** Go, existing internal/cloud, internal/vault, database/sql.

---

## File Structure

- `backend/internal/agent/registry.go` - Tool interface and registry
- `backend/internal/agent/tools.go` - Rewrite with BuiltInTool and RegisterBuiltInTools
- `backend/internal/agent/shell/executor.go` - Shell command executor
- `backend/internal/agent/shell/tool.go` - Shell tool wrapper
- `backend/internal/agent/router.go` - Tool router
- `backend/internal/agent/prompt.go` - Prompt builder
- `backend/internal/agent/runtime.go` - Runtime orchestrator

---

### Task 6: Define Tool interface and Tool Registry

**Files:**
- Create: `backend/internal/agent/registry.go`

- [ ] **Step 1: Create registry.go with Tool interface and ToolRegistry struct**

```go
package agent

import (
	"context"
	"encoding/json"
	"fmt"
)

// Tool defines the interface for a tool that can be executed by the agent.
type Tool interface {
	// Name returns the unique name of the tool.
	Name() string
	// Description returns a human-readable description of what the tool does.
	Description() string
	// Parameters returns the JSON schema for the tool's parameters.
	Parameters() map[string]interface{}
	// Execute runs the tool with the given arguments and returns the result.
	Execute(ctx context.Context, args map[string]interface{}) (string, error)
}

// ToolRegistry manages a collection of tools.
type ToolRegistry struct {
	tools map[string]Tool
}

// NewToolRegistry creates a new empty tool registry.
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
	tool, ok := r.tools[name]
	return tool, ok
}

// GetAll returns all registered tools.
func (r *ToolRegistry) GetAll() []Tool {
	tools := make([]Tool, 0, len(r.tools))
	for _, tool := range r.tools {
		tools = append(tools, tool)
	}
	return tools
}

// GetDefinitions returns tool definitions in OpenAI function-calling format.
func (r *ToolRegistry) GetDefinitions() []map[string]interface{} {
	defs := make([]map[string]interface{}, 0, len(r.tools))
	for _, tool := range r.tools {
		def := map[string]interface{}{
			"type": "function",
			"function": map[string]interface{}{
				"name":        tool.Name(),
				"description": tool.Description(),
				"parameters":  tool.Parameters(),
			},
		}
		defs = append(defs, def)
	}
	return defs
}

// Remove removes a tool from the registry by name.
func (r *ToolRegistry) Remove(name string) {
	delete(r.tools, name)
}

// Names returns a list of all tool names.
func (r *ToolRegistry) Names() []string {
	names := make([]string, 0, len(r.tools))
	for name := range r.tools {
		names = append(names, name)
	}
	return names
}

// FilterByNames returns tools whose names are in the provided list.
func (r *ToolRegistry) FilterByNames(names []string) []Tool {
	nameSet := make(map[string]bool, len(names))
	for _, name := range names {
		nameSet[name] = true
	}
	
	var filtered []Tool
	for _, tool := range r.tools {
		if nameSet[tool.Name()] {
			filtered = append(filtered, tool)
		}
	}
	return filtered
}

// MarshalJSON implements json.Marshaler.
func (r *ToolRegistry) MarshalJSON() ([]byte, error) {
	return json.Marshal(r.tools)
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd E:\AI\multicloud\backend && go build ./internal/agent/...`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add internal/agent/registry.go
git commit -m "feat: add Tool interface and ToolRegistry"
```

---

### Task 7: Migrate existing tools to BuiltInTool

**Files:**
- Modify: `backend/internal/agent/tools.go`

- [ ] **Step 1: Rewrite tools.go with BuiltInTool and RegisterBuiltInTools**

```go
package agent

import (
	"context"
)

// BuiltInTool wraps a function as a Tool.
type BuiltInTool struct {
	name        string
	description string
	parameters  map[string]interface{}
	execute     func(ctx context.Context, args map[string]interface{}) (string, error)
}

// NewBuiltInTool creates a new BuiltInTool.
func NewBuiltInTool(name, description string, parameters map[string]interface{}, execute func(ctx context.Context, args map[string]interface{}) (string, error)) *BuiltInTool {
	return &BuiltInTool{
		name:        name,
		description: description,
		parameters:  parameters,
		execute:     execute,
	}
}

// Name returns the tool name.
func (t *BuiltInTool) Name() string {
	return t.name
}

// Description returns the tool description.
func (t *BuiltInTool) Description() string {
	return t.description
}

// Parameters returns the tool parameters schema.
func (t *BuiltInTool) Parameters() map[string]interface{} {
	return t.parameters
}

// Execute runs the tool function.
func (t *BuiltInTool) Execute(ctx context.Context, args map[string]interface{}) (string, error) {
	return t.execute(ctx, args)
}

// RegisterBuiltInTools registers all 7 existing tools with the registry.
func RegisterBuiltInTools(registry *ToolRegistry, executor *Executor) {
	// list_cloud_resources
	registry.Register(NewBuiltInTool(
		"list_cloud_resources",
		"列出所有云资源。可以按云类型（azure/tencent/oracle/render）和区域筛选。",
		map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"cloud_type": map[string]interface{}{
					"type":        "string",
					"description": "云平台类型",
					"enum":        []string{"azure", "tencent", "oracle", "render"},
				},
				"region": map[string]interface{}{
					"type":        "string",
					"description": "云区域，如 eastus、ap-shanghai 等",
				},
				"status": map[string]interface{}{
					"type":        "string",
					"description": "资源状态筛选，如 running、stopped",
				},
			},
		},
		executor.listResources,
	))

	// start_instance
	registry.Register(NewBuiltInTool(
		"start_instance",
		"启动一个云实例/虚拟机。需要提供资源ID。",
		map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"resource_id": map[string]interface{}{
					"type":        "string",
					"description": "资源的内部ID（来自 list_cloud_resources 返回的 id 字段）",
				},
			},
			"required": []string{"resource_id"},
		},
		func(ctx context.Context, args map[string]interface{}) (string, error) {
			return executor.instanceAction(ctx, args, "start")
		},
	))

	// stop_instance
	registry.Register(NewBuiltInTool(
		"stop_instance",
		"停止一个云实例/虚拟机。需要提供资源ID。注意：停止后服务将不可用。",
		map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"resource_id": map[string]interface{}{
					"type":        "string",
					"description": "资源的内部ID（来自 list_cloud_resources 返回的 id 字段）",
				},
			},
			"required": []string{"resource_id"},
		},
		func(ctx context.Context, args map[string]interface{}) (string, error) {
			return executor.instanceAction(ctx, args, "stop")
		},
	))

	// restart_instance
	registry.Register(NewBuiltInTool(
		"restart_instance",
		"重启一个云实例/虚拟机。需要提供资源ID。",
		map[string]interface{}{
			"type": "object",
			"properties": map[string]interface{}{
				"resource_id": map[string]interface{}{
					"type":        "string",
					"description": "资源的内部ID（来自 list_cloud_resources 返回的 id 字段）",
				},
			},
			"required": []string{"resource_id"},
		},
		func(ctx context.Context, args map[string]interface{}) (string, error) {
			return executor.instanceAction(ctx, args, "restart")
		},
	))

	// sync_cloud_resources
	registry.Register(NewBuiltInTool(
		"sync_cloud_resources",
		"手动触发云资源同步，从所有云平台拉取最新资源状态。",
		map[string]interface{}{
			"type":       "object",
			"properties": map[string]interface{}{},
		},
		func(ctx context.Context, args map[string]interface{}) (string, error) {
			return executor.syncResources(ctx)
		},
	))

	// get_cloud_stats
	registry.Register(NewBuiltInTool(
		"get_cloud_stats",
		"获取云资源统计信息，包括资源总数和云账户数。",
		map[string]interface{}{
			"type":       "object",
			"properties": map[string]interface{}{},
		},
		executor.getStats,
	))

	// list_cloud_accounts
	registry.Register(NewBuiltInTool(
		"list_cloud_accounts",
		"列出所有已配置的云账户信息。",
		map[string]interface{}{
			"type":       "object",
			"properties": map[string]interface{}{},
		},
		executor.listAccounts,
	))
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd E:\AI\multicloud\backend && go build ./internal/agent/...`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add internal/agent/tools.go
git commit -m "feat: migrate existing tools to BuiltInTool"
```

---

### Task 8: Implement Shell Executor

**Files:**
- Create: `backend/internal/agent/shell/executor.go`

- [ ] **Step 1: Create shell/executor.go**

```go
package shell

import (
	"bytes"
	"context"
	"os/exec"
	"time"
)

// Executor runs shell commands.
type Executor struct {
	workspaceDir string
	timeout      time.Duration
}

// Config holds configuration for the shell executor.
type Config struct {
	WorkspaceDir   string
	TimeoutSeconds int
}

// Result holds the result of a shell command execution.
type Result struct {
	Stdout   string
	Stderr   string
	ExitCode int
	Duration time.Duration
}

// NewExecutor creates a new shell executor.
func NewExecutor(cfg Config) *Executor {
	timeout := time.Duration(cfg.TimeoutSeconds) * time.Second
	if timeout <= 0 {
		timeout = 30 * time.Second
	}
	return &Executor{
		workspaceDir: cfg.WorkspaceDir,
		timeout:      timeout,
	}
}

// Execute runs a shell command and returns the result.
func (e *Executor) Execute(ctx context.Context, command, workdir string) (*Result, error) {
	// Create a context with timeout
	ctx, cancel := context.WithTimeout(ctx, e.timeout)
	defer cancel()

	// Determine working directory
	dir := e.workspaceDir
	if workdir != "" {
		dir = workdir
	}

	// Create command
	cmd := exec.CommandContext(ctx, "sh", "-c", command)
	cmd.Dir = dir

	// Capture output
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	// Execute command
	start := time.Now()
	err := cmd.Run()
	duration := time.Since(start)

	// Get exit code
	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			return nil, err
		}
	}

	return &Result{
		Stdout:   stdout.String(),
		Stderr:   stderr.String(),
		ExitCode: exitCode,
		Duration: duration,
	}, nil
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd E:\AI\multicloud\backend && go build ./internal/agent/shell/...`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add internal/agent/shell/executor.go
git commit -m "feat: implement shell executor"
```

---

### Task 9: Create Shell Tool wrapper

**Files:**
- Create: `backend/internal/agent/shell/tool.go`

- [ ] **Step 1: Create shell/tool.go**

```go
package shell

import (
	"context"
	"encoding/json"
	"fmt"

	"multicloud/internal/agent"
)

// Tool wraps a ShellExecutor as an agent.Tool.
type Tool struct {
	executor *Executor
}

// NewTool creates a new shell tool.
func NewTool(executor *Executor) *Tool {
	return &Tool{
		executor: executor,
	}
}

// Name returns the tool name.
func (t *Tool) Name() string {
	return "shell_exec"
}

// Description returns the tool description.
func (t *Tool) Description() string {
	return "执行shell命令并返回输出。可以指定工作目录和超时时间。"
}

// Parameters returns the tool parameters schema.
func (t *Tool) Parameters() map[string]interface{} {
	return map[string]interface{}{
		"type": "object",
		"properties": map[string]interface{}{
			"command": map[string]interface{}{
				"type":        "string",
				"description": "要执行的shell命令",
			},
			"workdir": map[string]interface{}{
				"type":        "string",
				"description": "工作目录（可选，默认使用配置的工作目录）",
			},
			"timeout": map[string]interface{}{
				"type":        "integer",
				"description": "超时时间（秒，可选，默认30秒）",
			},
		},
		"required": []string{"command"},
	}
}

// Execute runs the shell command.
func (t *Tool) Execute(ctx context.Context, args map[string]interface{}) (string, error) {
	command, ok := args["command"].(string)
	if !ok || command == "" {
		return "", fmt.Errorf("command is required")
	}

	workdir, _ := args["workdir"].(string)
	timeout, _ := args["timeout"].(float64)

	// Create executor with custom timeout if provided
	var executor *Executor
	if timeout > 0 {
		executor = NewExecutor(Config{
			WorkspaceDir:   t.executor.workspaceDir,
			TimeoutSeconds: int(timeout),
		})
	} else {
		executor = t.executor
	}

	result, err := executor.Execute(ctx, command, workdir)
	if err != nil {
		return "", fmt.Errorf("execution failed: %w", err)
	}

	// Format result as JSON
	output := map[string]interface{}{
		"stdout":    result.Stdout,
		"stderr":    result.Stderr,
		"exit_code": result.ExitCode,
		"duration":  result.Duration.String(),
	}
	b, _ := json.Marshal(output)
	return string(b), nil
}

// Ensure Tool implements agent.Tool
var _ agent.Tool = (*Tool)(nil)
```

- [ ] **Step 2: Verify compilation**

Run: `cd E:\AI\multicloud\backend && go build ./internal/agent/shell/...`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add internal/agent/shell/tool.go
git commit -m "feat: create shell tool wrapper"
```

---

### Task 10: Implement Tool Router

**Files:**
- Create: `backend/internal/agent/router.go`

- [ ] **Step 1: Create router.go**

```go
package agent

import (
	"context"
	"encoding/json"
	"fmt"
)

// ToolCall represents a tool call from the LLM.
type ToolCall struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"`
	Function FunctionCall `json:"function"`
}

// FunctionCall represents the function call details.
type FunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

// Router routes tool calls to the appropriate tool.
type Router struct {
	registry *ToolRegistry
}

// NewRouter creates a new tool router.
func NewRouter(registry *ToolRegistry) *Router {
	return &Router{
		registry: registry,
	}
}

// Route executes a tool call and returns the result.
func (r *Router) Route(ctx context.Context, toolCall ToolCall) (string, error) {
	// Find the tool
	tool, ok := r.registry.Get(toolCall.Function.Name)
	if !ok {
		return "", fmt.Errorf("unknown tool: %s", toolCall.Function.Name)
	}

	// Parse arguments
	var args map[string]interface{}
	if toolCall.Function.Arguments != "" {
		if err := json.Unmarshal([]byte(toolCall.Function.Arguments), &args); err != nil {
			return "", fmt.Errorf("failed to parse arguments: %w", err)
		}
	} else {
		args = make(map[string]interface{})
	}

	// Execute the tool
	return tool.Execute(ctx, args)
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd E:\AI\multicloud\backend && go build ./internal/agent/...`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add internal/agent/router.go
git commit -m "feat: implement tool router"
```

---

### Task 11: Implement Prompt Builder

**Files:**
- Create: `backend/internal/agent/prompt.go`

- [ ] **Step 1: Create prompt.go**

```go
package agent

import (
	"strings"
)

// PromptBuilder builds system prompts for the agent.
type PromptBuilder struct {
	skills []SkillConfig
}

// SkillConfig defines a skill configuration.
type SkillConfig struct {
	Description  string   `json:"description"`
	SystemPrompt string   `json:"system_prompt"`
	Tools        []string `json:"tools"`
	EnabledTools []string `json:"enabled_tools"`
	Trigger      string   `json:"trigger"`
	Enabled      bool     `json:"enabled"`
}

// NewPromptBuilder creates a new prompt builder.
func NewPromptBuilder() *PromptBuilder {
	return &PromptBuilder{
		skills: make([]SkillConfig, 0),
	}
}

// SetSkills sets the skill configurations.
func (b *PromptBuilder) SetSkills(skills []SkillConfig) {
	b.skills = skills
}

// Build builds the system prompt for the given mode.
func (b *PromptBuilder) Build(mode string) string {
	var sb strings.Builder

	// Base prompt
	sb.WriteString("你是一个云资源管理助手，可以帮助用户管理多个云平台的资源。")
	sb.WriteString("你可以执行以下操作：\n")
	sb.WriteString("- 列出云资源\n")
	sb.WriteString("- 启动、停止、重启云实例\n")
	sb.WriteString("- 同步云资源\n")
	sb.WriteString("- 获取云资源统计\n")
	sb.WriteString("- 列出云账户\n")
	sb.WriteString("- 执行shell命令\n\n")

	// Mode-specific instructions
	switch mode {
	case "plan":
		sb.WriteString("在计划模式下，你应该：\n")
		sb.WriteString("1. 分析用户的需求\n")
		sb.WriteString("2. 制定详细的执行计划\n")
		sb.WriteString("3. 解释每个步骤的目的\n")
		sb.WriteString("4. 等待用户确认后再执行\n\n")
	case "execute":
		sb.WriteString("在执行模式下，你应该：\n")
		sb.WriteString("1. 直接执行用户请求的操作\n")
		sb.WriteString("2. 提供操作结果的简洁报告\n")
		sb.WriteString("3. 如有错误，提供解决方案\n\n")
	default:
		sb.WriteString("请根据用户的需求选择合适的模式。\n\n")
	}

	// Skill prompts
	for _, skill := range b.skills {
		if skill.Enabled && skill.SystemPrompt != "" {
			sb.WriteString(skill.SystemPrompt)
			sb.WriteString("\n\n")
		}
	}

	return sb.String()
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd E:\AI\multicloud\backend && go build ./internal/agent/...`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add internal/agent/prompt.go
git commit -m "feat: implement prompt builder"
```

---

### Task 12: Implement Agent Runtime

**Files:**
- Create: `backend/internal/agent/runtime.go`

- [ ] **Step 1: Create runtime.go**

```go
package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"

	"multicloud/internal/vault"
)

// Runtime orchestrates agent components.
type Runtime struct {
	registry *ToolRegistry
	router   *Router
	prompt   *PromptBuilder
	vault    *vault.Client
	db       *sql.DB
	maxIter  int
}

// RuntimeConfig holds configuration for the runtime.
type RuntimeConfig struct {
	Registry *ToolRegistry
	Vault    *vault.Client
	DB       *sql.DB
	MaxIter  int
}

// NewRuntime creates a new agent runtime.
func NewRuntime(cfg RuntimeConfig) *Runtime {
	registry := cfg.Registry
	if registry == nil {
		registry = NewToolRegistry()
	}

	return &Runtime{
		registry: registry,
		router:   NewRouter(registry),
		prompt:   NewPromptBuilder(),
		vault:    cfg.Vault,
		db:       cfg.DB,
		maxIter:  cfg.MaxIter,
	}
}

// GetToolDefinitions returns tool definitions in OpenAI format.
func (r *Runtime) GetToolDefinitions() []map[string]interface{} {
	return r.registry.GetDefinitions()
}

// GetSystemPrompt returns the system prompt for the given mode.
func (r *Runtime) GetSystemPrompt(mode string) string {
	return r.prompt.Build(mode)
}

// SetSkills sets skill configurations for the prompt builder.
func (r *Runtime) SetSkills(skills []SkillConfig) {
	r.prompt.SetSkills(skills)
}

// ExecuteTool executes a tool by name with the given arguments.
func (r *Runtime) ExecuteTool(ctx context.Context, name string, args map[string]interface{}) (string, error) {
	tool, ok := r.registry.Get(name)
	if !ok {
		return "", fmt.Errorf("unknown tool: %s", name)
	}
	return tool.Execute(ctx, args)
}

// GetToolCallArgs parses tool call arguments from JSON string.
func (r *Runtime) GetToolCallArgs(argsStr string) (map[string]interface{}, error) {
	var args map[string]interface{}
	if argsStr == "" {
		return args, nil
	}
	if err := json.Unmarshal([]byte(argsStr), &args); err != nil {
		return nil, fmt.Errorf("failed to parse arguments: %w", err)
	}
	return args, nil
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd E:\AI\multicloud\backend && go build ./internal/agent/...`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add internal/agent/runtime.go
git commit -m "feat: implement agent runtime"
```

---

## Final Verification

- [ ] **Step 1: Build entire package**

Run: `cd E:\AI\multicloud\backend && go build ./...`
Expected: PASS

- [ ] **Step 2: Run any existing tests**

Run: `cd E:\AI\multicloud\backend && go test ./internal/agent/...`
Expected: PASS (or no tests)

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete agent runtime core implementation"
```