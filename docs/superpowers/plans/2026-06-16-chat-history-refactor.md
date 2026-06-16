# Chat History Architecture Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate duplicate AI message content when switching sessions during AI streaming, simplify frontend data model to single source of truth (API), and remove cross-session state contamination.

**Architecture:** Remove global EventSource (which delivered events for all subscribed sessions). SSE is now per-session via `openDirectSSEStream`. Remove `SESSION_STREAMING_CONTENT` cross-session token cache. Completed session data is always read from API on switch-back. In-flight session state (`STREAMING_CONTENT`, `PENDING_TOOL_CALLS`) is reset on every switch. Poll no longer syncs messages — only checks session state.

**Tech Stack:** Vanilla JS in `web/index.html`. No backend changes. Verify with Playwright tests (`test_all_bugs.py`, `test_delayed_dup.py`, `test_multi_turn.py`, `test_chat_history.py`).

**Files:**
- Modify: `web/index.html`

---

### Task 1: Remove global EventSource infrastructure

Remove the global EventSource that subscribed to all sessions. Keep per-session `openDirectSSEStream` which is the only SSE connection now.

**Files:**
- Modify: `web/index.html:1889-1965`

- [ ] **Step 1: Remove global EventSource variables and constants**

Remove this code block (lines 1889-1965):

```javascript
// === Background AI Runs: global EventSource ===
let GLOBAL_EVENT_SOURCE = null;
let LAST_EVENT_ID = parseInt(localStorage.getItem('last_event_id') || '0', 10);
const SUBSCRIBED_SESSIONS = new Set();
let CURRENT_RUN_ID = null;
const STOPPED_RUNS = new Set(); // Track runs that have been stopped
var _pendingStopSession = null; // Session ID that user just requested to stop
var _directSSEController = null; // AbortController for direct SSE fetch stream

const EVENT_HANDLERS = {
  token: handleTokenEvent,
  tool_start: handleToolStartEvent,
  tool_output: handleToolOutputEvent,
  tool_result: handleToolResultEvent,
  confirm_required: handleConfirmRequiredEvent,
  state_change: handleStateChangeEvent,
};

function startGlobalEventSource() {
  if (GLOBAL_EVENT_SOURCE) { GLOBAL_EVENT_SOURCE.close(); GLOBAL_EVENT_SOURCE = null; }
  const ids = Array.from(SUBSCRIBED_SESSIONS).slice(0, MAX_SUBSCRIBED_SESSIONS * 5);
  if (ids.length === 0) return;
  const params = new URLSearchParams({
    session_ids: ids.join(','),
    last_event_id: String(LAST_EVENT_ID),
    token: localStorage.getItem('token') || '',
    v: '2',
  });
  const es = new EventSource(API + '/agent/events?' + params);
  es.onmessage = function(e) {
    LAST_EVENT_ID = parseInt(e.lastEventId, 10);
    localStorage.setItem('last_event_id', String(LAST_EVENT_ID));
    var parsed;
    try { parsed = JSON.parse(e.data); } catch(ex) { return; }
    _esProcessingEvents = true;
    try {
      var handler = EVENT_HANDLERS[parsed.event_type];
      if (handler && !_isEventProcessed(e.lastEventId)) handler(parsed, e.lastEventId);
    } finally {
      _esProcessingEvents = false;
    }
  };
  es.onerror = function() {
    setTimeout(startGlobalEventSource, SSE_RECONNECT_DELAY_MS);
  };
  GLOBAL_EVENT_SOURCE = es;
}

var _esProcessingEvents = false;
var _processedEventIds = new Set(); // Dedup: track event IDs already handled
function _isEventProcessed(eventId) {
  if (!eventId) return false;
  if (_processedEventIds.has(eventId)) return true;
  _processedEventIds.add(eventId);
  // Keep the set from growing unbounded — prune old entries
  if (_processedEventIds.size > MAX_PROCESSED_EVENTS) {
    var arr = Array.from(_processedEventIds).sort(function(a,b){return a-b;});
    _processedEventIds = new Set(arr.slice(EVENT_PRUNE_THRESHOLD));
  }
  return false;
}
function subscribeToSession(sessionID) {
  if (SUBSCRIBED_SESSIONS.has(sessionID)) return;
  SUBSCRIBED_SESSIONS.add(sessionID);
  if (SUBSCRIBED_SESSIONS.size > MAX_SUBSCRIBED_SESSIONS) {
    // Remove oldest sessions to keep URL length manageable
    var toRemove = Array.from(SUBSCRIBED_SESSIONS).slice(0, SUBSCRIBED_SESSIONS.size - MAX_SUBSCRIBED_SESSIONS);
    toRemove.forEach(function(sid) { SUBSCRIBED_SESSIONS.delete(sid); });
  }
  // Restart EventSource immediately (not deferred) so the new session's
  // events are captured from the start. _esProcessingEvents guards against
  // restart during event processing (handleStateChangeEvent no longer
  // calls loadSessions, but keep the guard for safety).
  if (!_esProcessingEvents) {
    startGlobalEventSource();
  }
}
```

