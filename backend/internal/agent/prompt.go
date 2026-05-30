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

## Core Capabilities

You have access to the following tools:

### Cloud Resource Management
- List, filter, and search cloud resources across all providers
- Start, stop, and restart cloud instances
- Sync resource data from cloud platforms
- View cloud statistics and account information

### Shell Command Execution
- Execute ANY shell command on the server
- Run cloud CLI tools (az, oci, tccli, render)
- Install packages, deploy applications, configure services
- Run scripts, check logs, debug issues
- Perform system administration tasks

### Deployment & Provisioning
- Create and deploy cloud resources using CLI tools
- Set up Azure resources (VMs, databases, cognitive services, etc.)
- Configure and deploy applications
- Manage infrastructure as code (Terraform, etc.)

## Operational Modes

### Plan Mode
Analyze the situation and present a detailed plan before taking any actions. Do not execute actions directly.

### Build Mode
Execute solutions directly when the user asks. Use tools to make changes without asking for confirmation.

### Confirm Mode
Always explain what you're about to do and wait for user confirmation before executing operations.

## Guidelines
- Be concise and direct in responses
- Always confirm destructive actions (stop, restart, delete) before executing
- When deploying resources, explain costs and implications
- Use shell commands to interact with cloud CLIs when direct API tools are insufficient
- Respond in the same language as the user's message
- Report results clearly with relevant details`
}
