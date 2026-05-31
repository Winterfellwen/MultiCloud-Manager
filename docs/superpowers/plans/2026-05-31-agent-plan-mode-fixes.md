# AI 云助手 Plan 模式修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three issues in the AI cloud assistant's plan mode: expand read-only command whitelist, restore context on mode switch, and move mode buttons to input area bottom.

**Architecture:** Modify `internal/api/chat.go` for backend logic (command filtering + history loading) and `web/index.html` for frontend layout (mode buttons relocation). No new files needed.

**Tech Stack:** Go (Gin), PostgreSQL, HTML/CSS/JS

---

## File Structure

| File | Responsibility |
|------|---------------|
| `internal/api/chat.go` | Command filtering (`isDestructiveCommand`), history loading (`loadSessionHistory`), stream message building (`Stream`) |
| `web/index.html` | Mode toggle UI position, CSS layout |

---

### Task 1: Expand read-only command whitelist in `isDestructiveCommand()`

**Files:**
- Modify: `internal/api/chat.go:742-770`

- [ ] **Step 1: Read current implementation**

Read `internal/api/chat.go` lines 742-770 to understand the current `isDestructiveCommand()` function.

- [ ] **Step 2: Expand the readOnly whitelist**

Replace the `readOnly` slice in `isDestructiveCommand()` with an expanded version:

```go
readOnly := []string{
    // 基础文件/系统
    "ls", "pwd", "echo", "cat", "head", "tail", "less", "more",
    "which", "whereis", "whoami", "id", "env", "printenv",
    "uname", "hostname", "date", "uptime", "df", "du", "free",
    "ps", "top", "who", "w", "last",
    // 文本处理
    "grep", "find", "wc", "sort", "uniq", "diff", "file", "stat",
    "awk", "sed", "cut", "tr",
    // Git 只读
    "git status", "git log", "git diff", "git show", "git branch",
    "git tag", "git remote", "git config",
    // 网络诊断
    "ping", "curl", "wget", "nslookup", "dig", "host", "ip",
    // 云 CLI 只读
    "az account", "az group list", "az vm list", "az network",
    "oci compute instance list", "oci network vcn list",
    "tccli cvm Describe",
    // 系统信息
    "lscpu", "lsblk", "lsusb", "lspci", "lsmod",
    "cat /proc",
}
```

- [ ] **Step 3: Change default behavior for unknown commands**

Change the last line of `isDestructiveCommand()` from `return true` to `return false`:

```go
return false // default: allow unknown commands in plan mode (whitelist approach)
```

- [ ] **Step 4: Verify existing tests still pass**

Run: `cd E:\AI\multicloud && go test ./internal/api/... -v -run TestIsDestructive`
Expected: All existing tests pass (if any). If no tests exist, run `go build ./...` to verify compilation.

- [ ] **Step 5: Commit**

```bash
git add internal/api/chat.go
git commit -m "fix: expand plan mode read-only command whitelist, default to allow"
```

---

### Task 2: Add `loadSessionHistory()` method

**Files:**
- Modify: `internal/api/chat.go` (add new method after `saveSessionMessages` around line 677)

- [ ] **Step 1: Add `loadSessionHistory` method**

Add the following method after `saveSessionMessages()` (around line 677):

```go
// loadSessionHistory loads all previous messages for a session from the database.
func (h *ChatStreamHandler) loadSessionHistory(sessionID string) []map[string]interface{} {
	if sessionID == "" || h.db == nil {
		return nil
	}
	var internalID string
	err := h.db.QueryRow(`SELECT id FROM sessions WHERE session_id = $1`, sessionID).Scan(&internalID)
	if err != nil {
		return nil
	}
	rows, err := h.db.Query(`SELECT role, content FROM messages WHERE session_id = $1 ORDER BY created_at`, internalID)
	if err != nil {
		return nil
	}
	defer rows.Close()
	var history []map[string]interface{}
	for rows.Next() {
		var role, content string
		if err := rows.Scan(&role, &content); err != nil {
			continue
		}
		history = append(history, map[string]interface{}{
			"role":    role,
			"content": content,
		})
	}
	return history
}
```

- [ ] **Step 2: Verify compilation**

