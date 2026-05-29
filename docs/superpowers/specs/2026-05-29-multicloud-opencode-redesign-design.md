# MultiCloud Manager - OpenCode Feature Parity Design

**Date:** 2026-05-29
**Status:** Approved
**Author:** MultiCloud Team

## Overview

Rewrite MultiCloud Manager's chat system to achieve full OpenCode feature parity in Go, with two custom features: Confirm Mode and a right sidebar for file/operation management. Agent Vault is embedded as a module for credential brokering.

## Requirements

| Requirement | Detail |
|-------------|--------|
| Core Features | Full OpenCode parity: message rendering, input system, tool calls, file review, session management, terminal panel |
| Backend Language | Go complete rewrite of OpenCode TypeScript core |
| LLM Providers | Multi-provider: OpenAI, Anthropic, Google, DeepSeek |
| Confirm Mode | AI-driven, checkbox batch approval, read-only ops auto-execute |
| Right Sidebar | Auto-expand + manual collapse, dual tab (Files + Operations) |
| Context Inheritance | Plan/Build/Confirm share session history |
| Deployment | Local first, then Render |

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (HTML/JS)                │
│  ┌──────────┐ ┌──────────────┐ ┌─────────────────┐  │
│  │  Chat UI │ │ Session Mgmt │ │  Right Sidebar  │  │
│  └──────────┘ └──────────────┘ └─────────────────┘  │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP/SSE
┌──────────────────────▼──────────────────────────────┐
│                   Go Backend                         │
│  ┌────────────────────────────────────────────────┐  │
│  │              HTTP API Layer                    │  │
│  └────────────────────┬───────────────────────────┘  │
│  ┌────────────────────▼───────────────────────────┐  │
│  │              Core Engine                        │  │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────────────┐  │  │
│  │  │ Agent   │ │ Session │ │ Tool Registry    │  │  │
│  │  └─────────┘ └─────────┘ └──────────────────┘  │  │
│  │  ┌─────────┐ ┌─────────┐ ┌──────────────────┐  │  │
│  │  │Provider │ │Permission│ │ Agent Vault      │  │  │
│  │  └─────────┘ └─────────┘ └──────────────────┘  │  │
│  │  ┌──────────────────────────────────────────┐  │  │
│  │  │ Filesystem & Git                         │  │  │
│  │  └──────────────────────────────────────────┘  │  │
│  └────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────┐  │
│  │              Storage Layer (SQLite)            │  │
│  └────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────┘
```

## Backend Module Structure

```
backend/
├── cmd/server/main.go
├── internal/
│   ├── api/                    # HTTP API layer
│   │   ├── router.go
│   │   ├── sessions.go
│   │   ├── messages.go
│   │   ├── stream.go
│   │   ├── files.go
│   │   ├── confirm.go
│   │   └── auth.go
│   ├── agent/                  # Agent core
│   │   ├── agent.go
│   │   ├── prompt.go
│   │   └── context.go
│   ├── session/                # Session management
│   │   ├── session.go
│   │   ├── store.go
│   │   ├── history.go
│   │   └── events.go
│   ├── tools/                  # Tool registry
│   │   ├── registry.go
│   │   ├── shell.go
│   │   ├── file_read.go
│   │   ├── file_edit.go
│   │   ├── file_write.go
│   │   ├── glob.go
│   │   └── grep.go
│   ├── provider/               # LLM provider abstraction
│   │   ├── provider.go
│   │   ├── openai.go
│   │   ├── anthropic.go
│   │   └── google.go
│   ├── permission/             # Permission system
│   │   ├── permission.go
│   │   ├── auto_accept.go
│   │   └── confirm.go
│   ├── vault/                  # Agent Vault module
│   │   ├── vault.go
│   │   ├── broker.go
│   │   └── audit.go
│   ├── filesystem/             # Filesystem operations
│   │   ├── fs.go
│   │   └── git.go
│   └── config/                 # Configuration
│       └── config.go
├── migrations/
├── go.mod
└── go.sum
```

## Key Interfaces

```go
type Agent interface {
    Run(ctx context.Context, session *Session, message string) (<-chan Event, error)
    Stop(sessionID string) error
}

