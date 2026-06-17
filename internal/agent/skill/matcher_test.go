package skill

import (
	"testing"
)

func TestMatcher(t *testing.T) {
	skills := []*Skill{
		{
			Name:    "cost-optimize",
			Enabled: true,
			Triggers: []SkillTrigger{
				{Keywords: []string{"成本", "费用", "优化"}, Priority: 1},
			},
		},
		{
			Name:    "resource-query",
			Enabled: true,
			Triggers: []SkillTrigger{
				{Keywords: []string{"资源", "查询"}, Priority: 2},
			},
		},
		{
			Name:    "disabled-skill",
			Enabled: false,
			Triggers: []SkillTrigger{
				{Keywords: []string{"禁用"}, Priority: 1},
			},
		},
	}

	matcher := NewMatcher(skills)

	tests := []struct {
		input     string
		wantSkill string
	}{
		{"帮我优化一下成本", "cost-optimize"},
		{"查询资源列表", "resource-query"},
		{"成本费用分析", "cost-optimize"},
		{"随便说点什么", ""},
	}

	for _, tt := range tests {
		results := matcher.Match(tt.input)
		if tt.wantSkill == "" {
			if len(results) > 0 {
				t.Errorf("input %q: expected no match, got %s", tt.input, results[0].Skill.Name)
			}
			continue
		}

		if len(results) == 0 {
			t.Errorf("input %q: expected match %s, got none", tt.input, tt.wantSkill)
			continue
		}

		if results[0].Skill.Name != tt.wantSkill {
			t.Errorf("input %q: expected %s, got %s", tt.input, tt.wantSkill, results[0].Skill.Name)
		}
	}

	// Test BestMatch
	best := matcher.BestMatch("帮我优化成本", 0.1)
	if best == nil || best.Name != "cost-optimize" {
		t.Errorf("BestMatch failed")
	}

	// Test threshold filtering
	noMatch := matcher.BestMatch("帮我优化成本", 0.9)
	if noMatch != nil {
		t.Errorf("BestMatch should return nil for high threshold")
	}
}
