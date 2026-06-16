# Tool Call Inline Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace card-based tool call UI with lightweight inline text lines embedded inside AI messages, matching opencode's compact/expandable pattern.

**Architecture:** All changes in `web/index.html`. Remove ~80 lines of card CSS + ~200 lines of card JS. Add ~50 lines of inline CSS + ~100 lines of inline JS. Tool calls become DOM elements inside `.msg.agent` rather than standalone `.tool-card` elements.

**Tech Stack:** Vanilla JS, no frameworks, no build step.

---

### Task 1: CSS — Replace card styles with inline tool line styles

**Files:**
- Modify: `web/index.html:444-519`

- [ ] **Step 1: Remove all card CSS**

Delete lines 444–519 (`.tool-card`, `.tool-card-header`, `.card-*`, `.tool-card-summary`, `.tool-card-progress`, `.card-timestamp`, `.timeline-tool-card`, `.tool-card-body`, `.field-*`, `.tool-output-stream`, `@keyframes progressSlide`, `@keyframes iconSpin`).

Remove `.tool-card:hover`, `.tool-card.running .tool-output-stream`, `.tool-card.running .tool-card-body`, and the `.msg.agent .tool-calls-inline` rule at line 442.

- [ ] **Step 2: Verify removal**

Run: `grep -n "tool-card\|\\.card-\|\\.field-\|tool-output-stream\|timeline-tool-card" web/index.html`
Expected: No matches for any card-specific class names.

- [ ] **Step 3: Add inline tool line CSS**

Insert after line 441 (after `.msg.agent .tool-calls-inline` or at the `.tool-block` area):

```css
/* Inline tool line — compact, embedded in AI message */
.tool-line { display: flex; align-items: center; gap: 6px; padding: 5px 0;
             margin: 4px 0 4px 20px; cursor: pointer; font-size: 12px;
             border-bottom: 1px solid transparent; transition: background .1s; }
.tool-line:hover { background: rgba(0,0,0,.02); border-radius: 4px; }
.tool-line .tl-icon { font-size: 12px; flex-shrink: 0; }
.tool-line .tl-icon.running { animation: tlPulse 1s ease-in-out infinite; }
.tool-line .tl-name { color: var(--primary); font-weight: 600; font-family: var(--font-mono); font-size: 11px; flex-shrink: 0; }
.tool-line .tl-summary { color: var(--text-secondary); font-size: 11px; flex: 1; overflow: hidden;
                         text-overflow: ellipsis; white-space: nowrap; min-width: 0; }
.tool-line .tl-status { font-size: 11px; flex-shrink: 0; }
.tool-line .tl-status.running { color: var(--warning); }
.tool-line .tl-status.done { color: var(--success); }
.tool-line .tl-status.error { color: var(--danger); }
.tool-line .tl-duration { font-size: 10px; color: var(--text-muted); font-family: var(--font-mono); flex-shrink: 0; }
.tool-line .tl-arrow { font-size: 10px; color: var(--text-muted); flex-shrink: 0; transition: transform .15s; }
.tool-line .tl-arrow.open { transform: rotate(90deg); }

/* Tool details — expanded below the line */
.tool-details { display: none; margin: 0 0 4px 20px; padding: 8px 10px;
                background: var(--bg); border-radius: 6px; font-size: 11px; }
.tool-details.open { display: block; }
.tool-details .td-label { font-size: 9px; font-weight: 700; color: var(--text-muted);
                          text-transform: uppercase; letter-spacing: .5px; margin-bottom: 3px; }
.tool-details .td-content { font-family: var(--font-mono); font-size: 10px; color: var(--text-secondary);
                            white-space: pre-wrap; word-break: break-all; line-height: 1.4;
                            margin-bottom: 6px; }
.tool-details .td-content:last-child { margin-bottom: 0; }

/* Live tool output — dark terminal block during running */
.tl-live { display: none; margin: 0 0 4px 20px; background: #1e1e1e; border-radius: 6px; overflow: hidden; }
.tl-live.open { display: block; }
.tl-live .tl-live-header { display: flex; align-items: center; padding: 5px 8px;
                           background: #2d2d2d; font-size: 10px; color: #999; }
.tl-live .tl-live-body { font-family: var(--font-mono); font-size: 11px; color: #d4d4d4;
                         padding: 8px 10px; white-space: pre-wrap; max-height: 150px;
                         overflow-y: auto; line-height: 1.5; }
.tl-live .tl-live-bar { height: 2px; background: #333; overflow: hidden; }
.tl-live .tl-live-bar-fill { height: 100%; width: 30%; background: var(--warning);
                             animation: tlSlide 1.2s ease-in-out infinite; }

/* Copy button in tool details */
.td-result-wrap { position: relative; }
.td-copy-btn { position: absolute; top: 2px; right: 2px; padding: 2px 6px; font-size: 9px;
               background: var(--surface); border: 1px solid var(--border); border-radius: 3px;
               color: var(--text-muted); cursor: pointer; display: none; }
.td-result-wrap:hover .td-copy-btn { display: block; }
.td-copy-btn:hover { border-color: var(--primary); color: var(--primary); }

@keyframes tlPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
@keyframes tlSlide { 0% { transform: translateX(-100%); } 100% { transform: translateX(400%); } }
```