Replace with:

```javascript
// === Direct SSE stream for the current run ===
let CURRENT_RUN_ID = null;
const STOPPED_RUNS = new Set(); // Track runs that have been stopped
var _pendingStopSession = null; // Session ID that user just requested to stop
var _directSSEController = null; // AbortController for direct SSE fetch stream

const EVENT_HANDLERS = {
  token: handleTokenEvent,
  tool_start: handleToolStartEvent,
  tool_output: handleToolOutputEvent,
  tool_result: handleToolResultEvent,
  confirm_required: handleConfirmRequiredEvent,
  state_change: handleStateChangeEvent,
};

var _processedEventIds = new Set(); // Dedup: track event IDs already handled
function _isEventProcessed(eventId) {
  if (!eventId) return false;
  if (_processedEventIds.has(eventId)) return true;
  _processedEventIds.add(eventId);
  // Keep the set from growing unbounded — prune old entries
  if (_processedEventIds.size > MAX_PROCESSED_EVENTS) {
    var arr = Array.from(_processedEventIds).sort(function(a,b){return a-b;});
    _processedEventIds = new Set(arr.slice(EVENT_PRUNE_THRESHOLD));
  }
  return false;
}
```

Note: `LAST_EVENT_ID` is being removed because the direct stream (`openDirectSSEStream`) maintains its own local `currentId` and updates `LAST_EVENT_ID` internally. Actually wait — I need to re-check. `LAST_EVENT_ID` is referenced in `openDirectSSEStream`. Let me keep that one.

Actually looking at the code again:

```javascript
var params = new URLSearchParams({
    session_ids: sessionId,
    last_event_id: String(LAST_EVENT_ID),
```

And inside the direct stream:
```javascript
if (currentId) {
  LAST_EVENT_ID = parseInt(currentId, 10);
  localStorage.setItem('last_event_id', String(LAST_EVENT_ID));
}
```

So I need to keep `LAST_EVENT_ID` since `openDirectSSEStream` uses it. Let me adjust: keep `LAST_EVENT_ID` variable, remove `GLOBAL_EVENT_SOURCE`, `SUBSCRIBED_SESSIONS`, `startGlobalEventSource`, `subscribeToSession`, `_esProcessingEvents`.

- [ ] **Step 2: Remove `MAX_SUBSCRIBED_SESSIONS` constant**

Remove line 1809:
```javascript
const MAX_SUBSCRIBED_SESSIONS = 10;
```

- [ ] **Step 3: Remove `subscribeToSession` call from `loadSessions`**

In `loadSessions` (~line 3555-3559), replace:

```javascript
  var hadNew = false;
  data.sessions.forEach(function(s) {
    if (!SUBSCRIBED_SESSIONS.has(s.session_id)) hadNew = true;
    subscribeToSession(s.session_id);
  });
```

With:

```javascript
```

(Just remove the whole `hadNew` variable and the `forEach` block.)

- [ ] **Step 4: Remove `subscribeToSession` call from `switchSession`**

In `switchSession` (~line 3875, after `openDirectSSEStream(sid)`), find and remove:
```javascript
          subscribeToSession(sid);
```

So that the code changes from:
```javascript
          subscribeToSession(sid);
          openDirectSSEStream(sid);
```

To:
```javascript
          openDirectSSEStream(sid);
```

- [ ] **Step 5: Verify openDirectSSEStream still uses `LAST_EVENT_ID` correctly**

No change needed. The direct stream already declares its own `currentId` variable per-frame and persists to `LAST_EVENT_ID`. The `LAST_EVENT_ID` variable declaration stays at the top level.

- [ ] **Step 6: Commit**

```bash
git add web/index.html
git commit -m "refactor: remove global EventSource, keep per-session SSE only"
```

---

### Task 2: Remove `SESSION_STREAMING_CONTENT` and `savePartialContent`

**Files:**
- Modify: `web/index.html`

- [ ] **Step 1: Remove `SESSION_STREAMING_CONTENT` variable**

Change line 2063:
```javascript
var SESSION_STREAMING_CONTENT = {};
```
To:
```javascript
```

