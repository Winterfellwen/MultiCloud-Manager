# Agent Runtime Architecture Design

> Date: 2026-05-30
> Status: Approved
> Author: opencode

## Overview

Redesign the AI agent architecture from a rigid Provider interface to a flexible Agent Runtime that supports shell execution, MCP protocol, configurable skills, and Vault-based credential management.

## Motivation

Current limitations:
- Hardcoded Provider interface (only list/start/stop/restart) — no deployment capability
- Credentials stored in database as JSON — no centralized secret management
- No extensibility for custom tools or third-party integrations
- AI cannot execute arbitrary commands to fulfill user requests

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Chat API (SSE)                        │
│                  chat.go / Stream()                      │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                   Agent Runtime                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐     │
│  │ Tool Router  │  │ Skill Engine│  │ Prompt Builder│    │
│  └──────┬──────┘  └──────┬──────┘  └─────────────┘     │
│         │                │                               │
│  ┌──────▼────────────────▼──────┐                       │
│  │      Tool Registry           │                       │
│  │  (内置 + MCP + Shell tools)  │                       │
│  └──────┬──────────┬────────┬───┘                       │
└─────────┼──────────┼────────┼───────────────────────────┘
          │          │        │
    ┌─────▼───┐ ┌───▼───┐ ┌──▼──────────┐
    │  Shell  │ │  MCP  │ │  Built-in   │
    │ Executor│ │ Client│ │  Tools      │
    └────┬────┘ └───┬───┘ └──────┬──────┘
         │          │            │
    ┌────▼──────────▼────────────▼──────┐
    │          Vault Client             │
    │    (凭证获取，所有云操作共用)       │
    └───────────────────────────────────┘
```

## Data Flow

1. User message enters `Agent Runtime`
2. `Prompt Builder` assembles system prompt (base + skill injection + mode instructions)
3. `Tool Registry` collects all available tool definitions (built-in + shell + MCP)
4. Tools sent to LLM, LLM returns tool_calls
5. `Tool Router` dispatches to the appropriate executor
6. Executor (Shell/MCP/Built-in) runs and returns result
7. Result returned to LLM for final response generation

## New Directory Structure

```
backend/internal/
├── agent/
│   ├── runtime.go          # Agent Runtime main loop
│   ├── router.go           # Tool Router - dispatches tool calls
│   ├── registry.go         # Tool Registry - registers/manages all tools
│   ├── prompt.go           # Prompt Builder - assembles system prompt
│   ├── shell/
│   │   ├── executor.go     # Shell command executor
│   │   └── sandbox.go      # Filesystem isolation (write scope restriction)
│   ├── mcp/
│   │   ├── client.go       # MCP client (stdio + SSE)
│   │   ├── manager.go      # MCP Server lifecycle management
│   │   └── types.go        # MCP protocol type definitions
│   ├── skill/
│   │   ├── engine.go       # Skill loading engine
│   │   └── loader.go       # Load skills from config file / UI
│   └── tools.go            # Built-in tool definitions (backward compatible)
├── vault/
│   ├── client.go           # Vault API client
│   ├── auth.go             # AppRole authentication
│   └── secrets.go          # Credential CRUD
└── config/
    └── agent_config.go     # Agent configuration (MCP servers, skills, shell permissions)
```

## Section 1: Agent Runtime Core

Agent Runtime replaces the existing tool calling loop in `chat.go`.

### Runtime Struct

```go
type Runtime struct {
    registry   *ToolRegistry
    skillEngine *SkillEngine
    vault      *VaultClient
    db         *sql.DB
    prompt     *PromptBuilder
}

func (r *Runtime) Execute(ctx context.Context, session *Session, userMsg string) (*StreamResult, error)
```

### Relationship with Existing Code

- `chat.go` `Stream()` and `Chat()` call `Runtime.Execute()` instead of maintaining their own tool calling loop
- `agent/tools.go` built-in tools migrate to `Tool Registry` as built-in tools
- `agent/executor.go` logic splits into `Shell Executor` and `Built-in Tools`

### Unified Tool Interface

```go
type Tool interface {
    Name() string
    Description() string
    Parameters() map[string]interface{}  // JSON Schema
    Execute(ctx context.Context, args map[string]interface{}) (string, error)
}