- [ ] **Step 4: Commit**

```bash
git add web/index.html
git commit -m "style: replace card CSS with inline tool line CSS"
```

---

### Task 2: Core rendering — `renderToolLine` and `renderToolDetails`

**Files:**
- Modify: `web/index.html` — replace `buildToolCard` function (~line 3739) with new inline functions

- [ ] **Step 1: Write `renderToolLine`**

Replace the `buildToolCard` function (lines 3739–3814) with:

```javascript
function renderToolLine(tc) {
  var div = document.createElement('div');
  div.className = 'tool-line';
  div.dataset.toolName = tc.name;

  var icon = getToolIcon(tc.name);
  var summary = getToolSummary(tc.name, tc.params);
  var isRunning = tc.status === 'running';
  var hasError = tc.status === 'error';
  var loc = LOCALE === 'zh';
  var statusIcon = isRunning ? '◉' : (hasError ? '✗' : '✓');
  var statusClass = isRunning ? 'running' : (hasError ? 'error' : 'done');

  div.innerHTML =
    '<span class="tl-icon ' + (isRunning ? 'running' : '') + '">' + icon + '</span>' +
    '<span class="tl-name">' + escHtml(tc.name) + '</span>' +
    '<span class="tl-summary">' + escHtml(summary) + '</span>' +
    '<span class="tl-status ' + statusClass + '">' + statusIcon + '</span>' +
    '<span class="tl-duration"></span>' +
    '<span class="tl-arrow">' + (isRunning ? '▾' : '▸') + '</span>';

  // Expand/collapse on header click
  div.addEventListener('click', function() {
    var details = div.nextElementSibling;
    if (details && (details.classList.contains('tool-details') || details.classList.contains('tl-live'))) {
      var isOpen = details.classList.toggle('open');
      div.querySelector('.tl-arrow').textContent = isOpen ? '▾' : '▸';
    }
  });

  // Create details and live output containers
  var liveDiv = document.createElement('div');
  liveDiv.className = 'tl-live' + (isRunning ? ' open' : '');
  liveDiv.innerHTML =
    '<div class="tl-live-header"><span>' + icon + ' ' + escHtml(tc.name) + '</span><span style="margin-left:auto">live</span></div>' +
    '<div class="tl-live-body"></div>' +
    '<div class="tl-live-bar"><div class="tl-live-bar-fill"></div></div>';

  var detailDiv = document.createElement('div');
  detailDiv.className = 'tool-details' + (isRunning ? '' : '');

  // Start duration timer
  if (isRunning) {
    var durEl = div.querySelector('.tl-duration');
    var startTime = Date.now();
    div._timer = setInterval(function() {
      var elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      durEl.textContent = elapsed + 's';
    }, 100);
  }

  // Insert as siblings after .tool-line
  div._liveDiv = liveDiv;
  div._detailDiv = detailDiv;

  return div;
}
```