(Remove the line.)

- [ ] **Step 2: Remove `savePartialContent` function**

Remove lines 2313-2334:
```javascript
function savePartialContent(ev) {
  if (!ev.session_id) return;
  if (!SESSION_MESSAGES[ev.session_id]) SESSION_MESSAGES[ev.session_id] = [];
  if (STREAMING_CONTENT) {
    SESSION_MESSAGES[ev.session_id].push({role: 'agent', content: STREAMING_CONTENT, created_at: new Date().toISOString(), _run_id: ev.run_id, streaming: true});
  }
  if (PENDING_TOOL_CALLS.length > 0) {
    SESSION_MESSAGES[ev.session_id].push({
      role: 'tool-calls',
      content: JSON.stringify(PENDING_TOOL_CALLS.map(function(tc) {
        return {name: tc.name, params: tc.params, result: tc.result};
      })),
      created_at: new Date().toISOString(),
      _run_id: ev.run_id,
      streaming: true
    });
  }
}
```

- [ ] **Step 3: Remove `SESSION_STREAMING_CONTENT` from `handleTokenEvent`**

In `handleTokenEvent` (~line 2107-2111), remove the per-session token save:

Change from:
```javascript
  if (ev.run_id && STOPPED_RUNS.has(ev.run_id)) return;
  // Save tokens per-session so the done handler always has complete content,
  // even when the user switched sessions during streaming.
  if (ev.session_id) {
    SESSION_STREAMING_CONTENT[ev.session_id] = (SESSION_STREAMING_CONTENT[ev.session_id] || '') + ev.payload.content;
  }
  if (ev.session_id && ev.session_id !== CURRENT_SESSION) return;
```

To:
```javascript
  if (ev.run_id && STOPPED_RUNS.has(ev.run_id)) return;
  if (ev.session_id && ev.session_id !== CURRENT_SESSION) return;
```

- [ ] **Step 4: Remove `SESSION_STREAMING_CONTENT` references from `handleStateChangeEvent` done handler**

In the done handler (~line 2360-2377), remove the early-return block that checks `!SESSION_STREAMING_CONTENT[ev.session_id]`:

Change from:
```javascript
    // For non-current sessions where SESSION_STREAMING_CONTENT was already
    // deleted (e.g., by else if (!isRunning) in switchSession), this is a late
    // done event — skip cache push to avoid inflating cache with stale blocks.
    // Also skip PENDING_TOOL_CALLS processing since they belong to the current
    // session, not this one.
    if (ev.session_id && !isCurrentSession && !SESSION_STREAMING_CONTENT[ev.session_id]) {
      delete SESSION_STREAMING_CONTENT[ev.session_id];
      // Don't skip finalization of last DOM state if STREAMING_DIV exists
      if (STREAMING_DIV && isCurrentSession) {
        finalizeToolCards(STREAMING_DIV, 'done', LOCALE === 'zh' ? '完成' : 'done');
        scrollToBottom();
        STREAMING_DIV = null;
      }
      // Clear STREAMING_CONTENT only for current session to avoid corrupting it
      if (isCurrentSession) STREAMING_CONTENT = '';
      PENDING_TOOL_CALLS = []; // always safe: done events finalize the run
      return;
    }
```

To:
```javascript
```

(Remove entirely. The main done handler block below already handles everything.)

Also in the main cache writing block (~line 2421-2438), remove the `SESSION_STREAMING_CONTENT` branch:

Change from:
```javascript
      } else {
        // STREAMING_DIV is null — user switched sessions during streaming.
        // Use per-session streaming content which captures all tokens (even those
        // received after the switch), ensuring the cache has complete content.
        var sessionContent = SESSION_STREAMING_CONTENT[ev.session_id];
        if (sessionContent) {
          // We have complete content — remove partial saves and use this instead.
          if (runId) {
            SESSION_MESSAGES[ev.session_id] = SESSION_MESSAGES[ev.session_id].filter(function(m) {
              return m._run_id !== runId;
            });
          }
          blocks.push({role: 'agent', content: sessionContent});
          delete SESSION_STREAMING_CONTENT[ev.session_id];
        }
        // Without per-session content, partial saves from savePartialContent
        // remain in the cache (no filter, no replacement). This is the best
        // available data and prevents the poll from detecting a mismatch.
      }
```

To:
```javascript
      }
```

Also remove the `if (ev.session_id) delete SESSION_STREAMING_CONTENT[ev.session_id];` at line 2494.

And in the error/stopped branches (lines 2506-2507, 2523-2524), remove the `savePartialContent(ev);` calls:

Change from:
```javascript
      // Save partial content + tool calls to prevent poll re-rendering duplicates
      savePartialContent(ev);
```
To:
```javascript
```

(Remove both occurrences — one in error branch ~2506-2507, one in stopped branch ~2523-2524.)

Also remove the `if (ev.session_id) delete SESSION_STREAMING_CONTENT[ev.session_id];` lines in error (~2513) and stopped (~2530) branches.

- [ ] **Step 5: Remove `SESSION_STREAMING_CONTENT` references from `switchSession`**

In `switchSession` (~line 3755), remove:
```javascript
    delete SESSION_STREAMING_CONTENT[sid];
```

Also remove the comment about it on lines 3751-3752:
```
    // Clear SESSION_STREAMING_CONTENT to prevent delayed done events
    // (from global EventSource) from adding stale content on top of complete cache.
```

- [ ] **Step 6: Commit**

```bash
git add web/index.html
git commit -m "refactor: remove SESSION_STREAMING_CONTENT and savePartialContent"
```

---

### Task 3: Simplify `handleStateChangeEvent` done handler

**Files:**
- Modify: `web/index.html:2335-2531`

**Goal:** Remove DOM-to-cache write logic. The done event for a non-current session does nothing (the data will come from API on next switch). The done event for the current session only does DOM cleanup.

- [ ] **Step 1: Add early return for non-current sessions**

At the top of the `done` branch (~line 2338), after `resetCurrentRun(ev)`, add an early return so non-current sessions skip all DOM and cache work:

Change lines 2338-2339 from:
```javascript
  if (newState === 'done') {
    resetCurrentRun(ev);
```

To:
```javascript
  if (newState === 'done') {
    resetCurrentRun(ev);
    // Non-current sessions: don't touch DOM or cache. Data comes from API on session switch.
    if (!isCurrentSession) return;
```

- [ ] **Step 2: Remove all cache-write and DOM-collection code for done handler**

Remove the large block from line 2344 to 2494 (everything inside `if (newState === 'done')` after the early return), and replace with the simplified version:

