package skill

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestParseSKILLFile(t *testing.T) {
	// Create temporary test file
	tmpDir := t.TempDir()
	skillPath := filepath.Join(tmpDir, "SKILL.md")

	content := `---
name: test-skill
description: A test skill
triggers:
  - keywords: ["test", "demo"]
    priority: 1
tools:
  - listResources
  - getStats
config:
  - name: limit
    type: number
    default: 10
    description: Result limit
---

## Usage

This is a test skill.
`

	if err := os.WriteFile(skillPath, []byte(content), 0644); err != nil {
		t.Fatalf("write test file: %v", err)
	}

	skill, err := ParseSKILLFile(skillPath)
	if err != nil {
		t.Fatalf("parse skill file: %v", err)
	}

	if skill.Name != "test-skill" {
		t.Errorf("expected name 'test-skill', got %q", skill.Name)
	}

	if skill.Description != "A test skill" {
		t.Errorf("expected description 'A test skill', got %q", skill.Description)
	}

	if len(skill.Triggers) != 1 {
		t.Errorf("expected 1 trigger, got %d", len(skill.Triggers))
	}

	if len(skill.Tools) != 2 {
		t.Errorf("expected 2 tools, got %d", len(skill.Tools))
	}

	if skill.GetConfigValue("limit") != 10 {
		t.Errorf("expected config limit=10, got %v", skill.GetConfigValue("limit"))
	}

	if !strings.Contains(skill.Content, "This is a test skill") {
		t.Errorf("expected content to contain 'This is a test skill'")
	}
}

func TestParseSKILLFileMissingFrontMatter(t *testing.T) {
	tmpDir := t.TempDir()
	skillPath := filepath.Join(tmpDir, "SKILL.md")

	if err := os.WriteFile(skillPath, []byte("No front matter here"), 0644); err != nil {
		t.Fatalf("write test file: %v", err)
	}

	_, err := ParseSKILLFile(skillPath)
	if err == nil {
		t.Error("expected error for missing front matter, got nil")
	}
}