- [ ] **Step 2: Write helper to attach details after streaming**

```javascript
function attachToolDetails(toolLine, tc) {
  var detailDiv = toolLine._detailDiv;
  var paramsStr = '';
  try { paramsStr = JSON.stringify(JSON.parse(tc.params || '{}'), null, 2); } catch(e) { paramsStr = tc.params || ''; }
  var resultText = tc.result || '';
  try { resultText = JSON.stringify(JSON.parse(resultText), null, 2); } catch(e) { /* result is not JSON */ }

  var html = '';
  if (paramsStr) {
    html += '<div class="td-label">' + (LOCALE === 'zh' ? '参数' : 'PARAMS') + '</div>' +
            '<div class="td-content">' + escHtml(paramsStr) + '</div>';
  }
  if (resultText) {
    html += '<div class="td-label">' + (LOCALE === 'zh' ? '结果' : 'RESULT') + '</div>' +
            '<div class="td-content td-result-wrap" data-result="' + escHtml(resultText) + '">' +
              escHtml(resultText) +
              '<button class="td-copy-btn" onclick="event.stopPropagation();copyToolResult(this)">📋</button>' +
            '</div>';
  }
  detailDiv.innerHTML = html;
}
```

- [ ] **Step 3: Update `copyToolResult` for new structure**

Replace the existing `copyToolResult` function (~line 3860):

```javascript
function copyToolResult(btn) {
  var wrap = btn.closest('.td-result-wrap');
  if (!wrap) return;
  var text = wrap.getAttribute('data-result') || wrap.textContent.replace('📋', '').trim();
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(function() {
      btn.textContent = (LOCALE === 'zh' ? '✓' : '✓');
      setTimeout(function() { btn.textContent = '📋'; }, 1500);
    });
  }
}
```

- [ ] **Step 4: Commit**

```bash
git add web/index.html
git commit -m "feat: add renderToolLine and inline tool rendering functions"
```

---

### Task 3: Update streaming event handlers

**Files:**
- Modify: `web/index.html:2087-2255`

- [ ] **Step 1: Rewrite `handleToolStartEvent`**

Replace lines 2087–2134. Key change: use `renderToolLine(tc)` instead of `buildToolCard(tc)`; insert the tool line + live container into `STREAMING_DIV` before `.msg-time`:

```javascript
function handleToolStartEvent(ev) {
  if (ev.payload && ev.payload.tool_calls) {
    ev.payload.tool_calls.forEach(function(tc) {
      var fn = tc.function || tc;
      var name = fn.name || 'unknown';
      var args = fn.arguments || '';
      // Deduplicate
      if (PENDING_TOOL_CALLS.some(function(t) { return t.name === name; })) return;
      if (ev.session_id && ev.session_id !== CURRENT_SESSION) return;

      PENDING_TOOL_CALLS.push({name: name, params: args, result: ''});

      // Check if tool line already exists in DOM (from cache replay)
      if (STREAMING_DIV && STREAMING_DIV.isConnected &&
          STREAMING_DIV.querySelector('.tool-line[data-tool-name="' + name + '"]')) return;

      _ensureStreamingDiv();

      var toolLine = renderToolLine({name: name, params: fn.arguments || '', result: '', status: 'running', timestamp: new Date().toISOString()});
      var timeEl = STREAMING_DIV.querySelector('.msg-time');
      if (timeEl) {
        STREAMING_DIV.insertBefore(toolLine, timeEl);
        STREAMING_DIV.insertBefore(toolLine._liveDiv, timeEl);
        STREAMING_DIV.insertBefore(toolLine._detailDiv, timeEl);
      } else {
        STREAMING_DIV.appendChild(toolLine);
        STREAMING_DIV.appendChild(toolLine._liveDiv);
        STREAMING_DIV.appendChild(toolLine._detailDiv);
      }

      // Reset content block so next token creates a new block after this tool
      STREAMING_DIV._lastRenderedLen = 0;
      STREAMING_CONTENT = '';
      scrollToBottom();
    });
  }
}
```