Change from:
```javascript
    if (STREAMING_DIV && isCurrentSession) {
      STREAMING_DIV.classList.remove('streaming');
      // Finalize all .msg-content blocks — render markdown and remove streaming cursor
      var allContentEls = STREAMING_DIV.querySelectorAll('.msg-content');
      allContentEls.forEach(function(el) {
        el.classList.remove('streaming-cursor');
        // Remove "思考中..." indicators
        var statusEl = el.querySelector('.inline-status');
        if (statusEl) statusEl.remove();
        // If content block is empty (was only showing 思考中), remove it entirely
        if (!el.textContent.trim()) el.remove();
      });
      // Also remove any orphaned inline-status at STREAMING_DIV level
      var orphanStatus = STREAMING_DIV.querySelector(':scope > .inline-status');
      if (orphanStatus) orphanStatus.remove();
    }
    // For non-current sessions where SESSION_STREAMING_CONTENT was already
    // deleted (e.g., by else if (!isRunning) in switchSession), this is a late
    // done event — skip cache push to avoid inflating cache with stale blocks.
    // Also skip PENDING_TOOL_CALLS processing since they belong to the current
    // session, not this one.
    if (ev.session_id && !isCurrentSession && !SESSION_STREAMING_CONTENT[ev.session_id]) {
      delete SESSION_STREAMING_CONTENT[ev.session_id];
      // Don't skip finalization of last DOM state if STREAMING_DIV exists
      if (STREAMING_DIV && isCurrentSession) {
        finalizeToolCards(STREAMING_DIV, 'done', LOCALE === 'zh' ? '完成' : 'done');
        scrollToBottom();
        STREAMING_DIV = null;
      }
      // Clear STREAMING_CONTENT only for current session to avoid corrupting it
      if (isCurrentSession) STREAMING_CONTENT = '';
      PENDING_TOOL_CALLS = []; // always safe: done events finalize the run
      return;
    }
    // Save to in-memory cache — always do this for the run's session
    // even if STREAMING_DIV is null (user switched sessions during streaming).
    // IMPORTANT: For non-current sessions, use SESSION_STREAMING_CONTENT instead
    // of STREAMING_DIV, since STREAMING_DIV belongs to the current session.
    if (ev.session_id) {
      if (!SESSION_MESSAGES[ev.session_id]) SESSION_MESSAGES[ev.session_id] = [];
      var runId = ev.run_id || '';
      var blocks = [];
      var useDomContent = STREAMING_DIV && isCurrentSession;
      if (useDomContent) {
        // STREAMING_DIV exists for the current session — remove partial saves
        // for this run and replace with finalized content from the DOM.
        var timeEl = STREAMING_DIV.querySelector('.msg-time');
        if (runId) {
          SESSION_MESSAGES[ev.session_id] = SESSION_MESSAGES[ev.session_id].filter(function(m) {
            return m._run_id !== runId;
          });
        }
        // Collect all content blocks and tool cards from STREAMING_DIV in order
        var children = STREAMING_DIV.children;
        for (var bi = 0; bi < children.length; bi++) {
          var child = children[bi];
          if (child === timeEl) continue; // skip time element
          if (child.classList.contains('msg-role') || child.classList.contains('agent-copy-btn')) continue;
          if (child.classList.contains('msg-content')) {
            var text = child.textContent.trim();
            if (text) blocks.push({role: 'agent', content: text});
          } else if (child.classList.contains('timeline-tool-card')) {
            var tcName = child.querySelector('.card-name');
            var tcResult = child.querySelector('.field-result');
            var tcParams = child.querySelector('.field-args');
            var tcTimestamp = child.querySelector('.card-timestamp');
            blocks.push({
              role: 'tool-calls',
              content: JSON.stringify([{
                name: tcName ? tcName.textContent : 'unknown',
                params: tcParams ? tcParams.textContent : '',
                result: tcResult ? tcResult.textContent : '',
                timestamp: tcTimestamp ? tcTimestamp.textContent : ''
              }])
            });
          }
        }
      } else {
        // STREAMING_DIV is null — user switched sessions during streaming.
        // Use per-session streaming content which captures all tokens (even those
        // received after the switch), ensuring the cache has complete content.
        var sessionContent = SESSION_STREAMING_CONTENT[ev.session_id];
        if (sessionContent) {
          // We have complete content — remove partial saves and use this instead.
          if (runId) {
            SESSION_MESSAGES[ev.session_id] = SESSION_MESSAGES[ev.session_id].filter(function(m) {
              return m._run_id !== runId;
            });
          }
          blocks.push({role: 'agent', content: sessionContent});
          delete SESSION_STREAMING_CONTENT[ev.session_id];
        }
        // Without per-session content, partial saves from savePartialContent
        // remain in the cache (no filter, no replacement). This is the best
        // available data and prevents the poll from detecting a mismatch.
      }
      // Save pending tool calls that were not captured from DOM (e.g., if
      // STREAMING_DIV was null during a session switch). These are appended
      // to blocks so they get the same timestamp/run_id treatment below.
      // Only process PENDING_TOOL_CALLS if we have actual content for this
      // session (blocks.length > 0). An empty blocks array means this is a
      // late done event for an already-finalized session — skip foreign
      // tool calls that belong to the current session instead.
      if (blocks.length > 0 && PENDING_TOOL_CALLS.length > 0) {
        var savedTcNames = {};
        blocks.forEach(function(b) {
          if (b.role === 'tool-calls') {
            try { var arr = JSON.parse(b.content); arr.forEach(function(t) { savedTcNames[t.name] = true; }); } catch(e) { console.warn('[MCM]', e); }
          }
        });
        PENDING_TOOL_CALLS.forEach(function(tc) {
          if (!savedTcNames[tc.name]) {
            blocks.push({
              role: 'tool-calls',
              content: JSON.stringify([{name: tc.name, params: tc.params, result: tc.result}])
            });
          }
        });
      }
      // Safety dedup: prevent duplicate tool-calls entries from reaching cache.
      // This catches edge cases where the DOM or PENDING_TOOL_CALLS sources
      // contain redundant tool cards (e.g., SSE replay after cache render).
      var seenToolNames = {};
      blocks.forEach(function(b) {
        if (b.role === 'tool-calls') {
          try {
            var tcArr = JSON.parse(b.content);
            if (tcArr.length === 1 && seenToolNames[tcArr[0].name]) return;
            tcArr.forEach(function(t) { seenToolNames[t.name] = true; });
          } catch(e) { /* keep as-is */ }
        }
        b.created_at = new Date().toISOString();
        b._run_id = ev.run_id;
        SESSION_MESSAGES[ev.session_id].push(b);
      });
    }
    if (STREAMING_DIV && isCurrentSession) {
      // Finalize any still-running tool cards (stop timers, mark done)
      finalizeToolCards(STREAMING_DIV, 'done', LOCALE === 'zh' ? '完成' : 'done');
      scrollToBottom();
      STREAMING_DIV = null;
    }
    // Only clear global streaming state for the current session.
    // Non-current session cleanup is handled by the per-session
    // SESSION_STREAMING_CONTENT and PENDING_TOOL_CALLS belongs
    // to the current streaming session — never clear it for others.
    if (isCurrentSession) {
      STREAMING_CONTENT = '';
      PENDING_TOOL_CALLS = [];
    }
    if (ev.session_id) delete SESSION_STREAMING_CONTENT[ev.session_id];
```

