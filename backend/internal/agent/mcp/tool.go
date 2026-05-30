package mcp

import (
	"context"
	"fmt"

	"multicloud/internal/agent"
)

type ToolWrapper struct {
	mcpTool MCPTool
}

func NewToolWrapper(t MCPTool) *ToolWrapper {
	return &ToolWrapper{mcpTool: t}
}

func (t *ToolWrapper) Name() string {
	return fmt.Sprintf("mcp_%s_%s", t.mcpTool.ServerName, t.mcpTool.Name)
}

func (t *ToolWrapper) Description() string {
	return t.mcpTool.Description
}

func (t *ToolWrapper) Parameters() map[string]interface{} {
	return map[string]interface{}{"type": "object", "properties": map[string]interface{}{}}
}

func (t *ToolWrapper) Execute(ctx context.Context, args map[string]interface{}) (string, error) {
	return t.mcpTool.Client.CallTool(ctx, t.mcpTool.Name, args)
}

var _ agent.Tool = (*ToolWrapper)(nil)