- [ ] **Step 2: Rewrite `handleToolOutputEvent`**

Replace lines 2136–2172:

```javascript
function handleToolOutputEvent(ev) {
  if (!ev.payload || !ev.payload.output) return;
  if (ev.session_id && ev.session_id !== CURRENT_SESSION) return;
  if (ev.run_id && STOPPED_RUNS.has(ev.run_id)) return;

  var toolName = ev.payload.tool_name || '';
  var output = ev.payload.output;

  if (STREAMING_DIV && STREAMING_DIV.isConnected) {
    // Find the running tool line
    var lines = STREAMING_DIV.querySelectorAll('.tool-line');
    var targetLine = null;
    for (var i = lines.length - 1; i >= 0; i--) {
      if (lines[i].dataset.toolName === toolName) {
        targetLine = lines[i];
        break;
      }
    }
    if (!targetLine) {
      // Fallback to last tool line
      targetLine = lines[lines.length - 1];
    }
    if (targetLine) {
      var liveBody = targetLine._liveDiv ? targetLine._liveDiv.querySelector('.tl-live-body') : null;
      if (!liveBody) {
        // Find live div as next sibling
        var next = targetLine.nextElementSibling;
        if (next && next.classList.contains('tl-live')) {
          targetLine._liveDiv = next;
          liveBody = next.querySelector('.tl-live-body');
        }
      }
      if (liveBody) {
        liveBody.textContent += output;
        liveBody.scrollTop = liveBody.scrollHeight;
        scrollToBottom();
      }
    }
  }
}
```

- [ ] **Step 3: Rewrite `handleToolResultEvent`**

Replace lines 2174–2221:

```javascript
function handleToolResultEvent(ev) {
  if (!ev.payload) return;
  var name = ev.payload.tool_name || 'tool';
  var result = ev.payload.result || ev.payload.error || '';
  var hasError = !!(ev.payload.error || (result && result.toLowerCase().indexOf('error') !== -1));

  // Update PENDING_TOOL_CALLS
  for (var i = PENDING_TOOL_CALLS.length - 1; i >= 0; i--) {
    if (PENDING_TOOL_CALLS[i].name === name && !PENDING_TOOL_CALLS[i].result) {
      PENDING_TOOL_CALLS[i].result = result;
      PENDING_TOOL_CALLS[i].error = hasError;
      break;
    }
  }

  if (ev.session_id && ev.session_id !== CURRENT_SESSION) return;

  if (STREAMING_DIV && STREAMING_DIV.isConnected) {
    var lines = STREAMING_DIV.querySelectorAll('.tool-line');
    lines.forEach(function(line) {
      if (line.dataset.toolName === name) {
        // Stop timer
        if (line._timer) { clearInterval(line._timer); line._timer = null; }
        // Update status
        line.querySelector('.tl-status').className = 'tl-status ' + (hasError ? 'error' : 'done');
        line.querySelector('.tl-status').textContent = hasError ? '✗' : '✓';
        // Remove running pulse from icon
        var iconEl = line.querySelector('.tl-icon');
        if (iconEl) iconEl.classList.remove('running');
        // Close live output, attach result to details
        if (line._liveDiv) line._liveDiv.classList.remove('open');
        attachToolDetails(line, {name: name, params: '', result: result});
        line._detailDiv.classList.add('open');
        scrollToBottom();
      }
    });
  }
}
```