To:
```javascript
    // Even for current session, DOM may be null (e.g., SSE events arrived after
    // user switched sessions). Skip finalization in that case — data is safe in API.
    if (STREAMING_DIV) {
      STREAMING_DIV.classList.remove('streaming');
      // Finalize all .msg-content blocks — render markdown and remove streaming cursor
      var allContentEls = STREAMING_DIV.querySelectorAll('.msg-content');
      allContentEls.forEach(function(el) {
        el.classList.remove('streaming-cursor');
        // Remove "思考中..." indicators
        var statusEl = el.querySelector('.inline-status');
        if (statusEl) statusEl.remove();
        // If content block is empty (was only showing 思考中), remove it entirely
        if (!el.textContent.trim()) el.remove();
      });
      // Also remove any orphaned inline-status at STREAMING_DIV level
      var orphanStatus = STREAMING_DIV.querySelector(':scope > .inline-status');
      if (orphanStatus) orphanStatus.remove();
      // Finalize any still-running tool cards (stop timers, mark done)
      finalizeToolCards(STREAMING_DIV, 'done', LOCALE === 'zh' ? '完成' : 'done');
      scrollToBottom();
      STREAMING_DIV = null;
    }
    STREAMING_CONTENT = '';
    PENDING_TOOL_CALLS = [];
```

- [ ] **Step 3: Remove `savePartialContent` calls in error/stopped branches**

In both the error branch (lines 2506-2507) and stopped branch (lines 2523-2524):

```javascript
      // Save partial content + tool calls to prevent poll re-rendering duplicates
      savePartialContent(ev);
```

Remove those two calls (they're no longer needed since poll doesn't sync messages).

Also keep the `STREAMING_CONTENT = ''` and `STREAMING_DIV = null` in those branches — they're still needed for UI cleanup.

- [ ] **Step 4: Commit**

```bash
git add web/index.html
git commit -m "refactor: simplify handleStateChangeEvent done handler, remove cache writes"
```

---

### Task 4: Simplify `switchSession`

**Files:**
- Modify: `web/index.html:3600-3779`

**Goal:** Remove `savePartialContent` call and the `else if (!isRunning)` block. The `liveMsgs` cache + API data fallback already handles everything correctly.

- [ ] **Step 1: Remove `savePartialContent` logic from switchSession**

Remove lines 3607-3632:
```javascript
  lastSyncedMsgCount = 0;
  // Save streaming state of current session before switching.
  // Order: agent content FIRST, then tool-calls. This matches
  // handleStateChangeEvent's done branch and ensures renderToolCallsInline
  // can attach to the preceding agent message instead of creating a standalone group.
  if (CURRENT_SESSION && STREAMING_DIV && STREAMING_DIV.isConnected) {
    if (!SESSION_MESSAGES[CURRENT_SESSION]) SESSION_MESSAGES[CURRENT_SESSION] = [];
    // Save partial streaming content first
    if (STREAMING_CONTENT) {
      SESSION_MESSAGES[CURRENT_SESSION].push({role: 'agent', content: STREAMING_CONTENT, created_at: new Date().toISOString(), streaming: true, _run_id: CURRENT_RUN_ID});
    }
    // Then save pending tool calls
    if (PENDING_TOOL_CALLS.length > 0) {
      SESSION_MESSAGES[CURRENT_SESSION].push({
        role: 'tool-calls',
        content: JSON.stringify(PENDING_TOOL_CALLS.map(function(tc) {
          var status = 'done';
          if (!tc.result) status = 'running';
          else if (tc.error || (tc.result && String(tc.result).toLowerCase().indexOf('error') !== -1)) status = 'error';
          return {name: tc.name, params: tc.params, result: tc.result, status: status};
        })),
        created_at: new Date().toISOString(),
        streaming: true,
        _run_id: CURRENT_RUN_ID
      });
    }
  }
```

Replace with just setting `lastSyncedMsgCount = 0`:

```javascript
  lastSyncedMsgCount = 0;
```

Wait — we removed `lastSyncedMsgCount` usage from everywhere else. Let me check if `lastSyncedMsgCount` is used elsewhere... 

