package agent

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"strings"

	"multicloud/internal/agent/shell"
	"multicloud/internal/agent/skill"
	"multicloud/internal/cloud"
	"multicloud/internal/vault"
)

// outputCallbackKey is a context key for the tool output callback.
type outputCallbackKey struct{}

// WithOutputCallback returns a context that carries a tool output callback.
func WithOutputCallback(ctx context.Context, cb func(chunk string)) context.Context {
	return context.WithValue(ctx, outputCallbackKey{}, cb)
}

// OutputCallbackFromContext extracts the tool output callback from context.
func OutputCallbackFromContext(ctx context.Context) func(chunk string) {
	if cb, ok := ctx.Value(outputCallbackKey{}).(func(chunk string)); ok {
		return cb
	}
	return nil
}

// Runtime combines all agent components into a single usable unit.
type Runtime struct {
	registry    *ToolRegistry
	router      *Router
	prompt      *PromptBuilder
	executor    *Executor
	docIndex    *DocIndex
	db          *sql.DB
	skillEngine *skill.Engine
}

// RuntimeConfig holds configuration for creating a new Runtime.
type RuntimeConfig struct {
	DB         *sql.DB
	Syncer     *cloud.Syncer
	Vault      vault.Service
	BasePrompt string
	DocsDir    string
	SkillsDir  string // Directory containing SKILL.md files
}

// shellToolWrapper wraps shell.ShellTool to implement agent.Tool interface
type shellToolWrapper struct {
	shellTool *shell.ShellTool
}

func (w *shellToolWrapper) Name() string        { return w.shellTool.Name() }
func (w *shellToolWrapper) Description() string  { return w.shellTool.Description() }
func (w *shellToolWrapper) Parameters() map[string]interface{} { return w.shellTool.Parameters() }
func (w *shellToolWrapper) Execute(ctx context.Context, args map[string]interface{}) (string, error) {
	return w.shellTool.Execute(ctx, args, OutputCallbackFromContext(ctx))
}

// scriptToolWrapper wraps shell.ScriptTool to implement agent.Tool interface
type scriptToolWrapper struct {
	scriptTool *shell.ScriptTool
}

func (w *scriptToolWrapper) Name() string        { return w.scriptTool.Name() }
func (w *scriptToolWrapper) Description() string  { return w.scriptTool.Description() }
func (w *scriptToolWrapper) Parameters() map[string]interface{} { return w.scriptTool.Parameters() }
func (w *scriptToolWrapper) Execute(ctx context.Context, args map[string]interface{}) (string, error) {
	return w.scriptTool.Execute(ctx, args, OutputCallbackFromContext(ctx))
}

// NewRuntime creates and configures a new Runtime.
func NewRuntime(cfg RuntimeConfig) *Runtime {
	registry := NewToolRegistry()
	executor := NewExecutor(cfg.Syncer, cfg.DB, cfg.Vault)
	RegisterBuiltInTools(registry, executor)

	// Register shell executor tools
	shellExecutor := shell.NewExecutor(shell.Config{
		TimeoutSeconds: 300,
		WorkspaceDir:    "/app",
	})
	registry.Register(&shellToolWrapper{shellTool: shell.NewShellTool(shellExecutor)})

	// Register script executor tool (for multi-step operations with shared state)
	registry.Register(&scriptToolWrapper{scriptTool: shell.NewScriptTool(shellExecutor)})

	router := NewRouter(registry)

	basePrompt := cfg.BasePrompt
	if basePrompt == "" {
		basePrompt = DefaultSystemPrompt()
	}
	prompt := NewPromptBuilder(basePrompt)

	docsDir := cfg.DocsDir
	if docsDir == "" {
		docsDir = "docs/cloud-api"
	}
	docIndex := NewDocIndex(docsDir)
	executor.SetDocIndex(docIndex)

	// Initialize skill engine
	skillEngine := skill.NewEngine()
	if cfg.SkillsDir != "" {
		if err := skillEngine.LoadSkills(cfg.SkillsDir); err != nil {
			log.Printf("WARN: failed to load skills from %s: %v", cfg.SkillsDir, err)
		}
	}

	return &Runtime{
		registry:    registry,
		router:      router,
		prompt:      prompt,
		executor:    executor,
		docIndex:    docIndex,
		db:          cfg.DB,
		skillEngine: skillEngine,
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
func (r *Runtime) GetSystemPrompt(mode string, userMessage string) string {
	prompt := r.prompt.Clone()
	if mode != "" {
		prompt.SetMode(mode)
	}

	// Inject skill context if a skill matches the user message
	if r.skillEngine != nil && userMessage != "" {
		matchedSkill := r.skillEngine.MatchSkill(userMessage, 0.1)
		if matchedSkill != nil {
			context := r.skillEngine.GetSkillContext(matchedSkill.Name)
			if context != "" {
				prompt.AddSkillContext(matchedSkill.Name, context)
			}
			// Set skill tools for filtering
			tools := r.skillEngine.GetSkillTools(matchedSkill.Name)
			if len(tools) > 0 {
				prompt.SetSkillTools(tools)
			}
		}
	}

	if r.docIndex != nil && userMessage != "" {
		providers := r.docIndex.DetectProviders(userMessage)
		if len(providers) > 0 {
			var docSections []string
			for _, p := range providers {
				summary := r.docIndex.GetSummary(p)
				if summary != "" {
					displayName := GetProviderDisplayName(p)
					docSections = append(docSections, fmt.Sprintf("#### %s\n%s", displayName, summary))
				}
			}
			if len(docSections) > 0 {
				prompt.AddExtra("Cloud API Quick Reference", strings.Join(docSections, "\n\n"))
			}
		}
	}
	return prompt.Build()
}

// SkillEngine returns the skill engine.
func (r *Runtime) SkillEngine() *skill.Engine {
	return r.skillEngine
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
