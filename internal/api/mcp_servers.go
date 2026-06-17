package api

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/gin-gonic/gin"
)

// MCPServer represents a configurable MCP server entry.
type MCPServer struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	Transport   string            `json:"transport"` // stdio, sse, http
	Command     string            `json:"command,omitempty"`
	Args        []string          `json:"args,omitempty"`
	URL         string            `json:"url,omitempty"`
	Headers     map[string]string `json:"headers,omitempty"`
	Env         map[string]string `json:"env,omitempty"`
	Enabled     bool              `json:"enabled"`
	Timeout     int               `json:"timeout"`
	Description string            `json:"description"`
}

type MCPServerHandler struct {
	db *sql.DB
}

func NewMCPServerHandler(db *sql.DB) *MCPServerHandler {
	return &MCPServerHandler{db: db}
}

// ListMCPServers returns all configured MCP servers.
func (h *MCPServerHandler) List(c *gin.Context) {
	rows, err := h.db.Query(`SELECT id, name, transport, command, args, url, headers, env, enabled, timeout, description FROM mcp_servers ORDER BY name`)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	defer rows.Close()

	var servers []MCPServer
	for rows.Next() {
		var s MCPServer
		var argsJSON, headersJSON, envJSON []byte
		err := rows.Scan(&s.ID, &s.Name, &s.Transport, &s.Command, &argsJSON, &s.URL, &headersJSON, &envJSON, &s.Enabled, &s.Timeout, &s.Description)
		if err != nil {
			continue
		}
		json.Unmarshal(argsJSON, &s.Args)
		json.Unmarshal(headersJSON, &s.Headers)
		json.Unmarshal(envJSON, &s.Env)
		servers = append(servers, s)
	}

	c.JSON(http.StatusOK, gin.H{"servers": servers})
}

// GetMCPServer returns a single MCP server by ID.
func (h *MCPServerHandler) Get(c *gin.Context) {
	id := c.Param("id")
	var s MCPServer
	var argsJSON, headersJSON, envJSON []byte
	err := h.db.QueryRow(`SELECT id, name, transport, command, args, url, headers, env, enabled, timeout, description FROM mcp_servers WHERE id = $1`, id).
		Scan(&s.ID, &s.Name, &s.Transport, &s.Command, &argsJSON, &s.URL, &headersJSON, &envJSON, &s.Enabled, &s.Timeout, &s.Description)
	if err == sql.ErrNoRows {
		c.JSON(http.StatusNotFound, gin.H{"error": "server not found"})
		return
	}
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	json.Unmarshal(argsJSON, &s.Args)
	json.Unmarshal(headersJSON, &s.Headers)
	json.Unmarshal(envJSON, &s.Env)
	c.JSON(http.StatusOK, s)
}

// CreateMCPServer creates a new MCP server configuration.
func (h *MCPServerHandler) Create(c *gin.Context) {
	var s MCPServer
	if err := c.ShouldBindJSON(&s); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	argsJSON, _ := json.Marshal(s.Args)
	headersJSON, _ := json.Marshal(s.Headers)
	envJSON, _ := json.Marshal(s.Env)

	_, err := h.db.Exec(`
		INSERT INTO mcp_servers (id, name, transport, command, args, url, headers, env, enabled, timeout, description)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
		ON CONFLICT (id) DO UPDATE SET
			name = $2, transport = $3, command = $4, args = $5, url = $6,
			headers = $7, env = $8, enabled = $9, timeout = $10, description = $11`,
		s.ID, s.Name, s.Transport, s.Command, argsJSON, s.URL, headersJSON, envJSON, s.Enabled, s.Timeout, s.Description,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "MCP server saved"})
}

// DeleteMCPServer removes an MCP server configuration.
func (h *MCPServerHandler) Delete(c *gin.Context) {
	id := c.Param("id")
	_, err := h.db.Exec(`DELETE FROM mcp_servers WHERE id = $1`, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "MCP server deleted"})
}