Actually `lastSyncedMsgCount` is used in the render below (`lastSyncedMsgCount = msgCount;`) and in the poll. Since we're simplifying the poll in Task 5 to remove the message sync, `lastSyncedMsgCount` can be completely removed in that task. For now, I'll keep `lastSyncedMsgCount = 0` but it'll be removed later.

Replace the savePartialContent block with just:
```javascript
```

(Remove it entirely, including `lastSyncedMsgCount = 0;`.)

Now keep `CURRENT_SESSION = sid;`, `STREAMING_DIV = null;`, `STREAMING_CONTENT = '';`, etc.

Also add `PENDING_TOOL_CALLS = [];` alongside `STREAMING_CONTENT = '';`:

Change:
```javascript
  CURRENT_SESSION = sid;
  STREAMING_DIV = null;
  STREAMING_CONTENT = '';
```

To:
```javascript
  CURRENT_SESSION = sid;
  STREAMING_DIV = null;
  STREAMING_CONTENT = '';
  PENDING_TOOL_CALLS = [];
```

- [ ] **Step 2: Remove `lastSyncedMsgCount` assignments from switchSession**

Remove `lastSyncedMsgCount = msgCount;` at line 3686 and line 3747 and line 3776.

- [ ] **Step 3: Remove the `else if (!isRunning)` block**

Remove lines 3749-3778:
```javascript
  } else if (!isRunning) {
    // Session completed on backend — use API data as source of truth.
    // Clear SESSION_STREAMING_CONTENT to prevent delayed done events
    // (from global EventSource) from adding stale content on top of complete cache.
    // Don't clear PENDING_TOOL_CALLS here — the done handler for non-current
    // sessions needs it to capture tool calls into the correct session's cache.
    delete SESSION_STREAMING_CONTENT[sid];
    if (sessData && sessData.messages && sessData.messages.length > 0) {
      SESSION_MESSAGES[sid] = sessData.messages.map(function(m) {
        return {role: m.role, content: m.content, created_at: m.created_at || m.timestamp || ''};
      });
      container.innerHTML = '';
      msgCount = 0;
      sessData.messages.forEach(function(m) {
        var ts = m.created_at || m.timestamp || '';
        if (m.role === 'user') {
          appendMessage('user', escHtml(m.content), ts); msgCount++;
        } else if (m.role === 'agent' || m.role === 'assistant') {
          appendMessage('agent', renderMarkdown(m.content), ts); msgCount++;
        } else if (m.role === 'tool-calls') {
          var prevAgent = container.querySelector('.msg.agent:last-of-type');
          if (prevAgent) { renderToolCallsInline(m.content, prevAgent); } else { renderToolCallsGroup(m.content, container); }
          msgCount++;
        } else if (m.role === 'system') {
          var div = document.createElement('div'); div.className = 'msg system'; div.textContent = m.content; container.appendChild(div); msgCount++;
        }
      });
      lastSyncedMsgCount = msgCount;
      STREAMING_DIV = null;
    }
  }
```

The API data rendering is already handled in the `if (!liveMsgs)` block (~lines 3707-3748). The `else if (!isRunning)` was a redundant second pass that overwrote the DOM after `liveMsgs` had already rendered.

- [ ] **Step 4: Commit**

```bash
git add web/index.html
git commit -m "refactor: simplify switchSession, remove partial save and redundant API data pass"
```

---

### Task 5: Simplify poll to only check session state

**Files:**
- Modify: `web/index.html:6628-6698`

**Goal:** Poll no longer syncs messages. Only checks session state and updates stop button.

- [ ] **Step 1: Remove `lastSyncedMsgCount` variable declaration**

Line 6630:
```javascript
var lastSyncedMsgCount = 0;
```

Remove it.

- [ ] **Step 2: Simplify `startSessionPoll`**

Replace the entire `startSessionPoll` function (lines 6632-6698):