- [ ] **Step 4: Update `finalizeToolCards`**

Replace lines 2240–2255. Adapt to finalize tool-line elements:

```javascript
function finalizeToolLines(container, finalState, statusText) {
  var lines = container.querySelectorAll('.tool-line');
  lines.forEach(function(line) {
    if (line._timer) { clearInterval(line._timer); line._timer = null; }
    var statusEl = line.querySelector('.tl-status');
    if (statusEl && statusEl.classList.contains('running')) {
      statusEl.className = 'tl-status ' + finalState;
      statusEl.textContent = finalState === 'error' ? '✗' : '✓';
    }
    var iconEl = line.querySelector('.tl-icon');
    if (iconEl) iconEl.classList.remove('running');
    if (line._liveDiv) line._liveDiv.classList.remove('open');
  });
}
```

- [ ] **Step 5: Update `handleStateChangeEvent` references**

In `handleStateChangeEvent` (line 2257), replace calls to `finalizeToolCards` with `finalizeToolLines` (3 occurrences: done, error, stopped branches).

- [ ] **Step 6: Commit**

```bash
git add web/index.html
git commit -m "feat: update streaming handlers to use inline tool rendering"
```

---

### Task 4: Update history rendering

**Files:**
- Modify: `web/index.html` — `renderToolCallsInline` (~3872), `renderToolCallsGroup` (~3816), and session loading code (~3300)

- [ ] **Step 1: Rewrite `renderToolCallsInline`**

Replace lines 3872–3889:

```javascript
function renderToolCallsInline(toolCalls, agentMsgDiv) {
  if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length === 0) return;
  // Check if already rendered
  var existing = agentMsgDiv.querySelectorAll('.tool-line');
  if (existing.length >= toolCalls.length) return;

  var timeEl = agentMsgDiv.querySelector('.msg-time');
  toolCalls.forEach(function(tc) {
    // Skip if this tool name already has a line
    var alreadyExists = agentMsgDiv.querySelector('.tool-line[data-tool-name="' + tc.name + '"]');
    if (alreadyExists) return;

    var line = renderToolLine({name: tc.name, params: tc.params || '', result: tc.result || '', status: tc.status || 'done', duration: tc.duration || 0});
    if (tc.result) {
      attachToolDetails(line, tc);
      line._detailDiv.classList.remove('open'); // collapsed by default
    }
    if (timeEl) {
      agentMsgDiv.insertBefore(line, timeEl);
      agentMsgDiv.insertBefore(line._liveDiv, timeEl);
      agentMsgDiv.insertBefore(line._detailDiv, timeEl);
    } else {
      agentMsgDiv.appendChild(line);
      agentMsgDiv.appendChild(line._liveDiv);
      agentMsgDiv.appendChild(line._detailDiv);
    }
  });
  // Hide live divs for completed tools
  agentMsgDiv.querySelectorAll('.tl-live').forEach(function(d) { d.classList.remove('open'); });
}
```

- [ ] **Step 2: Simplify `renderToolCallsGroup`**

Replace lines 3816–3856. Since inline rendering is preferred, this becomes a thin wrapper:

```javascript
function renderToolCallsGroup(jsonContent, container) {
  var toolCalls;
  try { toolCalls = JSON.parse(jsonContent); } catch(e) { return; }
  if (!toolCalls || !Array.isArray(toolCalls) || toolCalls.length === 0) return;
  // Create a standalone agent message to hold the tools
  var msgDiv = document.createElement('div');
  msgDiv.className = 'msg agent';
  msgDiv.innerHTML = aiRoleHeader() + '<div class="msg-content"></div>' + buildAgentCopyButton();
  renderToolCallsInline(toolCalls, msgDiv);
  container.appendChild(msgDiv);
}
```

- [ ] **Step 3: Add `getToolCallsFromMsg` compatibility helper**

