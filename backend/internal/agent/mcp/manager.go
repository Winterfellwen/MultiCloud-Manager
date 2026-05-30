package mcp

import (
	"context"
	"log"
	"sync"
)

type Manager struct {
	clients map[string]*Client
	configs map[string]ServerConfig
	mu      sync.RWMutex
}

func NewManager() *Manager {
	return &Manager{
		clients: make(map[string]*Client),
		configs: make(map[string]ServerConfig),
	}
}

func (m *Manager) LoadConfigs(configs map[string]ServerConfig) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.configs = configs
}

func (m *Manager) ConnectAll(ctx context.Context) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	for name, cfg := range m.configs {
		if !cfg.Enabled {
			continue
		}
		go m.connect(ctx, name, cfg)
	}
}

func (m *Manager) connect(ctx context.Context, name string, cfg ServerConfig) {
	client := NewClient(name, cfg)
	if err := client.Connect(ctx); err != nil {
		log.Printf("mcp[%s]: connect failed: %v", name, err)
		return
	}
	m.mu.Lock()
	m.clients[name] = client
	m.mu.Unlock()
	log.Printf("mcp[%s]: connected", name)
}

func (m *Manager) GetAllTools(ctx context.Context) []MCPTool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	var tools []MCPTool
	for name, client := range m.clients {
		t, err := client.ListTools(ctx)
		if err != nil {
			log.Printf("mcp[%s]: list tools: %v", name, err)
			continue
		}
		for _, tool := range t {
			tools = append(tools, MCPTool{Name: tool.Name, Description: tool.Description, Client: client, ServerName: name})
		}
	}
	return tools
}

type MCPTool struct {
	Name        string
	Description string
	Client      *Client
	ServerName  string
}

func (m *Manager) CloseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for _, client := range m.clients {
		client.Close()
	}
	m.clients = make(map[string]*Client)
}