// Three implementations:
// - BuiltInTool:   existing list_resources, start_instance, etc.
// - ShellTool:     dynamically generated, executes shell commands
// - MCPTool:       proxies tools exposed by MCP servers
```

### Execution Flow

1. `PromptBuilder` assembles system prompt (base + skill injection + mode instructions)
2. `ToolRegistry.GetAll()` collects all tool definitions (built-in + shell + MCP)
3. Send to LLM, receive tool_calls
4. `Router.Route(toolCall)` finds the matching Tool implementation
5. `Tool.Execute()` runs, returns result
6. Loop until LLM stops requesting tools

## Section 2: Shell Executor

Shell Executor runs commands on the host machine with filesystem write scope restriction.

### Core Design

```go
type ShellExecutor struct {
    workspaceDir string   // project working directory (only writable area)
    allowedEnvs  []string // allowed environment variable whitelist
}

type ShellResult struct {
    Stdout   string `json:"stdout"`
    Stderr   string `json:"stderr"`
    ExitCode int    `json:"exit_code"`
    Duration int64  `json:"duration_ms"`
}
```

### Security Model

| Constraint | Implementation |
|------------|----------------|
| System files read-only | Filesystem outside workspace not exposed to AI; Shell tools only return stdout/stderr, no file read/write tools |
| Timeout control | Single command max 5 minutes, overall conversation max 30 minutes |
| Concurrency limit | Only 1 shell command per session at a time |
| Environment variables | Only pass PATH, HOME, VAULT_TOKEN and other necessary variables |

### Tool Registration

```go
registry.Register(&ShellTool{
    name: "shell_exec",
    description: "Execute shell commands on the server. Use for running cloud CLIs, deploy scripts, checking service status, etc.",
    executor: shellExecutor,
    parameters: map[string]interface{}{
        "command": map[string]interface{}{"type": "string", "description": "Command to execute"},
        "workdir": map[string]interface{}{"type": "string", "description": "Working directory (optional)"},
        "timeout": map[string]interface{}{"type": "integer", "description": "Timeout in seconds (optional, default 60)"},
    },
})
```

### Mode Integration

- **Plan mode**: AI generates commands but doesn't execute; displays for user review
- **Build mode**: AI executes commands directly without confirmation
- **Confirm mode**: Each command requires user confirmation dialog before execution

## Section 3: MCP Client

MCP Client manages connections to MCP servers, supporting stdio and SSE transports.

### Architecture

```go
type MCPClient struct {
    transport Transport
    server    MCPServer
    tools     []MCPTool
    session   interface{}
}

type Transport interface {
    SendRequest(ctx context.Context, method string, params interface{}) (interface{}, error)
    Close() error
}