Insert near the `renderToolCallsInline` function:

```javascript
function getToolCallsFromMsg(msg) {
  if (msg.tool_calls) return msg.tool_calls;              // new inline format
  if (msg.role === 'tool-calls') {                         // old card format
    try { return JSON.parse(msg.content); } catch(e) {}
  }
  return null;
}
```

- [ ] **Step 4: Update `loadSessionMessages` message parsing**

In the session loading code (~lines 3300–3364), replace the `role === 'tool-calls'` branches. Instead of checking `m.role === 'tool-calls'`, check both `m.role === 'tool-calls'` (old) and `m.role === 'agent' && m.tool_calls` (new).

Modify the agent/assistant branch to also check for `m.tool_calls`:

Replace the agent branches (lines 3307-3316 and 3345-3347) with:

```javascript
      } else if (m.role === 'agent' || m.role === 'assistant') {
        if (m.streaming) {
          var div = document.createElement('div');
          div.className = 'msg agent streaming';
          div.innerHTML = aiRoleHeader() + '<div class="msg-content streaming-cursor">' + renderMarkdown(m.content) + '</div>' + buildAgentCopyButton();
          container.appendChild(div);
          STREAMING_DIV = div;
        } else {
          appendMessage('agent', renderMarkdown(m.content), ts);
        }
        msgCount++;
        // New: render embedded tool calls
        if (m.tool_calls && m.tool_calls.length > 0) {
          var lastAgent = container.querySelector('.msg.agent:last-of-type');
          if (lastAgent) renderToolCallsInline(m.tool_calls, lastAgent);
        }
```

And keep the old `role === 'tool-calls'` branch for backward compatibility (lines 3318-3326, 3348-3355), but route through `getToolCallsFromMsg`:

```javascript
      } else if (m.role === 'tool-calls') {
        var tcArray = getToolCallsFromMsg(m);
        if (tcArray) {
          var prevAgent = container.querySelector('.msg.agent:last-of-type');
          if (prevAgent) {
            renderToolCallsInline(tcArray, prevAgent);
          } else {
            renderToolCallsGroup(m.content, container);
          }
        }
        msgCount++;
```

- [ ] **Step 5: Commit**

```bash
git add web/index.html
git commit -m "feat: update history rendering for inline tool calls"
```

---

### Task 5: Cleanup — remove dead card code

**Files:**
- Modify: `web/index.html`

- [ ] **Step 1: Remove `buildToolCard`**

Delete lines 3739–3814 (entire function). Already replaced by `renderToolLine`.

- [ ] **Step 2: Remove old `copyToolResult`**

Delete old `copyToolResult` function (~line 3860). Already updated in Task 2.

- [ ] **Step 3: Remove `renderRunEvents` and `appendRunEvent` legacy code**

These functions (~lines 2389–2433) render old `.msg.tool` and `.msg.tool-result` elements from `active_run_events`. They are only called from line 3466 (`renderRunEvents(runDiv, sessData.active_run_events)`). Since running sessions now use inline tool lines from SSE events directly, this legacy path is dead.

Delete `renderRunEvents` (lines 2389–2400) and `appendRunEvent` (lines 2403–2433).

- [ ] **Step 4: Remove the `role === 'tool-calls'` check for `active_run_events` dedup**

In the `active_run_events` processing (lines 3396–3404), the `alreadyHasToolCalls` check references the old `role === 'tool-calls'` format. Simplify: since tool calls are now embedded in agent messages (via `m.tool_calls`), the "already has tool calls" check should look for `.tool-line` elements in STREAMING_DIV instead:

```javascript
        var alreadyHasToolCalls = false;
        if (STREAMING_DIV) {
          alreadyHasToolCalls = STREAMING_DIV.querySelectorAll('.tool-line').length > 0;
        }
```

