package mcp

import (
	"context"
	"fmt"
	"os"
	"os/exec"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

type Client struct {
	name    string
	config  ServerConfig
	session *mcp.ClientSession
}

func NewClient(name string, config ServerConfig) *Client {
	return &Client{name: name, config: config}
}

func (c *Client) Connect(ctx context.Context) error {
	var transport mcp.Transport

	switch c.config.Transport {
	case "stdio":
		cmd := exec.CommandContext(ctx, c.config.Command, c.config.Args...)
		cmd.Env = append(os.Environ(), envToList(c.config.Env)...)
		transport = &mcp.CommandTransport{Command: cmd}
	case "http":
		transport = &mcp.StreamableClientTransport{Endpoint: c.config.URL}
	case "sse":
		transport = &mcp.SSEClientTransport{Endpoint: c.config.URL}
	default:
		return fmt.Errorf("unsupported transport: %s", c.config.Transport)
	}

	client := mcp.NewClient(&mcp.Implementation{
		Name:    "multicloud-agent",
		Version: "1.0.0",
	}, nil)

	session, err := client.Connect(ctx, transport, nil)
	if err != nil {
		return fmt.Errorf("connect: %w", err)
	}
	c.session = session
	return nil
}

func (c *Client) ListTools(ctx context.Context) ([]*mcp.Tool, error) {
	result, err := c.session.ListTools(ctx, &mcp.ListToolsParams{})
	if err != nil {
		return nil, err
	}
	return result.Tools, nil
}

func (c *Client) CallTool(ctx context.Context, name string, args map[string]any) (string, error) {
	result, err := c.session.CallTool(ctx, &mcp.CallToolParams{
		Name:      name,
		Arguments: args,
	})
	if err != nil {
		return "", err
	}
	var text string
	for _, content := range result.Content {
		if tc, ok := content.(*mcp.TextContent); ok {
			text += tc.Text
		}
	}
	return text, nil
}

func (c *Client) Close() error {
	if c.session != nil {
		return c.session.Close()
	}
	return nil
}

func envToList(env map[string]string) []string {
	var list []string
	for k, v := range env {
		list = append(list, k+"="+v)
	}
	return list
}