type MCPManager struct {
    clients    map[string]*MCPClient
    config     []MCPServerConfig
    vault      *VaultClient
}
```

### Transport Methods

| Method | Implementation | Use Case |
|--------|----------------|----------|
| stdio | `os/exec.Command` spawns child process, stdin/stdout communication | Local MCP servers (filesystem, git) |
| SSE | HTTP long connection, Server-Sent Events | Remote MCP servers (GitHub API, databases) |

### MCP Server Configuration Format

```json
{
  "mcp_servers": {
    "filesystem": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/allowed/dir"],
      "env": {}
    },
    "github": {
      "transport": "sse",
      "url": "https://mcp.github.com/sse",
      "headers": {
        "Authorization": "Bearer ${VAULT:github/token}"
      }
    }
  }
}
```

### Vault Integration

- `${VAULT:path}` placeholders in config are automatically resolved from Vault
- Example: `"Authorization": "Bearer ${VAULT:cloud/data/github/personal_token}"`

### Lifecycle Management

- Connect to all configured MCP servers on startup
- Health check every 5 minutes (ping)
- Auto-reconnect on disconnect (exponential backoff, max 3 attempts)
- Graceful shutdown notifies all servers

## Section 4: Skill Engine

Skills are pre-defined AI capability packages, each containing: prompt snippet + required tool set + behavior rules.

### Skill Configuration Format

```json
{
  "skills": {
    "azure-deploy": {
      "description": "Capability to deploy Azure resources",
      "system_prompt": "You can use Azure CLI (az) to create and manage Azure resources. Always check budget and region availability before deploying.",
      "tools": ["shell_exec"],
      "enabled_tools": {
        "shell_exec": {
          "allowed_commands": ["az *"],
          "workdir": "/workspace"
        }
      },
      "trigger": "Activate when user requests creating, deploying, or provisioning Azure resources"
    },
    "render-deploy": {
      "description": "Capability to deploy Render services",
      "system_prompt": "You can use Render API and CLI to manage Render services.",
      "tools": ["shell_exec", "render_api"],
      "enabled_tools": {
        "shell_exec": {
          "allowed_commands": ["render *", "curl *api.render.com*"]
        }
      }
    },
    "terraform": {
      "description": "Manage infrastructure with Terraform",
      "system_prompt": "You can write and execute Terraform configurations to manage cloud infrastructure.",
      "tools": ["shell_exec"],
      "enabled_tools": {
        "shell_exec": {
          "allowed_commands": ["terraform *"]
        }
      }
    }
  }
}
```

### Loading Flow

1. Load all skill definitions from config file on startup
2. Web UI can dynamically enable/disable skills
3. `PromptBuilder` assembles system prompt based on currently active skills
4. `ToolRegistry` filters available tools based on skill `enabled_tools`

### Security Relationship

- Skill `allowed_commands` is a subset of shell executor's whitelist
- Even if a skill allows `az *`, shell executor still constrained by global security policy
- Two-layer filtering: skill whitelist ∩ global security policy = actually executable commands

## Section 5: Vault Integration

Vault serves as the unified credential management layer, replacing the `credentials` field in `cloud_accounts` table.

### Vault Path Design

```
cloud/
├── data/
│   ├── azure/
│   │   ├── production/        # path: cloud/data/azure/production
│   │   │   ├── subscription_id
│   │   │   ├── tenant_id
│   │   │   ├── client_id
│   │   │   └── client_secret
│   │   └── dev/
│   ├── tencent/
│   │   └── default/
│   ├── oracle/
│   │   └── default/
│   ├── render/
│   │   └── default/
│   └── github/
│       └── personal_token
├── metadata/
│   └── ...
```

### Go Vault Client

```go
type VaultClient struct {
    addr     string
    token    string
    httpClient *http.Client
}

// AppRole authentication
func (c *VaultClient) Authenticate(roleID, secretID string) (string, error)

// Credential CRUD
func (c *VaultClient) GetSecret(path string) (map[string]interface{}, error)
func (c *VaultClient) SetSecret(path string, data map[string]interface{}) error
func (c *VaultClient) DeleteSecret(path string) error
func (c *VaultClient) ListSecrets(path string) ([]string, error)
```

### cloud_accounts Table (After Transformation)

```
cloud_accounts:
┌────┬──────────┬─────────────┬──────────────┬─────────────┐
│ id │ name     │ cloud_type  │ vault_path   │ is_active   │
├────┼──────────┼─────────────┼─────────────┼─────────────┤
│ 1  │ Azure 生产│ azure       │ azure/prod  │ true        │
│ 2  │ Render   │ render      │ render/default│ true      │
└────┴──────────┴─────────────┴─────────────┴─────────────┘

credentials JSON no longer stored; vault_path reference only
```

### Credential Read Flow

```
Agent needs to operate Azure resource
  → Query cloud_accounts table for vault_path = "azure/prod"
  → VaultClient.GetSecret("cloud/data/azure/prod")
  → Returns {subscription_id, tenant_id, client_id, client_secret}
  → Pass to AzureProvider for execution
