package agent

import (
	"fmt"
	"strings"
)

// PromptBuilder assembles the system prompt from base text, mode instructions, and skills.
type PromptBuilder struct {
	basePrompt string
	mode       string
	skills     []string
	extras     map[string]string
}

// NewPromptBuilder creates a PromptBuilder with the given base prompt.
func NewPromptBuilder(basePrompt string) *PromptBuilder {
	return &PromptBuilder{
		basePrompt: basePrompt,
		extras:     make(map[string]string),
	}
}

// SetMode sets the agent's operational mode (e.g., "plan", "execute", "review").
func (b *PromptBuilder) SetMode(mode string) *PromptBuilder {
	b.mode = mode
	return b
}

// AddSkill adds a skill description to the prompt.
func (b *PromptBuilder) AddSkill(skill string) *PromptBuilder {
	b.skills = append(b.skills, skill)
	return b
}

// AddExtra adds an extra named section to the prompt.
func (b *PromptBuilder) AddExtra(name, content string) *PromptBuilder {
	b.extras[name] = content
	return b
}

// Build assembles the final system prompt string.
func (b *PromptBuilder) Build() string {
	var sb strings.Builder

	if b.basePrompt != "" {
		sb.WriteString(b.basePrompt)
		sb.WriteString("\n\n")
	}

	if b.mode != "" {
		sb.WriteString(fmt.Sprintf("## Current Mode\n%s\n\n", b.mode))
	}

	if len(b.skills) > 0 {
		sb.WriteString("## Active Skills\n")
		for _, skill := range b.skills {
			sb.WriteString(fmt.Sprintf("- %s\n", skill))
		}
		sb.WriteString("\n")
	}

	for name, content := range b.extras {
		sb.WriteString(fmt.Sprintf("## %s\n%s\n\n", name, content))
	}

	return strings.TrimSpace(sb.String())
}

// Reset clears all fields except the base prompt.
func (b *PromptBuilder) Reset() *PromptBuilder {
	b.mode = ""
	b.skills = nil
	b.extras = make(map[string]string)
	return b
}

// DefaultSystemPrompt returns the base system prompt for the multi-cloud agent.
func DefaultSystemPrompt() string {
	return `You are a multi-cloud management agent. You help users manage cloud resources across Azure, Tencent Cloud, Oracle Cloud, and Render.

You have access to tools that can:
- List and filter cloud resources across all providers
- Start, stop, and restart cloud instances
- Sync resource data from cloud platforms
- Retrieve cloud statistics and account information

When responding to users:
- Be concise and direct
- Always confirm destructive actions (stop, restart) before executing
- Report results clearly with relevant details
- If a tool call fails, explain the error and suggest next steps

Always use the available tools when the user asks about cloud resources or requests actions on infrastructure.`
}