Run: `cd E:\AI\multicloud && go build ./...`
Expected: Compilation succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add internal/api/chat.go
git commit -m "feat: add loadSessionHistory method for context restoration"
```

---

### Task 3: Modify `Stream()` to load history before sending to LLM

**Files:**
- Modify: `internal/api/chat.go:65-69` (message building in `Stream()`)

- [ ] **Step 1: Replace message building logic**

Replace lines 65-69 in `Stream()`:

**Old code:**
```go
systemPrompt := h.runtime.GetSystemPrompt(req.Mode)
messages := []map[string]interface{}{
    {"role": "system", "content": systemPrompt},
    {"role": "user", "content": req.Message},
}
```

**New code:**
```go
systemPrompt := h.runtime.GetSystemPrompt(req.Mode)
messages := []map[string]interface{}{
    {"role": "system", "content": systemPrompt},
}
// Load conversation history for context restoration
if history := h.loadSessionHistory(req.SessionID); len(history) > 0 {
    messages = append(messages, history...)
}
// Append current user message
messages = append(messages, map[string]interface{}{"role": "user", "content": req.Message})
```

- [ ] **Step 2: Verify compilation**

Run: `cd E:\AI\multicloud && go build ./...`
Expected: Compilation succeeds with no errors.

- [ ] **Step 3: Commit**

```bash
git add internal/api/chat.go
git commit -m "fix: load session history in Stream() for context restoration on mode switch"
```

---

### Task 4: Move mode toggle from header to input area

**Files:**
- Modify: `web/index.html` (HTML structure + CSS)

- [ ] **Step 1: Read current HTML structure**

Read `web/index.html` lines 480-510 to understand the current layout of `.chat-header` and `.chat-input-area`.

- [ ] **Step 2: Remove mode-toggle from chat-header**

In the HTML, remove the `.mode-toggle` div from `.chat-header` (lines 484-488):

**Old:**
```html
<div class="chat-header">
    <button class="chat-sessions-btn" onclick="toggleChatSessions()" title="Sessions" aria-label="Sessions">&#9776;</button>
    <div class="mode-toggle">
        <button class="mode-btn active" data-mode="plan" onclick="setChatMode('plan')">Plan</button>
        <button class="mode-btn" data-mode="build" onclick="setChatMode('build')">Build</button>
        <button class="mode-btn" data-mode="confirm" onclick="setChatMode('confirm')">Confirm</button>
    </div>
    <div class="chat-header-actions">
        <button class="chat-settings-btn" onclick="openAIConfig()" title="AI Config">&#9881;</button>
    </div>
</div>
```

**New:**
```html
<div class="chat-header">
    <button class="chat-sessions-btn" onclick="toggleChatSessions()" title="Sessions" aria-label="Sessions">&#9776;</button>
    <div class="chat-header-actions">
        <button class="chat-settings-btn" onclick="openAIConfig()" title="AI Config">&#9881;</button>
    </div>
</div>
```

- [ ] **Step 3: Add mode-toggle to chat-input-area**

In the HTML, add the `.mode-toggle` div inside `.chat-input-area`, between the `.chat-input-bar` and `.chat-hint`:

**Old:**
```html
<div class="chat-input-area">
    <div class="chat-input-bar">
        <textarea id="chatInput" rows="1" placeholder="Type a message..." onkeydown="handleChatKey(event)" oninput="autoResizeTextarea(this)"></textarea>
        <button onclick="sendChat()" id="chatSendBtn" disabled>&#62;</button>
        <button onclick="stopChat()" id="chatStopBtn" style="display:none;background:var(--danger);color:#fff;border:none;border-radius:2px;width:32px;height:32px;cursor:pointer;font-size:12px;flex-shrink:0" title="Stop">■</button>
    </div>
    <div class="chat-hint" id="chatHint">MultiCloud AI Agent &middot; Plan mode is read-only</div>
</div>
```

**New:**
```html
<div class="chat-input-area">
    <div class="chat-input-bar">
        <textarea id="chatInput" rows="1" placeholder="Type a message..." onkeydown="handleChatKey(event)" oninput="autoResizeTextarea(this)"></textarea>
        <button onclick="sendChat()" id="chatSendBtn" disabled>&#62;</button>
        <button onclick="stopChat()" id="chatStopBtn" style="display:none;background:var(--danger);color:#fff;border:none;border-radius:2px;width:32px;height:32px;cursor:pointer;font-size:12px;flex-shrink:0" title="Stop">■</button>
    </div>
    <div class="mode-toggle" style="display:flex;gap:4px;margin-top:6px;">
        <button class="mode-btn active" data-mode="plan" onclick="setChatMode('plan')">Plan</button>
        <button class="mode-btn" data-mode="build" onclick="setChatMode('build')">Build</button>
        <button class="mode-btn" data-mode="confirm" onclick="setChatMode('confirm')">Confirm</button>
    </div>
    <div class="chat-hint" id="chatHint">MultiCloud AI Agent &middot; Plan mode is read-only</div>
</div>
```

- [ ] **Step 4: Update CSS for mode-toggle positioning**

Find the `.mode-toggle` CSS rule and update it to work in the new location. The existing CSS should work, but verify the flex layout is correct. No CSS changes expected since `.mode-toggle { display: flex; gap: 0; }` already exists.

- [ ] **Step 5: Verify in browser**

Open `web/index.html` in a browser. Verify:
- Mode buttons appear below the input textarea
- Clicking Plan/Build/Confirm toggles the active state correctly
- Hint text updates correctly
- Chat header only shows hamburger menu and settings gear

- [ ] **Step 6: Commit**

```bash
git add web/index.html
git commit -m "ui: move plan/build/confirm mode toggle to input area bottom"
```

---

### Task 5: Final verification

- [ ] **Step 1: Run full build**

Run: `cd E:\AI\multicloud && go build ./...`
Expected: No errors.

- [ ] **Step 2: Run existing tests**

Run: `cd E:\AI\multicloud && go test ./... -v`
Expected: All tests pass.

- [ ] **Step 3: Manual smoke test**

Open `web/index.html`:
1. Switch between Plan/Build/Confirm modes - buttons should be at bottom
2. Send a message in Plan mode with `grep` or `git status` - should NOT be blocked
3. Send a message in Plan mode with `rm -rf /` - should be blocked
4. Switch from Plan to Build mode mid-conversation - AI should retain context

- [ ] **Step 4: Final commit (if any fixes needed)**

```bash
git add -A
git commit -m "fix: final adjustments for plan mode fixes"
```
