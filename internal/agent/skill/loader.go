package skill

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"multicloud/internal/agent/mcp"
)

type ConfigFile struct {
	Shell struct {
		Enabled        bool   `json:"enabled"`
		WorkspaceDir   string `json:"workspace_dir"`
		TimeoutSeconds int    `json:"timeout_seconds"`
	} `json:"shell"`
	MCPServers map[string]mcp.ServerConfig `json:"mcp_servers"`
	Skills     map[string]struct {
		Enabled bool `json:"enabled"`
	} `json:"skills"`
	Vault struct {
		Addr     string `json:"addr"`
		RoleID   string `json:"role_id"`
		SecretID string `json:"secret_id"`
	} `json:"vault"`
}

func LoadFromFile(path string) (*ConfigFile, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config file: %w", err)
	}
	var cfg ConfigFile
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config file: %w", err)
	}
	if cfg.MCPServers == nil {
		cfg.MCPServers = make(map[string]mcp.ServerConfig)
	}
	if cfg.Skills == nil {
		cfg.Skills = make(map[string]struct {
			Enabled bool `json:"enabled"`
		})
	}
	return &cfg, nil
}

func SaveToFile(path string, cfg *ConfigFile) error {
	data, err := json.MarshalIndent(cfg, "", "  ")
	if err != nil {
		return fmt.Errorf("marshal config: %w", err)
	}
	if err := os.WriteFile(path, data, 0644); err != nil {
		return fmt.Errorf("write config file: %w", err)
	}
	return nil
}

// LoadSkillsFromDir loads all SKILL.md files from a directory
func LoadSkillsFromDir(dir string) ([]*Skill, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil // Directory does not exist, return empty list
		}
		return nil, fmt.Errorf("read skills dir %s: %w", dir, err)
	}

	var skills []*Skill
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}

		skillPath := filepath.Join(dir, entry.Name(), "SKILL.md")
		if _, err := os.Stat(skillPath); os.IsNotExist(err) {
			continue
		}

		skill, err := ParseSKILLFile(skillPath)
		if err != nil {
			// Log error but continue loading other skills
			fmt.Printf("WARN: failed to load skill from %s: %v\n", skillPath, err)
			continue
		}

		skills = append(skills, skill)
	}

	return skills, nil
}
