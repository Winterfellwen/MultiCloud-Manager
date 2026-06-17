package skill

import "time"

// SkillTrigger defines skill trigger conditions
type SkillTrigger struct {
	Keywords []string `json:"keywords"`
	Priority int      `json:"priority"`
}

// SkillConfigParam defines skill configuration parameters
type SkillConfigParam struct {
	Name        string      `json:"name"`
	Type        string      `json:"type"` // string, number, boolean
	Default     interface{} `json:"default"`
	Description string      `json:"description"`
}

// Skill defines a skill with structured metadata and content
type Skill struct {
	Name         string                 `json:"name"`
	Description  string                 `json:"description"`
	Enabled      bool                   `json:"enabled"`
	Triggers     []SkillTrigger         `json:"triggers"`
	Tools        []string               `json:"tools"`
	Config       []SkillConfigParam     `json:"config"`
	Content      string                 `json:"content"` // Markdown body
	ConfigValues map[string]interface{} `json:"config_values"` // User configuration values
	LoadedAt     time.Time              `json:"loaded_at"`
}

// GetConfigValue returns the configuration parameter value, or default if not set
func (s *Skill) GetConfigValue(name string) interface{} {
	if s.ConfigValues != nil {
		if v, ok := s.ConfigValues[name]; ok {
			return v
		}
	}
	for _, c := range s.Config {
		if c.Name == name {
			return c.Default
		}
	}
	return nil
}

// GetToolDefinitions returns the skill's bound tool list (for filtering)
func (s *Skill) GetToolDefinitions() []string {
	return s.Tools
}
