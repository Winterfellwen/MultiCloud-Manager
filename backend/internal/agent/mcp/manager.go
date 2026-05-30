package mcp

import (
	"context"
	"fmt"
	"log"
	"sync"
)

type Manager struct {
	mu      sync.Mutex
	clients map[string]*Client
	configs map[string]ServerConfig
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

func (m *Manager) ConnectAll(ctx context.Context) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	for name, config := range m.configs {
		if !config.Enabled {
			continue
		}
		client := NewClient(config)
		if err := client.Connect(ctx); err != nil {
			log.Printf("mcp: failed to connect to %s: %v", name, err)
			continue
		}
		if err := client.Initialize(ctx); err != nil {
			log.Printf("mcp: failed to initialize %s: %v", name, err)
			client.Close()
			continue
		}
		m.clients[name] = client
	}
	return nil
}

func (m *Manager) GetAllTools() []Tool {
	m.mu.Lock()
	defer m.mu.Unlock()

	var allTools []Tool
	for name, client := range m.clients {
		tools := client.GetTools()
		for i := range tools {
			tools[i].Name = fmt.Sprintf("%s__%s", name, tools[i].Name)
		}
		allTools = append(allTools, tools...)
	}
	return allTools
}

func (m *Manager) CallTool(ctx context.Context, serverName, toolName string, args map[string]interface{}) (string, error) {
	m.mu.Lock()
	client, ok := m.clients[serverName]
	m.mu.Unlock()
	if !ok {
		return "", fmt.Errorf("server not connected: %s", serverName)
	}
	return client.CallTool(ctx, toolName, args)
}

func (m *Manager) CloseAll() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for name, client := range m.clients {
		if err := client.Close(); err != nil {
			log.Printf("mcp: failed to close %s: %v", name, err)
		}
	}
	m.clients = make(map[string]*Client)
}

func (m *Manager) Client(name string) (*Client, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	c, ok := m.clients[name]
	return c, ok
}

func (m *Manager) ServerNames() []string {
	m.mu.Lock()
	defer m.mu.Unlock()
	names := make([]string, 0, len(m.clients))
	for name := range m.clients {
		names = append(names, name)
	}
	return names
}
