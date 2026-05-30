package agent

import (
	"context"
	"encoding/json"
	"fmt"
)

// ToolCall represents a single tool call request from the LLM.
type ToolCall struct {
	ID       string       `json:"id"`
	Type     string       `json:"type"`
	Function FunctionCall `json:"function"`
}

// FunctionCall holds the function name and arguments for a tool call.
type FunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

// Router dispatches tool calls to the appropriate registered tool.
type Router struct {
	registry *ToolRegistry
}

// NewRouter creates a Router backed by the given ToolRegistry.
func NewRouter(registry *ToolRegistry) *Router {
	return &Router{registry: registry}
}

// Route parses a ToolCall, invokes the corresponding tool, and returns the result.
func (r *Router) Route(ctx context.Context, toolCall ToolCall) (string, error) {
	tool, ok := r.registry.Get(toolCall.Function.Name)
	if !ok {
		return "", fmt.Errorf("unknown tool: %s", toolCall.Function.Name)
	}

	var args map[string]interface{}
	if toolCall.Function.Arguments != "" {
		if err := json.Unmarshal([]byte(toolCall.Function.Arguments), &args); err != nil {
			return "", fmt.Errorf("failed to parse tool arguments: %w", err)
		}
	}
	if args == nil {
		args = map[string]interface{}{}
	}

	return tool.Execute(ctx, args)
}

// RouteByName is a convenience method that looks up a tool by name and executes it directly.
func (r *Router) RouteByName(ctx context.Context, name string, args map[string]interface{}) (string, error) {
	tool, ok := r.registry.Get(name)
	if !ok {
		return "", fmt.Errorf("unknown tool: %s", name)
	}
	if args == nil {
		args = map[string]interface{}{}
	}
	return tool.Execute(ctx, args)
}