But actually, this entire block (lines 3390–3469) handles draining historical events into the streaming div. Since we no longer use `role: 'tool-calls'` in the message store, the `alreadyHasToolCalls` logic can be simplified to just check for existing tool lines in the DOM.

Replace the block from `// If liveMsgs already has tool-calls...` (line 3393) up to `// When session is not running...` (line 3471) with:

```javascript
        // If STREAMING_DIV already has tool lines (rendered from cache),
        // only drain token events to continue streaming.
        var alreadyHasToolLines = STREAMING_DIV && STREAMING_DIV.querySelectorAll('.tool-line').length > 0;
        if (STREAMING_DIV) {
          // Drain historical tokens
          var tokenBuf = '';
          for (var _ei = 0; _ei < sessData.active_run_events.length; _ei++) {
            var _ev = sessData.active_run_events[_ei];
            if (_ev.event_type === 'token' && _ev.payload && _ev.payload.content) {
              tokenBuf += _ev.payload.content;
            }
          }
          if (tokenBuf) {
            var _content = STREAMING_DIV.querySelector('.msg-content');
            if (_content) {
              _content.innerHTML = renderMarkdown(tokenBuf);
              STREAMING_CONTENT = tokenBuf;
              STREAMING_DIV._lastRenderedLen = tokenBuf.length;
            }
          }
        } else if (!alreadyHasToolLines && isRunning) {
          // No cache rendered — create streaming div, SSE stream will fill it
          _ensureStreamingDiv();
        }
```

- [ ] **Step 5: Commit**

```bash
git add web/index.html
git commit -m "chore: remove dead card code, clean up legacy rendering paths"
```

---

### Task 6: Verify

**Files:**
- Run: check for any remaining references to removed card classes

- [ ] **Step 1: Verify no dangling references**

```bash
# Check for remaining card references in JS
grep -n "tool-card\|timeline-tool-card\|buildToolCard\|card-name\|card-status\|card-icon\|card-timestamp\|tool-card-summary\|tool-card-progress\|tool-card-body\|field-label\|field-code\|field-result" web/index.html
```
Expected: Zero matches (all removed).

```bash
# Check for remaining card class references in JS strings (classList.add/remove)
grep -n "classList.*running\|classList.*done\|classList.*error\|\.running\|\.done" web/index.html | grep -v "tl-\|tool-line\|statusDot\|inline-status" | head -20
```
Expected: No card-specific class manipulations.

- [ ] **Step 2: Check fix_patch.js for card references**

```bash
grep -n "tool-card\|buildToolCard\|tool-output-stream\|card-name\|card-header" fix_patch.js 2>/dev/null || echo "no fix_patch.js or clean"
```

- [ ] **Step 3: Commit final**

```bash
git add web/index.html
git commit -m "chore: clean up remaining card references"
```

---

## Self-Review Check

1. **Spec coverage:**
   - Compact inline view → Task 1 (CSS) + Task 2 (renderToolLine)
   - Expandable details → Task 2 (tool-details, attachToolDetails)
   - Streaming auto-expand + live output → Task 3 (handleToolOutputEvent, tl-live)
   - Completed collapse → Task 3 (handleToolResultEvent closes tl-live)
   - Error auto-expand → Task 3 (handleToolResultEvent opens detailDiv)
   - History rendering → Task 4 (renderToolCallsInline, loadSessionMessages)
   - Backward compatibility → Task 4 (getToolCallsFromMsg)
   - Copy button → Task 2 (td-copy-btn, copyToolResult)
   - Old card code removal → Task 5

2. **Placeholder scan:** Complete — no TBD, no TODOs.

3. **Type consistency:** `renderToolLine` returns a `.tool-line` div with `._liveDiv` and `._detailDiv` properties. All consumers (handleToolStartEvent, handleToolOutputEvent, handleToolResultEvent, renderToolCallsInline) access these consistently.

4. **DRY check:** `getToolIcon`, `getToolSummary`, `escHtml` are existing utilities reused — not redefined.
