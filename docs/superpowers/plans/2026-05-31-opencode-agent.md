# opencode Agent Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hand-rolled Go AI agent (chat.go, agent/) with opencode binary, preserving cloud management APIs.

**Architecture:** opencode runs as a subprocess (`opencode serve --port 4096`), Go API proxies `/chat/*` to it, and `web/index.html` uses an iframe. Cloud tools are called via opencode's built-in bash tool curling our existing API.

**Tech Stack:** opencode CLI (Bun/TypeScript), Go (Gin router), existing PostgreSQL

---

### Task 1: Verify opencode install and serve mode

**Files:** None (verification only)

- [ ] **Step 1: Check opencode version**
```bash
opencode --version
```
Expected: Shows version >= 1.0.0

- [ ] **Step 2: Start opencode headless server locally**
```bash
opencode serve --port 4096 --hostname 127.0.0.1
```
Expected: Server starts without errors. Keep running in background for next step.

- [ ] **Step 3: Verify opencode API is reachable**
```bash
curl -s http://localhost:4096/health 2>&1 || curl -s http://localhost:4096/ 2>&1 | head -5
```
Expected: Returns JSON or HTML (not connection refused)

- [ ] **Step 4: Stop the server** (Ctrl+C or kill the process)

---

### Task 2: Add /chat/* reverse proxy to Go router

**Files:**
- Modify: `backend/internal/api/router.go`

- [ ] **Step 1: Add `net/http/httputil` and `net/url` to imports**
```go
import (
    "context"
    "database/sql"
    "io/ioutil"
    "net/http"
    "net/http/httputil"
    "net/url"
    "os"
    "path/filepath"
    "time"

    "multicloud/internal/cloud"
    "multicloud/internal/vault"

    "github.com/gin-gonic/gin"
)
```

- [ ] **Step 2: Remove agent import and all agent-related initialization**
Remove these lines:
```go
"multicloud/internal/agent"  // from imports
```

Remove these lines from `SetupRouter`:
```go
executor := agent.NewExecutor(syncer, db)

runtime := agent.NewRuntime(agent.RuntimeConfig{
    DB:     db,
    Syncer: syncer,
    Vault:  vaultClient,
})

chatHandler := NewChatStreamHandler(db, executor, runtime)
```

- [ ] **Step 3: Remove chat/agent routes, keep session routes**
Remove:
```go
auth.POST("/agent/chat/stream", chatHandler.Stream)
auth.POST("/agent/chat", chatHandler.Chat)
auth.POST("/agent/execute", chatHandler.Execute)
auth.GET("/agent/config", GetAIConfig)
auth.PUT("/agent/config", UpdateAIConfig)
auth.POST("/agent/config/test", TestAIConfig)
auth.GET("/agent/config/:type", agentConfigHandler.GetConfig)
auth.PUT("/agent/config/:type", agentConfigHandler.UpdateConfig)
```

Keep session routes:
```go
auth.GET("/agent/sessions", sessionsHandler.List)
auth.POST("/agent/sessions", sessionsHandler.Create)
auth.GET("/agent/sessions/:sid", sessionsHandler.Get)
auth.DELETE("/agent/sessions/:sid", sessionsHandler.Delete)
auth.PUT("/agent/sessions/:sid", sessionsHandler.Update)
```

Also remove the `agentConfigHandler` variable:
```go
agentConfigHandler := NewAgentConfigHandler(db)  // REMOVE
```

