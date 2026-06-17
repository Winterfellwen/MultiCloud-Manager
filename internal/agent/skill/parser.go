package skill

import (
	"fmt"
	"os"
	"strings"

	"gopkg.in/yaml.v3"
)

// skillFileYAML defines the YAML front matter structure of SKILL.md
type skillFileYAML struct {
	Name        string `yaml:"name"`
	Description string `yaml:"description"`
	Triggers    []struct {
		Keywords []string `yaml:"keywords"`
		Priority int      `yaml:"priority"`
	} `yaml:"triggers"`
	Tools  []string `yaml:"tools"`
	Config []struct {
		Name        string      `yaml:"name"`
		Type        string      `yaml:"type"`
		Default     interface{} `yaml:"default"`
		Description string      `yaml:"description"`
	} `yaml:"config"`
}

// ParseSKILLFile parses a SKILL.md file with YAML front matter and Markdown body
func ParseSKILLFile(path string) (*Skill, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read skill file %s: %w", path, err)
	}

	content := string(data)

	// Check for YAML front matter
	if !strings.HasPrefix(content, "---") {
		return nil, fmt.Errorf("skill file %s missing YAML front matter", path)
	}

	// Split YAML and Markdown
	parts := strings.SplitN(content[3:], "---", 2)
	if len(parts) != 2 {
		return nil, fmt.Errorf("skill file %s invalid format: missing closing ---", path)
	}

	yamlPart := strings.TrimSpace(parts[0])
	markdownPart := strings.TrimSpace(parts[1])

	// Parse YAML
	var fileYAML skillFileYAML
	if err := yaml.Unmarshal([]byte(yamlPart), &fileYAML); err != nil {
		return nil, fmt.Errorf("parse YAML front matter in %s: %w", path, err)
	}

	// Convert to Skill struct
	skill := &Skill{
		Name:         fileYAML.Name,
		Description:  fileYAML.Description,
		Enabled:      true, // Default enabled
		Content:      markdownPart,
		ConfigValues: make(map[string]interface{}),
	}

	// Convert triggers
	for _, t := range fileYAML.Triggers {
		skill.Triggers = append(skill.Triggers, SkillTrigger{
			Keywords: t.Keywords,
			Priority: t.Priority,
		})
	}

	// Convert tools
	skill.Tools = fileYAML.Tools

	// Convert config
	for _, c := range fileYAML.Config {
		skill.Config = append(skill.Config, SkillConfigParam{
			Name:        c.Name,
			Type:        c.Type,
			Default:     c.Default,
			Description: c.Description,
		})
	}

	return skill, nil
}
