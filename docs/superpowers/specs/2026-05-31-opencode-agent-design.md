# Replace AI Agent with opencode

**Date:** 2026-05-31
**Status:** Design approved, pending implementation plan

## Goal

Replace the hand-rolled AI chat agent (Go SSE streaming, tool-calling loop, session management) with opencode's mature Agent system, while preserving all existing cloud management functionality (dashboard, accounts, resources, Vault, Terraform).

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌──────────┐
│  opencode UI │────▶│  opencode Agent  │────▶│   LLM    │
│  (iframe)    │     │  (serve --port   │     │  (API)   │
└─────────────┘     │   4096)           │     └──────────┘
                    └────────┬─────────┘
                             │  bash: curl
                    ┌────────▼─────────┐
                    │  我们的 Go API    │
                    │  :8099           │
                    │  • cloud.Syncer  │
                    │  • Vault client  │
                    │  • Terraform     │
                    │  • 账户/资源 CRUD │
                    └──────────────────┘
```

Two processes on one Render service:
- **opencode** (`serve --port 4096`) — handles AI chat, message persistence, streaming
- **Go API** (`:8099`) — handles cloud management, serves web pages, proxies /chat/* to opencode

## Cloud Tool Integration

No custom code needed. opencode's built-in bash tool calls our existing REST API via curl:

```
curl -s "$MCLOUD_API/accounts" -H "Authorization: Bearer $MCLOUD_TOKEN"
curl -s "$MCLOUD_API/resources" -H "Authorization: Bearer $MCLOUD_TOKEN"
curl -s -X POST "$MCLOUD_API/resources/sync" -H "..."
curl -s "$MCLOUD_API/stats" -H "..."
```

Endpoints exposed to opencode: GET/POST accounts, GET resources, POST sync, GET stats, POST start/stop.

## Deployment

**render.yaml changes:**
```yaml
startCommand: |
  # Install opencode if not already present
  if ! which opencode >/dev/null 2>&1; then
    curl -fsSL https://opencode.ai/install | bash
  fi
  # Generate service token for cloud API access
  export MCLOUD_TOKEN=$(curl -s -X POST http://localhost:8099/api/auth/service-token)
  # Start opencode headless server
  opencode serve --port 4096 --hostname 0.0.0.0 &
  # Start our Go API
  ./app
```

NOTE: `/api/auth/service-token` may need to be added (a JWT endpoint that accepts internal-only calls) or MCLOUD_TOKEN can be pre-set as an env var with a long-lived JWT.

**Go API routing:**
- `/api/*` → Go API (unchanged)
- `/chat/*` → reverse proxy to `localhost:4096`
- `/` and all other paths → Go static files (unchanged)

**Frontend integration:**
- `web/index.html` #page-chat: replace chat UI with `<iframe src="/chat">`
- Remove all chat JavaScript (SSE handling, tool blocks, stream management)

## What Gets Removed

| File(s) | Reason |
|---------|--------|
| `api/chat.go` | opencode handles chat streaming |
| `agent/` entire directory | opencode Agent replaces runtime, registry, router, prompt, tools, shell |
| `web/index.html` chat JS (~1000 lines) | Updated to iframe only |

## What Stays (unchanged)

- `api/router.go` (modified: remove chat routes, add /chat proxy)
- `api/sessions.go` (session CRUD kept for metadata)
- `api/accounts.go`, `api/resources.go`, `api/terraform.go` — all cloud APIs
- `api/auth.go` — authentication
- `cloud/` — Syncer, providers
- `vault/` — credentials
- `db/` — PostgreSQL schema (sessions, accounts, resources, users)
- `web/` — dashboard, resources, accounts, team, vault, terraform, profile pages
- `render.yaml` — modified startCommand

## opencode Configuration

**System prompt** (via opencode's agent config):
```
## Cloud Management Tools

MultiCloud API: http://localhost:8099/api
Auth: Authorization: Bearer $MCLOUD_TOKEN

Use bash + curl to manage cloud resources via these endpoints:
  GET  /accounts        — List cloud accounts
  POST /accounts        — Create cloud account
  GET  /resources       — List resources (filter: ?cloud_type=azure)
  POST /resources/sync  — Sync resources from all providers
  GET  /stats           — Resource statistics
  POST /resources/:id/start|stop|restart — Instance lifecycle
```

**Agent mode mapping:**
- Plan mode → opencode plan agent (read-only)
- Build mode → opencode build agent (full access)
- Confirm mode → opencode build agent + permission mode

## Migration Steps

1. Install opencode binary on local dev machine for testing
2. Create opencode agent config with cloud tool prompt
3. Add `/chat/*` reverse proxy to Go router
4. Replace chat UI in index.html with iframe
5. Remove chat/agent Go code
6. Update render.yaml with opencode installation
7. Test: Plan mode, Build mode (create + delete Azure TTS), Confirm mode
8. Deploy to Render

## Success Criteria

- All three modes (Plan/Build/Confirm) work through opencode UI in iframe
- opencode's bash tool successfully calls cloud API endpoints
- Dashboard, accounts, resources, Terraform, Vault pages all function normally
- Session switching preserves chat history
- Stop/interrupt works in opencode UI
- Deployment works on Render free tier (single service)
