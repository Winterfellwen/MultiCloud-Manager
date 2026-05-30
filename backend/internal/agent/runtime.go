package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"

	"multicloud/internal/agent/shell"
	"multicloud/internal/cloud"
	"multicloud/internal/vault"
)

// Runtime combines all agent components into a single usable unit.
type Runtime struct {
	registry *ToolRegistry
	router   *Router
	prompt   *PromptBuilder
	executor *Executor
	vault    *vault.Client
	db       *sql.DB
}

// RuntimeConfig holds configuration for creating a new Runtime.
type RuntimeConfig struct {
	DB       *sql.DB
	Syncer   *cloud.Syncer
	Vault    *vault.Client
	BasePrompt string
}

// shellToolWrapper wraps shell.ShellTool to implement agent.Tool interface
type shellToolWrapper struct {
	shellTool *shell.ShellTool
}

func (w *shellToolWrapper) Name() string        { return w.shellTool.Name() }
func (w *shellToolWrapper) Description() string  { return w.shellTool.Description() }
func (w *shellToolWrapper) Parameters() map[string]interface{} { return w.shellTool.Parameters() }
func (w *shellToolWrapper) Execute(ctx context.Context, args map[string]interface{}) (string, error) {
	return w.shellTool.Execute(ctx, args)
}

// NewRuntime creates and configures a new Runtime.
func NewRuntime(cfg RuntimeConfig) *Runtime {
	registry := NewToolRegistry()
	executor := NewExecutor(cfg.Syncer, cfg.DB)
	RegisterBuiltInTools(registry, executor)

	// Register shell executor tool
	shellExecutor := shell.NewExecutor(shell.Config{
		WorkspaceDir:   "/workspace",
		TimeoutSeconds: 300,
	})
	registry.Register(&shellToolWrapper{shellTool: shell.NewShellTool(shellExecutor)})

	router := NewRouter(registry)

	basePrompt := cfg.BasePrompt
	if basePrompt == "" {
		basePrompt = DefaultSystemPrompt()
	}
	prompt := NewPromptBuilder(basePrompt)

	return &Runtime{
		registry: registry,
		router:   router,
		prompt:   prompt,
		executor: executor,
		vault:    cfg.Vault,
		db:       cfg.DB,
	}
}

// Registry returns the tool registry.
func (r *Runtime) Registry() *ToolRegistry {
	return r.registry
}

// Router returns the tool router.
func (r *Runtime) Router() *Router {
	return r.router
}

// Prompt returns the prompt builder.
func (r *Runtime) Prompt() *PromptBuilder {
	return r.prompt
}

// Executor returns the underlying executor.
func (r *Runtime) Executor() *Executor {
	return r.executor
}

// Vault returns the vault client.
func (r *Runtime) Vault() *vault.Client {
	return r.vault
}

// DB returns the database connection.
func (r *Runtime) DB() *sql.DB {
	return r.db
}

// ExecuteTool is a convenience method that routes a tool call through the router.
func (r *Runtime) ExecuteTool(ctx context.Context, name string, args map[string]interface{}) (string, error) {
	return r.router.RouteByName(ctx, name, args)
}

// ExecuteToolCall routes a full ToolCall through the router.
func (r *Runtime) ExecuteToolCall(ctx context.Context, tc ToolCall) (string, error) {
	return r.router.Route(ctx, tc)
}

// GetToolDefinitions returns all tool definitions in OpenAI function-calling format.
func (r *Runtime) GetToolDefinitions() []map[string]interface{} {
	return r.registry.GetDefinitions()
}

// BuildPrompt builds and returns the current system prompt.
func (r *Runtime) BuildPrompt() string {
	return r.prompt.Build()
}

// GetSystemPrompt builds the system prompt for the given mode.
func (r *Runtime) GetSystemPrompt(mode string) string {
	prompt := r.prompt
	if mode != "" {
		prompt = prompt.SetMode(mode)
	}
	return prompt.Build()
}

// ChatSession represents a conversation session with the agent.
type ChatSession struct {
	ID       string
	Runtime  *Runtime
	History  []ChatMessage
}

// ChatMessage represents a single message in a conversation.
type ChatMessage struct {
	Role    string      `json:"role"`
	Content string      `json:"content"`
	ToolCalls []ToolCall `json:"tool_calls,omitempty"`
}

// NewChatSession creates a new chat session.
func (r *Runtime) NewChatSession(id string) *ChatSession {
	return &ChatSession{
		ID:      id,
		Runtime: r,
		History: make([]ChatMessage, 0),
	}
}

// ProcessToolCalls executes a slice of tool calls and returns the results.
func (s *ChatSession) ProcessToolCalls(ctx context.Context, calls []ToolCall) []ToolCallResult {
	results := make([]ToolCallResult, 0, len(calls))
	for _, call := range calls {
		output, err := s.Runtime.ExecuteToolCall(ctx, call)
		status := "success"
		if err != nil {
			status = "error"
			output = fmt.Sprintf(`{"error": "%s"}`, err.Error())
		}
		results = append(results, ToolCallResult{
			ToolCallID: call.ID,
			Output:     output,
			Status:     status,
		})
	}
	return results
}

// ToolCallResult holds the result of executing a single tool call.
type ToolCallResult struct {
	ToolCallID string `json:"tool_call_id"`
	Output     string `json:"output"`
	Status     string `json:"status"`
}

// ToJSON marshals the result to JSON.
func (r ToolCallResult) ToJSON() (string, error) {
	b, err := json.Marshal(r)
	if err != nil {
		return "", fmt.Errorf("marshaling result: %w", err)
	}
	return string(b), nil
}

// LogToolCall records a tool call in the audit log.
func (r *Runtime) LogToolCall(ctx context.Context, sessionID, toolName, input, output string) {
	if r.db == nil {
		return
	}
	_, err := r.db.ExecContext(ctx,
		`INSERT INTO audit_logs (session_id, action, details) VALUES ($1, $2, $3::jsonb)`,
		sessionID,
		"tool_call",
		fmt.Sprintf(`{"tool": "%s", "input": %s, "output": %s}`, toolName, input, output),
	)
	if err != nil {
		log.Printf("runtime: failed to log tool call: %v", err)
	}
}
