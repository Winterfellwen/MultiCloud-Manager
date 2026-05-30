package mcp

import (
	"context"
	"encoding/json"
	"fmt"
)

type Client struct {
	config ServerConfig
	transport interface {
		Start(ctx context.Context) error
		SendRequest(ctx context.Context, method string, params interface{}) (*JSONRPCResponse, error)
		Close() error
	}
	tools []Tool
}

func NewClient(config ServerConfig) *Client {
	return &Client{config: config}
}

func (c *Client) Connect(ctx context.Context) error {
	switch c.config.Transport {
	case "stdio":
		t := NewStdioTransport(c.config.Command, c.config.Args, c.config.Env)
		if err := t.Start(ctx); err != nil {
			return fmt.Errorf("stdio start: %w", err)
		}
		c.transport = t
	case "sse":
		t := NewSSETransport(c.config.URL, c.config.Headers)
		if err := t.Start(ctx); err != nil {
			return fmt.Errorf("sse start: %w", err)
		}
		c.transport = t
	default:
		return fmt.Errorf("unsupported transport: %s", c.config.Transport)
	}
	return nil
}

func (c *Client) Initialize(ctx context.Context) error {
	initParams := map[string]interface{}{
		"protocolVersion": "2024-11-05",
		"capabilities":    map[string]interface{}{},
		"clientInfo": map[string]interface{}{
			"name":    "multicloud-agent",
			"version": "1.0.0",
		},
	}

	resp, err := c.transport.SendRequest(ctx, "initialize", initParams)
	if err != nil {
		return fmt.Errorf("initialize: %w", err)
	}
	_ = resp

	notificationsResp, err := c.transport.SendRequest(ctx, "notifications/initialized", nil)
	if err != nil {
		return fmt.Errorf("notifications/initialized: %w", err)
	}
	_ = notificationsResp

	return c.refreshTools(ctx)
}

func (c *Client) refreshTools(ctx context.Context) error {
	resp, err := c.transport.SendRequest(ctx, "tools/list", nil)
	if err != nil {
		return fmt.Errorf("tools/list: %w", err)
	}

	resultBytes, err := json.Marshal(resp.Result)
	if err != nil {
		return fmt.Errorf("marshal result: %w", err)
	}

	var result struct {
		Tools []Tool `json:"tools"`
	}
	if err := json.Unmarshal(resultBytes, &result); err != nil {
		return fmt.Errorf("unmarshal tools: %w", err)
	}

	c.tools = result.Tools
	return nil
}

func (c *Client) GetTools() []Tool {
	return c.tools
}

func (c *Client) CallTool(ctx context.Context, name string, args map[string]interface{}) (string, error) {
	params := ToolCallParams{
		Name:      name,
		Arguments: args,
	}

	resp, err := c.transport.SendRequest(ctx, "tools/call", params)
	if err != nil {
		return "", fmt.Errorf("call tool %s: %w", name, err)
	}

	resultBytes, err := json.Marshal(resp.Result)
	if err != nil {
		return "", fmt.Errorf("marshal result: %w", err)
	}

	var result struct {
		Content []struct {
			Type string `json:"type"`
			Text string `json:"text"`
		} `json:"content"`
	}
	if err := json.Unmarshal(resultBytes, &result); err != nil {
		return string(resultBytes), nil
	}

	if len(result.Content) > 0 {
		return result.Content[0].Text, nil
	}
	return string(resultBytes), nil
}

func (c *Client) Close() error {
	if c.transport != nil {
		return c.transport.Close()
	}
	return nil
}