```

### Web UI Account Management

- Add account: User fills credentials → Backend writes to Vault → DB stores vault_path only
- View account: Backend reads from Vault (API returns masked values)
- Delete account: Delete both Vault secret and DB record

### Migration Strategy

- One-time migration script: read `cloud_accounts.credentials` JSON from DB → write to Vault → update `vault_path`
- Existing functionality continues working during migration

## Section 6: Configuration System

Web UI + config file dual entry with hot-reload support.

### Config File Structure (`config/agent.json`)

```json
{
  "shell": {
    "enabled": true,
    "workspace_dir": "/workspace",
    "timeout_seconds": 300,
    "max_concurrent": 1,
    "allowed_commands": []
  },
  "mcp_servers": {
    "filesystem": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
      "enabled": true
    }
  },
  "skills": {
    "azure-deploy": { "enabled": true },
    "render-deploy": { "enabled": true },
    "terraform": { "enabled": false }
  },
  "vault": {
    "addr": "http://localhost:8200",
    "role_id": "",
    "secret_id": ""
  }
}
```

### Database Config Table (`agent_config`)

```sql
CREATE TABLE agent_config (
    id SERIAL PRIMARY KEY,
    config_key VARCHAR(100) UNIQUE NOT NULL,
    config_value JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Dual Entry Sync

```
User modifies config via Web UI
  → API updates DB (agent_config table)
  → Triggers ConfigSync.Watch()
  → Syncs to config/agent.json
  → Notifies Agent Runtime for hot-reload

User edits config/agent.json directly
  → FileWatcher detects change
  → Reads file content
  → Updates DB (agent_config table)
  → Notifies Agent Runtime for hot-reload
```

### API Endpoints

| Method | Path | Function |
|--------|------|----------|
| GET | `/api/agent/config/shell` | Get shell config |
| PUT | `/api/agent/config/shell` | Update shell config |
| GET | `/api/agent/config/mcp` | Get MCP servers config |
| PUT | `/api/agent/config/mcp` | Update MCP servers config |
| GET | `/api/agent/config/skills` | Get skills config |
| PUT | `/api/agent/config/skills` | Update skills config |
| POST | `/api/agent/config/mcp/:id/test` | Test MCP server connection |

### Hot-reload

- `Agent Runtime` listens on config变更 channel at startup
- On config change: reload tool registry, rebuild system prompt, reconnect MCP servers
- Does not interrupt ongoing conversations

## Section 7: Error Handling

| Error Type | Handling | User Perception |
|------------|----------|-----------------|
| Shell command timeout | Auto-kill process, return timeout error | "Command timed out (300s)" |
| Shell non-zero exit | Return stderr + exit code | "Command failed (exit 1): ..." |
| MCP server disconnect | Auto-reconnect, retry once | "Reconnecting to MCP service..." |
| MCP server unavailable | Degrade: remove that server's tools, continue | "Some tools temporarily unavailable" |
| Vault auth failure | Attempt re-auth, fail with error | "Credential auth failed, check Vault config" |
| LLM API error | Return error event | "AI service temporarily unavailable" |
| Tool not found | Return error to LLM, let LLM try another tool | LLM handles internally |

### Conversation History Enhancement

```sql
-- messages table new fields:
ALTER TABLE messages ADD COLUMN tool_calls JSONB;
ALTER TABLE messages ADD COLUMN tool_results JSONB;

-- Enables full conversation replay when switching sessions
```

## Section 8: Testing Strategy

### Test Layers

| Layer | Content | Tools |
|-------|---------|-------|
| Unit | Tool Router routing, Vault Client, Config Sync | Go testing |
| Integration | Shell Executor execution, MCP Client connection | Go testing + testcontainers |
| E2E | Full conversation flow, tool call chain | Playwright |
| Security | Command injection, path traversal, privilege escalation | Manual + automated |

### Key Test Cases

1. Shell security: `rm -rf /` blocked, `az account list` allowed
2. Vault integration: credentials in Vault, DB stores vault_path only
3. MCP lifecycle: stdio/sse connection, auto-reconnect
4. Skill activation: prompt injection, tool filtering
5. Config hot-reload: file change → DB sync → runtime update

## Section 9: Deployment Changes

### render.yaml Additions

- `VAULT_ADDR` environment variable
- `VAULT_ROLE_ID` environment variable
- `VAULT_SECRET_ID` environment variable
- Mount `/workspace` directory (persistent disk)

### Dockerfile Changes

- Install cloud CLIs (az, oci, aws)
- Install npx (for MCP servers)
- Install vault CLI (for initialization)

## Implementation Phases

### Phase 1: Vault Integration (Foundation)

- `vault/client.go`, `vault/auth.go`, `vault/secrets.go`
- Migration script: existing credentials → Vault
- Transform `cloud_accounts` table

### Phase 2: Agent Runtime (Core)

- `runtime.go`, `router.go`, `registry.go`, `prompt.go`
- `shell/executor.go`, `shell/sandbox.go`
- Migrate existing tool calling logic

### Phase 3: MCP + Skill (Extension)

- `mcp/client.go`, `mcp/manager.go`
- `skill/engine.go`, `skill/loader.go`
- `config/agent.json` + hot-reload

### Phase 4: Web UI (Interaction)

- Config pages: Shell/MCP/Skill management
- Chat page: confirm mode dialog
- Accounts page: Vault integration