- [ ] **Step 4: Add /chat/* reverse proxy** — insert before the `webDir := getWebDir()` line:
```go
// Proxy /chat/* to opencode server
opencodeURL, _ := url.Parse("http://localhost:4096")
proxy := httputil.NewSingleHostReverseProxy(opencodeURL)
r.Any("/chat/*proxyPath", func(c *gin.Context) {
    c.Request.URL.Path = "/" + c.Param("proxyPath")
    proxy.ServeHTTP(c.Writer, c.Request)
})
r.Any("/chat", func(c *gin.Context) {
    proxy.ServeHTTP(c.Writer, c.Request)
})
```

- [ ] **Step 5: Verify build**
```bash
cd backend && go build ./...
```
Expected: No errors

- [ ] **Step 6: Commit**
```bash
git add backend/internal/api/router.go
git commit -m "feat: replace chat handlers with opencode reverse proxy"
```

---

### Task 3: Replace chat UI with iframe

**Files:**
- Modify: `web/index.html`

- [ ] **Step 1: Replace #page-chat content** (lines 466-511: from `<div class="chat-layout">` through `</div><!-- end chat-layout -->`)
```html
  <!-- Chat - powered by opencode -->
  <div id="page-chat" class="page">
    <iframe id="opencodeFrame" src="/chat" style="width:100%;height:calc(100vh - 88px);border:0;display:block"
      allow="clipboard-read; clipboard-write"></iframe>
  </div>
```

- [ ] **Step 2: Remove all chat JavaScript**
Find and delete the following functions and variables from the `<script>` block:
- `var CURRENT_MODE`, `CURRENT_SESSION`, `STREAMING_MSG`, `CONFIRM_PENDING`, `ABORT_CONTROLLER`, `sessionPollTimer`, `lastSyncedMsgCount`
- `function setChatMode()`
- `function sendChat()`
- `function confirmChat()`
- `function stopChat()`
- `function stopActiveSession()`
- `async function startStream()`
- `function handleSSEEvent()`
- `function doConfirm()`
- `function doReject()`
- `function toggleChatSessions()`
- `function closeChatSessions()`
- `async function loadSessions()`
- `async function switchSession()`
- `async function newSession()`
- `async function deleteSession()`
- `function appendMessage()`
- `function renderMarkdown()`
- `function downloadCode()`
- `function escHtml()`
- `function startSessionPoll()`
- `function stopSessionPoll()`

- [ ] **Step 3: Remove chat-related CSS**
Delete CSS rules for: `.chat-layout`, `.chat-sidebar`, `.chat-sidebar-header`, `.chat-sidebar-header h3`, `.chat-new-btn`, `.chat-session-list`, `.chat-session-item`, `.chat-main`, `.chat-header`, `.mode-toggle`, `.mode-btn`, `.chat-messages`, `.msg`, `.msg-role`, `.msg-content`, `.msg.system`, `.tool-block`, `.msg.user`, `.chat-input-area`, `.chat-input-bar`, `#chatInput`, `#chatSendBtn`, `#chatStopBtn`, `.chat-hint`, `.typing-indicator`, `.typing-dot`, `.streaming-cursor`, `.confirm-bar`, `.confirm-btn`, `.reject-btn`, `.confirm-status`, `.dl-btn`

- [ ] **Step 4: Remove chat-related HTML modals**
Delete: `#aiConfigModal` (lines 513+) and all AI config JavaScript functions (`openAIConfig`, `closeAIConfig`, `saveAIConfig`, `testAIConfig`)

- [ ] **Step 5: Update showPage for chat**
Change:
```javascript
if (page === 'chat') { loadSessions(); startSessionPoll(); }
```
To just:
```javascript
if (page === 'chat') { /* opencode handles chat */ }
```

- [ ] **Step 6: Commit**
```bash
git add web/index.html
git commit -m "feat: replace chat UI with opencode iframe"
```

---

### Task 4: Delete agent Go code

**Files:**
- Delete: `backend/internal/api/chat.go`
- Delete: `backend/internal/agent/` (entire directory including shell/, mcp/, skill/)

- [ ] **Step 1: Delete chat.go**
```bash
rm backend/internal/api/chat.go
```
(Also remove `backend/internal/api/chat_test.go` if it exists)

- [ ] **Step 2: Delete agent/ directory**
```bash
rm -r backend/internal/agent/
```

- [ ] **Step 3: Remove unused imports from go.mod**
```bash
cd backend && go mod tidy
```
Expected: Removed packages like `mvdan.cc/sh/v3`, `modelcontextprotocol/go-sdk`, etc.

- [ ] **Step 4: Verify build**
```bash
cd backend && go build ./...
```
Expected: No errors

- [ ] **Step 5: Commit**
```bash
git add -A backend/
git commit -m "feat: remove old Go agent code, replaced by opencode"
```

---

### Task 5: Update render.yaml

**Files:**
- Modify: `render.yaml`

- [ ] **Step 1: Update startCommand**
```yaml
    buildCommand: go build -o app .
    startCommand: |
      # Cache: only install opencode if not present
      if ! which opencode >/dev/null 2>&1; then
        curl -fsSL https://opencode.ai/install | bash
      fi
      # Start opencode in background
      export PATH=$PATH:$HOME/.bun/bin:$HOME/.local/bin
      opencode serve --port 4096 --hostname 0.0.0.0 &
      # Start Go API
      ./app
```

- [ ] **Step 2: Remove azure-cli from startCommand**
Remove the old `which az` / `pip3 install` logic — opencode's bash can install what it needs.

- [ ] **Step 3: Commit**
```bash
git add render.yaml
git commit -m "feat: add opencode to Render startCommand"
```

---

### Task 6: Verify local integration

- [ ] **Step 1: Start Go API locally**
```bash
cd backend && go run . &
```

- [ ] **Step 2: Start opencode locally**
```bash
opencode serve --port 4096 --hostname 127.0.0.1 &
```

- [ ] **Step 3: Access the app**
Open `http://localhost:8099` in browser. Click Chat nav. Verify the iframe loads opencode UI.

- [ ] **Step 4: Test a chat message**
In the opencode iframe, type: "列出所有云资源" and verify opencode responds.

- [ ] **Step 5: Verify cloud tool access**
In the opencode iframe, type: "use curl to call localhost:8099/api/stats with Authorization header" and verify it returns data.

- [ ] **Step 6: Commit any fixes**
```bash
git add -A && git commit -m "fix: local integration tweaks"
```

---

### Task 7: Deploy and test on Render

- [ ] **Step 1: Push all changes**
```bash
git push
```

- [ ] **Step 2: Wait for deployment**
Monitor Render dashboard for successful build

- [ ] **Step 3: Smoke test**
- Navigate to all pages (dashboard, accounts, resources, vault, terraform, profile) — all should work
- Click Chat — opencode iframe should load
- Send a message in chat — AI should respond
- Test mode switching in opencode (Plan/Build)

- [ ] **Step 4: Verify cloud tools work through opencode**
Send: "列出所有云资源" — opencode should curl the API and show results

- [ ] **Step 5: Commit test results**
```bash
git add -A && git commit -m "test: Render deployment verified"
git push
```