type Provider interface {
    ChatCompletion(ctx context.Context, req ChatRequest) (<-chan ChatResponse, error)
    Name() string
}

type Tool interface {
    Name() string
    Description() string
    Execute(ctx context.Context, params map[string]interface{}) (ToolResult, error)
    RequiresConfirm() bool
}

type Event struct {
    Type string      // token, tool_call, tool_result, confirm_required, file_created, done, error
    Data interface{}
}
```

## Confirm Mode

### Flow

1. User sends message
2. Agent calls LLM
3. LLM returns tool_calls (possibly multiple)
4. Read-only operations (file_read, glob, grep) execute automatically
5. Write/dangerous operations (shell, file_edit, file_write):
   - Single operation: return `confirm_required` event → frontend shows confirm card
   - Multiple operations: return batch `confirm_required` → frontend shows checkbox list
6. User approves/rejects → backend executes/skips

### Confirm Event Format

```json
{
  "type": "confirm_required",
  "operations": [
    {
      "id": "op_1",
      "tool": "shell",
      "description": "Create directory /tmp/test",
      "command": "mkdir -p /tmp/test",
      "requires_confirm": true
    }
  ],
  "batch_id": "batch_123"
}
```

### System Prompt Guidance

AI is instructed via system prompt to:
- Explain actions before executing write/dangerous operations
- Read-only operations don't need confirmation
- Multiple operations can be returned together for batch confirmation

### Context Sharing

Plan/Build/Confirm modes share the same session history. Switching modes doesn't lose context.

## Right Sidebar

### Layout

- Two tabs: Files (AI-generated files) and Operations (Confirm mode details)
- Auto-expands when new content arrives
- Manual collapse via button
- Files tab: list with download/preview
- Operations tab: checkbox list with approve/reject

### Data Flow

```
AI creates file → SSE file_created → frontend adds to Files tab (auto-expand)
AI needs confirm → SSE confirm_required → frontend adds to Operations tab (auto-expand)
User approves → POST /api/confirm → backend executes → SSE tool_result
```

## Frontend Structure

```
frontend/
├── index.html
├── login.html
├── css/opencode.css
└── js/
    ├── app.js
    ├── chat.js
    ├── session.js
    ├── sidebar.js
    ├── confirm.js
    ├── markdown.js
    ├── sse.js
    └── i18n.js
```

## API Endpoints

```
Auth:     POST /api/auth/login, GET /api/auth/profile
Sessions: CRUD + /fork, /revert, /compact
Messages: GET /api/sessions/:id/messages (paginated), POST to send
Stream:   POST /api/sessions/:id/stream (SSE)
Confirm:  POST /api/confirm
Files:    GET /api/files/:path, GET /api/files/:path/download
Vault:    CRUD /api/vault/credentials
```

## Database Schema

Tables: `sessions`, `messages`, `parts`, `tool_calls`, `file_changes`, `credentials`, `audit_logs`

SQLite with WAL mode for concurrent access.

## Implementation Phases

| Phase | Content | Duration |
|-------|---------|----------|
| 1. Foundation | Go project, HTTP server, SQLite, auth | 1 week |
| 2. Agent Core | Provider abstraction, agent loop, tool registry, basic tools | 2 weeks |
| 3. Session Mgmt | Session CRUD, message storage, SSE streaming, history pagination | 1 week |
| 4. Frontend UI | OpenCode-style interface, message rendering, input, session list | 1 week |
| 5. Advanced Features | Confirm mode, right sidebar, file review, Agent Vault | 1 week |
| 6. Optimization | Virtualized scrolling, performance, Render deployment | 1 week |

**Total: ~7 weeks**

## Dependencies

```go
github.com/gin-gonic/gin v1.9.1
github.com/mattn/go-sqlite3 v1.14.22
github.com/golang-jwt/jwt/v5 v5.2.1
github.com/google/uuid v1.6.0
golang.org/x/crypto v0.23.0
github.com/sashabaranov/go-openai v1.24.0
github.com/anthropics/anthropic-sdk-go v0.2.0-beta.2
github.com/google/generative-ai-go v0.14.0
```

## Deployment

**Local:** `go run cmd/server/main.go` → http://localhost:8099
**Render:** Build with `go build`, start with `./server`