```javascript
function startSessionPoll() {
  stopSessionPoll();
  var lastKnownState = '';
  sessionPollTimer = setInterval(async function() {
    if (!CURRENT_SESSION) return;
    // Skip if there's an active streaming message (SSE connected)
    if (document.querySelector('.msg.streaming')) return;
    try {
      var data = await apiFetch(API + '/agent/sessions/' + CURRENT_SESSION);
      if (!data || !data.messages) return;
      // Always refresh session list to update running/done state
      var currentState = data.state || data.status || 'idle';
      if (currentState !== lastKnownState) {
        lastKnownState = currentState;
        loadSessions();
      }
      // Hide status bar if session finished
      if (currentState !== 'running' && currentState !== 'waiting_confirm' && currentState !== 'queued') {
        if (_pendingStopSession === CURRENT_SESSION) _pendingStopSession = null;
        document.getElementById('chatStopBtn').style.display = 'none';
      }
      if (data.messages.length !== lastSyncedMsgCount) {
        // Merge DB data into global store (DB is source of truth after stream ends)
        SESSION_MESSAGES[CURRENT_SESSION] = data.messages.map(function(m) {
          return {role: m.role, content: m.content, created_at: m.created_at || m.timestamp || ''};
        });
        // Incremental append: only add new messages, never clear existing DOM
        var container = document.getElementById('chatMessages');
        var wasNearBottom = container.scrollTop + container.clientHeight >= container.scrollHeight - 150;
        var appended = 0;
        var existingCount = container.querySelectorAll('.msg').length;
        data.messages.forEach(function(m, idx) {
          if (idx < existingCount) return; // already rendered
          var ts = m.created_at || m.timestamp || '';
          if (m.role === 'user') {
            appendMessage('user', escHtml(m.content), ts);
            appended++;
          } else if (m.role === 'agent' || m.role === 'assistant') {
            appendMessage('agent', renderMarkdown(m.content), ts);
            appended++;
          } else if (m.role === 'tool-calls') {
            var prevAgent = container.querySelector('.msg.agent:last-of-type');
            if (prevAgent) {
              renderToolCallsInline(m.content, prevAgent);
            } else {
              renderToolCallsGroup(m.content, container);
            }
            appended++;
          } else if (m.role === 'system') {
            var div = document.createElement('div');
            div.className = 'msg system';
            div.textContent = m.content;
            container.appendChild(div);
            appended++;
          }
        });
        lastSyncedMsgCount = data.messages.length;
        // If still running, show status indicator (but not if user just clicked stop)
        if (data.status === 'running' && _pendingStopSession !== CURRENT_SESSION) {
          document.getElementById('chatStopBtn').style.display = '';
        }
        // Auto-scroll to show new messages
        if (appended > 0) scrollToBottom(container);
      }
    } catch(e) { console.warn('[MCM]', e); }
  }, SESSION_POLL_INTERVAL_MS);
}
```

With:

```javascript
function startSessionPoll() {
  stopSessionPoll();
  var lastKnownState = '';
  sessionPollTimer = setInterval(async function() {
    if (!CURRENT_SESSION) return;
    // Skip if there's an active streaming message (SSE connected)
    if (document.querySelector('.msg.streaming')) return;
    try {
      var data = await apiFetch(API + '/agent/sessions/' + CURRENT_SESSION);
      if (!data) return;
      // Update session state (running/done/etc)
      var currentState = data.state || data.status || 'idle';
      if (currentState !== lastKnownState) {
        lastKnownState = currentState;
        loadSessions();
      }
      // Hide status bar if session finished
      if (currentState !== 'running' && currentState !== 'waiting_confirm' && currentState !== 'queued') {
        if (_pendingStopSession === CURRENT_SESSION) _pendingStopSession = null;
        document.getElementById('chatStopBtn').style.display = 'none';
      }
      // If still running, show status indicator (but not if user just clicked stop)
      if (data.status === 'running' && _pendingStopSession !== CURRENT_SESSION) {
        document.getElementById('chatStopBtn').style.display = '';
      }
    } catch(e) { console.warn('[MCM]', e); }
  }, SESSION_POLL_INTERVAL_MS);
}
```

- [ ] **Step 3: Commit**

```bash
git add web/index.html
git commit -m "refactor: simplify poll to only check session state, remove message sync"
```

---

### Task 6: Run tests

**Files:**
- Test: `test_all_bugs.py`, `test_delayed_dup.py`, `test_multi_turn.py`, `test_chat_history.py`

- [ ] **Step 1: Copy updated index.html to Docker container and restart**

```bash
docker cp web/index.html multicloud-manager-backend-1:/app/web/index.html
docker restart multicloud-manager-backend-1
sleep 5
```

- [ ] **Step 2: Run all tests**

```bash
cd tests && python -m pytest test_all_bugs.py test_delayed_dup.py test_multi_turn.py test_chat_history.py -v 2>&1
```

Expected: All tests PASS.

- [ ] **Step 3: If any tests fail, examine output and fix**

Run individual failing tests with more detail:
```bash
cd tests && python -m pytest <test_file>::<test_name> -v -s 2>&1
```

- [ ] **Step 4: Commit final state**

```bash
git add web/index.html
git commit -m "fix: all tests passing after chat history refactor"
```
