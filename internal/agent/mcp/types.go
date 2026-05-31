package mcp

type ServerConfig struct {
	Transport string            `json:"transport"`
	Command   string            `json:"command"`
	Args      []string          `json:"args"`
	URL       string            `json:"url"`
	Headers   map[string]string `json:"headers"`
	Env       map[string]string `json:"env"`
	Enabled   bool              `json:"enabled"`
	Timeout   int               `json:"timeout"`
}