// ToggleMCPServer enables/disables an MCP server.
func (h *MCPServerHandler) Toggle(c *gin.Context) {
	id := c.Param("id")
	var req struct {
		Enabled bool `json:"enabled"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	_, err := h.db.Exec(`UPDATE mcp_servers SET enabled = $1 WHERE id = $2`, req.Enabled, id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "MCP server updated"})
}

// TestMCPServer tests connectivity to an MCP server.
func (h *MCPServerHandler) Test(c *gin.Context) {
	id := c.Param("id")
	var s MCPServer
	var argsJSON, headersJSON, envJSON []byte
	err := h.db.QueryRow(`SELECT id, name, transport, command, args, url, headers, env, enabled, timeout, description FROM mcp_servers WHERE id = $1`, id).
		Scan(&s.ID, &s.Name, &s.Transport, &s.Command, &argsJSON, &s.URL, &headersJSON, &envJSON, &s.Enabled, &s.Timeout, &s.Description)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	json.Unmarshal(argsJSON, &s.Args)
	json.Unmarshal(headersJSON, &s.Headers)
	json.Unmarshal(envJSON, &s.Env)

	// Simple connectivity check based on transport type
	if s.Transport == "http" || s.Transport == "sse" {
		if s.URL == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "URL is required for HTTP/SSE transport"})
			return
		}
		// TODO: Implement actual HTTP health check
		c.JSON(http.StatusOK, gin.H{"message": "Configuration valid", "server": s.Name})
		return
	}

	if s.Transport == "stdio" {
		if s.Command == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Command is required for stdio transport"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Configuration valid", "server": s.Name})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Configuration valid", "server": s.Name})
}

// BuiltInMCPServers provides preset configurations for popular MCP servers.
var BuiltInMCPServers = []MCPServer{
	{
		ID:          "filesystem",
		Name:        "File System",
		Transport:   "stdio",
		Command:     "npx",
		Args:        []string{"-y", "@modelcontextprotocol/server-filesystem", "/tmp"},
		Description: "Read and write files on the local filesystem",
		Enabled:     false,
		Timeout:     30,
	},
	{
		ID:          "postgres",
		Name:        "PostgreSQL",
		Transport:   "stdio",
		Command:     "npx",
		Args:        []string{"-y", "@modelcontextprotocol/server-postgres", "postgresql://localhost/db"},
		Description: "Query PostgreSQL databases",
		Enabled:     false,
		Timeout:     30,
	},
	{
		ID:          "github",
		Name:        "GitHub",
		Transport:   "stdio",
		Command:     "npx",
		Args:        []string{"-y", "@modelcontextprotocol/server-github"},
		Env:         map[string]string{"GITHUB_PERSONAL_ACCESS_TOKEN": ""},
		Description: "Access GitHub repositories, issues, and pull requests",
		Enabled:     false,
		Timeout:     30,
	},
	{
		ID:          "slack",
		Name:        "Slack",
		Transport:   "stdio",
		Command:     "npx",
		Args:        []string{"-y", "@modelcontextprotocol/server-slack"},
		Env:         map[string]string{"SLACK_BOT_TOKEN": "", "SLACK_TEAM_ID": ""},
		Description: "Send messages and manage Slack channels",
		Enabled:     false,
		Timeout:     30,
	},
	{
		ID:          "kubernetes",
		Name:        "Kubernetes",
		Transport:   "stdio",
		Command:     "npx",
		Args:        []string{"-y", "@modelcontextprotocol/server-kubernetes"},
		Description: "Manage Kubernetes clusters and resources",
		Enabled:     false,
		Timeout:     30,
	},
}

// ListBuiltInMCPServers returns preset MCP server configurations.
func ListBuiltInMCPServers(c *gin.Context) {
	c.JSON(http.StatusOK, gin.H{"servers": BuiltInMCPServers})
}
