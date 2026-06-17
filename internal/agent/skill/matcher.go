package skill

import (
	"sort"
	"strings"
)

// MatchResult represents a skill match result
type MatchResult struct {
	Skill    *Skill
	Score    float64 // Match score (0-1)
	Priority int     // Trigger priority
}

// Matcher skill matching engine
type Matcher struct {
	skills []*Skill
}

// NewMatcher creates a matching engine
func NewMatcher(skills []*Skill) *Matcher {
	return &Matcher{skills: skills}
}

// Match matches skills based on user input
// Returns results sorted by priority and score
func (m *Matcher) Match(input string) []MatchResult {
	input = strings.ToLower(input)
	var results []MatchResult

	for _, skill := range m.skills {
		if !skill.Enabled {
			continue
		}

		for _, trigger := range skill.Triggers {
			score := m.calculateScore(input, trigger.Keywords)
			if score > 0 {
				results = append(results, MatchResult{
					Skill:    skill,
					Score:    score,
					Priority: trigger.Priority,
				})
				break // One skill matches once, take the highest scoring trigger
			}
		}
	}

	// Sort: higher priority -> higher score
	sort.Slice(results, func(i, j int) bool {
		if results[i].Priority != results[j].Priority {
			return results[i].Priority < results[j].Priority // Lower number = higher priority
		}
		return results[i].Score > results[j].Score
	})

	return results
}

// BestMatch returns the best matching skill, or nil if no confident match
// threshold: minimum match score threshold
func (m *Matcher) BestMatch(input string, threshold float64) *Skill {
	results := m.Match(input)
	if len(results) == 0 || results[0].Score < threshold {
		return nil
	}
	return results[0].Skill
}

// calculateScore calculates the match score between input and keywords
// Full match = 1.0, partial match = proportional, no match = 0
func (m *Matcher) calculateScore(input string, keywords []string) float64 {
	if len(keywords) == 0 {
		return 0
	}

	matchCount := 0
	for _, kw := range keywords {
		kw = strings.ToLower(kw)
		if strings.Contains(input, kw) {
			matchCount++
		}
	}

	if matchCount == 0 {
		return 0
	}

	// All keywords match = 1.0, partial match proportional
	return float64(matchCount) / float64(len(keywords))
}
