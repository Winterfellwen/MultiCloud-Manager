package skill

import (
	"fmt"
	"sync"
)

type SkillConfig struct {
	Enabled bool `json:"enabled"`
}

type Engine struct {
	mu     sync.RWMutex
	skills map[string]*SkillState
}

type SkillState struct {
	Name    string
	Enabled bool
}

func NewEngine() *Engine {
	return &Engine{
		skills: make(map[string]*SkillState),
	}
}

func (e *Engine) LoadSkills(skills map[string]*SkillConfig) {
	e.mu.Lock()
	defer e.mu.Unlock()
	for name, cfg := range skills {
		e.skills[name] = &SkillState{
			Name:    name,
			Enabled: cfg.Enabled,
		}
	}
}

func (e *Engine) GetActiveSkills() []string {
	e.mu.RLock()
	defer e.mu.RUnlock()
	var active []string
	for _, s := range e.skills {
		if s.Enabled {
			active = append(active, s.Name)
		}
	}
	return active
}

func (e *Engine) EnableSkill(name string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	s, ok := e.skills[name]
	if !ok {
		return fmt.Errorf("skill not found: %s", name)
	}
	s.Enabled = true
	return nil
}

func (e *Engine) DisableSkill(name string) error {
	e.mu.Lock()
	defer e.mu.Unlock()
	s, ok := e.skills[name]
	if !ok {
		return fmt.Errorf("skill not found: %s", name)
	}
	s.Enabled = false
	return nil
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
