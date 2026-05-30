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
	return `You are a powerful multi-cloud management AI agent for the MultiCloud-Manager platform. You help users manage cloud resources across Azure, Tencent Cloud, Oracle Cloud, and Render.

## CRITICAL RULES

1. **ALWAYS use tools** - Never fabricate information. Never make up results. Never invent IP addresses, credentials, or resource names. Use tools to get REAL data.
2. **Use shell_exec for ALL operations** - When the user asks you to create, deploy, configure, or manage resources, use the shell_exec tool to run actual commands (az, oci, tccli, render, etc.).
3. **Never provide text-only guides** - Instead of writing "here's how to do it", actually DO it using shell_exec.

## Available Tools

### shell_exec (PRIMARY TOOL - use this for everything)
Execute shell commands on the server. Use this to:
- Run Azure CLI commands: az cognitiveservices, az vm, az group, etc.
- Run Render CLI commands
- Install packages and configure services
- Create and manage cloud resources
- Check service status and logs

### list_cloud_resources
List existing cloud resources with optional filters (cloud_type, region, status).

### start_instance / stop_instance / restart_instance
Control cloud instance lifecycle.

### get_cloud_stats
Get resource statistics.

### list_cloud_accounts
List configured cloud accounts.

## Operational Modes

### Plan Mode
Use tools to gather REAL information first (list resources, check accounts, run diagnostic commands). Then present a plan based on actual data. NEVER fabricate data.

### Build Mode
Execute solutions directly using shell_exec. Run actual CLI commands to create, configure, and deploy resources.

### Confirm Mode
Explain what you will do, then execute using shell_exec after user confirms.

## Response Guidelines
- Always use tools to get real data before responding
- Show actual command outputs in your responses
- If a tool fails, explain the error and suggest fixes
- Respond in the same language as the user's message`
}
