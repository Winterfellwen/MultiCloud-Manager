package skill

import (
	"fmt"
	"sync"
)

type SkillConfig struct {
	Enabled bool `json:"enabled"`
}

type Engine struct {
	mu      sync.RWMutex
	skills  map[string]*Skill
	matcher *Matcher
}

// NewEngine creates a skill engine
func NewEngine() *Engine {
	return &Engine{
		skills: make(map[string]*Skill),
	}
}

// LoadSkills loads skills from directory
func (e *Engine) LoadSkills(dir string) error {
	skills, err := LoadSkillsFromDir(dir)
	if err != nil {
		return err
	}

	e.mu.Lock()
	defer e.mu.Unlock()

	for _, skill := range skills {
		e.skills[skill.Name] = skill
	}

	e.matcher = NewMatcher(e.getSkillList())
	return nil
}

// GetSkill gets a specific skill
func (e *Engine) GetSkill(name string) *Skill {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.skills[name]
}

// GetActiveSkills returns all enabled skills
func (e *Engine) GetActiveSkills() []*Skill {
	e.mu.RLock()
	defer e.mu.RUnlock()

	var result []*Skill
	for _, skill := range e.skills {
		if skill.Enabled {
			result = append(result, skill)
		}
	}
	return result
}

// MatchSkill matches the best skill based on input
func (e *Engine) MatchSkill(input string, threshold float64) *Skill {
	e.mu.RLock()
	defer e.mu.RUnlock()

	if e.matcher == nil {
		return nil
	}
	return e.matcher.BestMatch(input, threshold)
}

// GetSkillTools returns the tool list bound to a skill
func (e *Engine) GetSkillTools(skillName string) []string {
	e.mu.RLock()
	defer e.mu.RUnlock()

	skill, ok := e.skills[skillName]
	if !ok || !skill.Enabled {
		return nil
	}
	return skill.Tools
}

// GetSkillContext returns the skill's context content (for prompt injection)
func (e *Engine) GetSkillContext(skillName string) string {
	e.mu.RLock()
	defer e.mu.RUnlock()

	skill, ok := e.skills[skillName]
	if !ok || !skill.Enabled {
		return ""
	}

	// Build skill context
	var context string
	context += fmt.Sprintf("## Skill: %s\n\n", skill.Name)
	context += fmt.Sprintf("%s\n\n", skill.Description)
	context += fmt.Sprintf("### Available Tools\n")
	for _, tool := range skill.Tools {
		context += fmt.Sprintf("- %s\n", tool)
	}
	context += fmt.Sprintf("\n### Usage Guide\n\n%s\n", skill.Content)

	return context
}

// EnableSkill enables a skill
func (e *Engine) EnableSkill(name string) bool {
	e.mu.Lock()
	defer e.mu.Unlock()

	skill, ok := e.skills[name]
	if !ok {
		return false
	}
	skill.Enabled = true
	e.matcher = NewMatcher(e.getSkillList())
	return true
}

// DisableSkill disables a skill
func (e *Engine) DisableSkill(name string) bool {
	e.mu.Lock()
	defer e.mu.Unlock()

	skill, ok := e.skills[name]
	if !ok {
		return false
	}
	skill.Enabled = false
	e.matcher = NewMatcher(e.getSkillList())
	return true
}

// UpdateConfig updates skill configuration
func (e *Engine) UpdateConfig(name string, values map[string]interface{}) bool {
	e.mu.Lock()
	defer e.mu.Unlock()

	skill, ok := e.skills[name]
	if !ok {
		return false
	}

	if skill.ConfigValues == nil {
		skill.ConfigValues = make(map[string]interface{})
	}

	for k, v := range values {
		skill.ConfigValues[k] = v
	}
	return true
}

// getSkillList returns skill list (internal use, caller must hold lock)
func (e *Engine) getSkillList() []*Skill {
	var result []*Skill
	for _, skill := range e.skills {
		result = append(result, skill)
	}
	return result
}

// GetAllSkills returns all skills including disabled ones
func (e *Engine) GetAllSkills() []*Skill {
	e.mu.RLock()
	defer e.mu.RUnlock()
	return e.getSkillList()
}

// Legacy methods for backward compatibility

func (e *Engine) LoadSkillsLegacy(skills map[string]*SkillConfig) {
	e.mu.Lock()
	defer e.mu.Unlock()
	for name, cfg := range skills {
		if _, exists := e.skills[name]; !exists {
			e.skills[name] = &Skill{
				Name:    name,
				Enabled: cfg.Enabled,
			}
		}
	}
}

func (e *Engine) IsEnabled(name string) bool {
	e.mu.RLock()
	defer e.mu.RUnlock()
	s, ok := e.skills[name]
	if !ok {
		return false
	}
	return s.Enabled
}

func (e *Engine) SkillNames() []string {
	e.mu.RLock()
	defer e.mu.RUnlock()
	names := make([]string, 0, len(e.skills))
	for name := range e.skills {
		names = append(names, name)
	}
	return names
}
