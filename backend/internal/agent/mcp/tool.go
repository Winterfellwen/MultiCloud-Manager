package mcp

import (
	"context"
)

type MCPTool struct {
	mcpTool    Tool
	serverName string
	client     *Client
}

func NewMCPTool(serverName string, mcpTool Tool, client *Client) *MCPTool {
	return &MCPTool{
		mcpTool:    mcpTool,
		serverName: serverName,
		client:     client,
	}
}

func (t *MCPTool) Name() string {
	return t.mcpTool.Name
}

func (t *MCPTool) Description() string {
	return t.mcpTool.Description
}

func (t *MCPTool) Parameters() map[string]interface{} {
	return t.mcpTool.InputSchema
}

func (t *MCPTool) Execute(ctx context.Context, args map[string]interface{}) (string, error) {
	return t.client.CallTool(ctx, t.mcpTool.Name, args)
}

func (t *MCPTool) ServerName() string {
	return t.serverName
}
