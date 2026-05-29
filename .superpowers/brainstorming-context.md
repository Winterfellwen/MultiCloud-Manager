# Brainstorming Context

## User Request (As-Is)
"参考 opencode agent 功能设计并整合 agent vault。https://github.com/anomalyco/opencode"

## Core Need
Rewrite MultiCloud Manager's chat system to achieve full OpenCode feature parity in Go, with two custom features: Confirm Mode (AI-driven batch checkbox approval) and a right sidebar for file/operation management. Agent Vault is embedded for credential brokering.

## Key Decisions

### 1. Go Complete Rewrite (方案 A)
**Decision:** Rewrite OpenCode TypeScript core in Go from scratch
**Rationale:** OpenCode is 100% TypeScript, no Go SDK. Complete rewrite gives full control and native Go performance.
**Alternatives rejected:**
- 方案 B (子进程): Poor performance, process management overhead
- 方案 C (HTTP 代理): Latency overhead, dependency on TypeScript process

### 2. AI-Driven Confirm Mode
**Decision:** AI autonomously decides when to show batch approval lists, not backend auto-interception
**Rationale:** Matches OpenCode UX pattern; AI understands context better than backend rules
**Alternatives rejected:**
- 后端自动拦截: Too rigid, can't handle context-dependent decisions

### 3. Checkbox Batch Approval
**Decision:** Checkbox-style batch approval, not one-by-one
**Rationale:** Multiple operations shown together for efficiency
**Alternatives rejected:**
- 逐个确认: Too slow for batch operations

### 4. Agent Vault Embedded
**Decision:** Infisical Go module embedded as internal component, not separate service
**Rationale:** Simpler deployment, lower latency, sufficient for single-tenant use
**Alternatives rejected:**
- 独立服务: Deployment complexity not justified for single-tenant

### 5. Context Sharing
**Decision:** Plan/Build/Confirm modes share session history
**Rationale:** Seamless workflow, no context loss when switching modes

### 6. Multi-Provider Support
**Decision:** Support OpenAI, Anthropic, Google, DeepSeek
**Rationale:** Flexibility, cost optimization, vendor lock-in avoidance

## Scope Boundaries

### IN
- Complete Go rewrite of OpenCode core (agent, session, tools, providers)
- Confirm Mode (AI-driven batch approval)
- Right sidebar (Files tab + Operations tab)
- Agent Vault embedded (credential brokering)
- Frontend UI matching OpenCode dark theme
- SQLite storage
- Render deployment

### OUT
- OpenCode CLI mode (we're building web only)
- Multi-user collaboration (single tenant for now)
- Custom tool development API (use built-in tools only)

## Open Questions
- Frontend framework: HTML/JS (current) vs Go templates vs lightweight framework
- Virtual scrolling implementation for chat history
- File diff rendering for the right sidebar

## Research Findings
- OpenCode is 100% TypeScript monorepo (packages/core, packages/app)
- No Go SDK or API available
- HTTP API spec available in packages/sdk/src/openapi.json
- CSS tokens available for theme matching
- Current backend uses Gin framework with SSE streaming
- Current frontend is ~2000 line single HTML file
