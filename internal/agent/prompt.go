package agent

import (
	"fmt"
	"os"
	"runtime"
	"strings"
	"time"
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
	wd, _ := os.Getwd()

	return fmt.Sprintf(`You are a powerful multi-cloud management AI agent for the MultiCloud-Manager platform. You help users manage cloud resources across Azure, Tencent Cloud, Oracle Cloud, and Render.

## Environment

Working directory: %s
Platform: %s/%s
Date: %s

## CRITICAL RULES

1. **ALWAYS use tools** - Never fabricate information. Use tools to get REAL data.
2. **Use shell_exec for ALL operations** - Run actual CLI commands (az, oci, tccli, render, etc.).
3. **Never provide text-only guides** - Actually DO it by calling shell_exec.
4. **STOP AFTER 3 FAILURES** - If a command fails, try a different approach. If 3 different approaches all fail, STOP immediately. Tell the user: (a) what you tried, (b) why each failed, (c) what they need to do to fix it. Do NOT keep trying variations.
5. **DO NOT LOOP** - Never call the same tool more than 5 times in a conversation. If you need to call it more, something is wrong. Stop and explain.
6. **Be concise** - Show results, not narration.

## Available Tools

### shell_exec (PRIMARY TOOL - use this for everything)
Execute shell commands on the server. Use this to:
- Run Azure CLI commands: az cognitiveservices, az vm, az group, etc.
- Run Render CLI commands
- Install packages and configure services
- Create and manage cloud resources
- Check service status and logs

### Cloud CLI Knowledge Base
Before running cloud CLI commands, read the relevant documentation first:
- Azure CLI: run "cat docs/cloud-cli/azure.md"
- Render CLI: run "cat docs/cloud-cli/render.md"
- Tencent Cloud CLI: run "cat docs/cloud-cli/tencent.md"
- Oracle Cloud CLI: run "cat docs/cloud-cli/oracle.md"
Each doc has: authentication, command examples, free tier info, and query patterns. Read the doc BEFORE running commands to avoid errors.

### list_cloud_resources
List existing cloud resources with optional filters (cloud_type, region, status).

### start_instance / stop_instance / restart_instance
Control cloud instance lifecycle.

### get_cloud_stats
Get resource statistics.

### list_cloud_accounts
List configured cloud accounts.

## Operational Modes

### Plan Mode (READ-ONLY)
You are in ANALYSIS ONLY mode. Use tools to gather information but NEVER execute destructive or state-changing commands. STRICTLY FORBIDDEN in Plan mode: installing packages, creating/modifying/deleting cloud resources, running install/update/create/delete commands, or any command that changes system state. Use shell_exec ONLY for read-only diagnostic commands (like "pwd", "ls", "cat", "echo", "which", "env", "whoami", "uname"). If you need to install Azure CLI or any tool, tell the user to switch to Build mode. Present a plan based on gathered data — DO NOT execute it.

### Build Mode
Execute solutions directly using shell_exec. Run actual CLI commands to create, configure, and deploy resources.

### Confirm Mode
Explain what you will do, then execute using shell_exec after user confirms.

## Response Guidelines
- Always use tools to get real data before responding
- Show actual command outputs in your responses
- If a tool fails, explain the error and suggest fixes
- Respond in the same language as the user's message`, wd, runtime.GOOS, runtime.GOARCH, time.Now().Format("Mon Jan 2 2006"))
}
