# Background AI Runs Design

> Date: 2026-06-07
> Status: Approved
> Author: opencode

## Overview

Redesign the AI chat flow so that each chat request runs as a long-lived background task (a "Run") that survives page refresh, session switch, and tab close. The frontend subscribes to a single multiplexed Server-Sent Events (SSE) stream for live updates on all sessions; the backend persists every event to an append-only log so reconnecting clients can replay missed events.

Reference: the OpenHands [issue #5019](https://github.com/All-Hands-AI/OpenHands/issues/5019) "Allow the agent to continue to work in background for N minutes even after websocket closes" describes the same problem; their solution is to decouple the Session from the WebSocket and write everything to a durable event log that observers replay on reconnect.

## Motivation

Current limitations:
- AI streaming is bound to a single HTTP request lifecycle. Closing the tab kills the Run.
- The user has no way to know which sessions have an active AI or which have just finished.
- Switching to another session while AI is running is undefined (two concurrent Stream() handlers can corrupt DB state).
- On reconnect, the user cannot resume watching an in-progress response.

Goals:
1. AI work continues in the backend independent of the HTTP connection.
2. Page refresh / session switch / tab close all preserve in-flight work.
3. Returning to a session replays the in-progress state and continues live.
4. Session list shows live status (running / waiting confirm / done / error) with no manual refresh.
5. No backward compatibility burden (only the web frontend consumes this API; miniprogram is being removed).

## Scope

In scope:
- AI chat (`POST /api/agent/chat/stream` → background Run)
- AI tool confirm (`POST /api/agent/chat/confirm`)
- AI stop (`POST /api/agent/chat/stop`)
- Multiplexed SSE event subscription (`GET /api/agent/events`)
- Session list with state badge + queue depth + unread marker
- Deletion of miniprogram and non-streaming chat endpoints

Out of scope (v1):
- Multi-instance backend (single instance only; uses in-memory subscriber registry)
- Generic task abstraction for cloud sync / terraform apply (only AI chat)
- Pause / resume within a Run (only stop)
- Run-level priorities, budgets, or SLA
- Audit / search of historical events

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ Browser (single EventSource)                                │
│   GET /api/agent/events?session_ids=a,b,c&last_event_id=N   │
└────────────┬──────────────────────────────────┬──────────────┘
             │ subscribe (multiplexed)            │ trigger
             │                                    ▼
             │                          POST /api/agent/chat/stream
             │                          POST /api/agent/chat/confirm
             │                          POST /api/agent/chat/stop
             ▼                                    │
┌─────────────────────────────────────────────────────────────┐
│ Gin HTTP Server                                              │
│  ┌──────────────────────┐  ┌────────────────────────────┐  │
│  │ SSE: EventsHandler   │  │ Chat: ChatHandler           │  │
│  │ register subscriber  │  │ create Run, spawn goroutine│  │
│  │ read last_event_id   │  │ emit events + persist DB   │  │
│  │ replay + live push   │  │                            │  │
│  └──────────┬───────────┘  └──────────┬─────────────────┘  │
│             │                          │                     │
│             ▼                          ▼                     │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ RunManager (in-memory, single instance)              │   │
│  │   sessionID → Run{state, ctx, confirmCh, []sub}      │   │
│  │   sessionID → pending queue (runs WHERE state=pending)│   │
│  └──────────────────────────────────────────────────────┘   │
│             │                                                 │
│             ▼                                                 │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ Postgres                                              │   │
│  │   sessions (existing)   messages (existing)           │   │
│  │   runs (new)            run_events (new)             │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Components

- **RunManager** — singleton holding all active Runs, subscriber channels, and per-session pending queue. Provides `Start`, `Stop`, `Confirm`, `Subscribe`, and `OnRunComplete` methods.
- **Run** — one chat task (one user message → one AI multi-turn response). Owns a `context.Context` (cancelled on stop or backend shutdown), a `confirmCh chan confirmAction` for resuming from `waiting_confirm`, and the current iteration loop.
- **RunEvent** — internal representation of a streamable event; persisted to `run_events` and broadcast to subscribers.
- **EventsHandler** — SSE multiplex endpoint. On connect, replays `run_events WHERE id > $last_event_id AND session_id = ANY($1)`; then keeps the connection open and forwards live events from the subscribed sessions.

## Data Model

### New Table: `runs`

One row per Run (one user message → one AI multi-turn response).

```sql
CREATE TABLE runs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    state         TEXT NOT NULL DEFAULT 'pending'
                  CHECK (state IN ('pending','running','waiting_confirm','done','error','stopped')),
    user_message  TEXT NOT NULL,
    error_message TEXT,
    confirm_payload JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at    TIMESTAMPTZ,
    finished_at   TIMESTAMPTZ
);

CREATE INDEX idx_runs_session_state ON runs (session_id, state, created_at);
CREATE INDEX idx_runs_pending       ON runs (session_id, created_at) WHERE state = 'pending';
```

Key design points:
- `state='pending'` represents a queued user message. RunManager picks the oldest pending run in a session when the previous run reaches a terminal state.
- `confirm_payload JSONB` stores the pending `tool_calls` when `state='waiting_confirm'`.
- `created_at` records when the user submitted the message; `started_at` is when the goroutine actually started; `finished_at` is when the run reached a terminal state.

### New Table: `run_events`

Append-only event log per Run.

```sql
CREATE TABLE run_events (
    id          BIGSERIAL PRIMARY KEY,
    run_id      UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
    session_id  UUID NOT NULL,
    seq         INT NOT NULL,
    event_type  TEXT NOT NULL
                CHECK (event_type IN ('token','tool_start','tool_result','confirm_required',
                                       'state_change','done','error','stopped')),
    data        JSONB NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_run_events_session_id ON run_events (session_id, id);
CREATE INDEX idx_run_events_run_seq     ON run_events (run_id, seq);
```

Key design points:
- `id BIGSERIAL` is globally monotonic; used as the SSE `id:` field so browsers can pass `Last-Event-ID` on reconnect.
- `session_id` is denormalized so SSE replay queries skip the join on the hot path.
- `data JSONB` carries the event payload.

### Existing Table Changes

- `sessions`: add `last_viewed_at TIMESTAMPTZ` (set when user opens the session) and `active_run_id UUID REFERENCES runs(id)`.
- `sessions.status` is kept for legacy reads but no longer written; the truth source is now `runs.state` joined to the active run.

### Lifecycle

| Phase | `runs` | `run_events` | `messages` |
|---|---|---|---|
| User sends message | insert `state=pending` | — | — |
| RunManager picks up | update `state=running` | — | — |
| Run executing | `state=running` | continuous insert | — |
| Run terminal (`done`) | `state=done` | no more writes | aggregate events → `messages` (cleanup row) |
| Run terminal (`error`/`stopped`) | `state=error` or `state=stopped` | preserved (no cleanup) | not aggregated; surfaced via `incomplete_runs` |
| Cleanup (only for `done`) | row kept | `DELETE WHERE run_id=$1 AND state='done'` | already has aggregated row |

## Run State Machine

```
                     ┌──────────────────────────────────┐
                     │                                  │
                     ▼                                  │
   ┌─────────┐  pickup   ┌─────────┐  tool_confirm  ┌──────────────┐
   │ pending │ ────────► │ running │ ─────────────► │waiting_confirm│
   └─────────┘           └────┬────┘               └──────┬───────┘
        ▲                     │                            │
        │ next pending        │ no tool_calls              │ confirm/reject
        │ (auto)              ▼                            │
        │                ┌─────────┐                       │
        │                │  done   │                       │
        │                └─────────┘                       │
        │   ┌─────────────────┼─────────────────┐         │
        │   │                 │                 │         │
        │   ▼                 ▼                 ▼         │
        │ ┌──────┐      ┌────────┐      ┌─────────┐       │
        │ │error │      │stopped │      │ (回到)   │ ◄─────┘
        │ └──────┘      └────────┘      │ running │
        │                               └─────────┘
        │                                  ▲
        └──────────────────────────────────┘
            RunManager picks next pending
```

| From → To | Trigger | Events emitted |
|---|---|---|
| ∅ → pending | `POST /api/agent/chat/stream` | `state_change(pending)` |
| pending → running | RunManager picks up goroutine slot | `state_change(running)` |
| running → waiting_confirm | LLM emitted a tool call and `mode=confirm` | `state_change(waiting_confirm)` + `confirm_required` |
| waiting_confirm → running | `POST /api/agent/chat/confirm` with action | `state_change(running)` |
| running → done | LLM final response with no tool calls | `state_change(done)` |
| running → error | LLM / tool / DB error | `state_change(error)` with reason |
| * → stopped | `POST /api/agent/chat/stop` | `state_change(stopped)` |

### Event Payload Schemas

```typescript
// state_change
{ from: "running", to: "waiting_confirm", error?: string }

// token (delta)
{ content: "我" }

// tool_start
{ tool_calls: [{ id: "tc_0", name: "get_cloud_stats", params: "{}" }] }

// tool_result
{ tool_call_id: "tc_0", name: "get_cloud_stats", result: "...", error: null }

// confirm_required
{ tool_calls: [{ id: "tc_0", name: "stop_instance", params: "{\"id\":\"vm-1\"}" }],
  message: "需要您确认以下操作" }
```

### Run Goroutine (pseudocode)

```go
func (r *Run) execute(ctx context.Context) {
    r.setState(running)
    r.emit(stateChange("running"))

    history := loadSessionHistory(r.sessionID)
    messages := append(history, {user, r.userMessage})

    for iter := 0; iter < maxIter; iter++ {
        if ctx.Err() != nil { return }
        fullText, toolCalls := streamLLM(ctx, messages)
        if ctx.Err() != nil { return }
        messages = append(messages, {assistant, fullText, toolCalls})

        if len(toolCalls) == 0 {
            r.setState(done)
            r.emit(stateChange("done"))
            return
        }

        r.emit(toolStart(toolCalls))

        if anyNeedsConfirm(toolCalls) && r.mode == "confirm" {
            r.setState(waitingConfirm)
            r.confirmPayload = toolCalls
            r.emit(stateChange("waiting_confirm"))
            r.emit(confirmRequired(toolCalls))

            action := <-r.confirmCh
            if action == "reject" {
                messages = append(messages, {tool, "rejected"})
                continue
            }
        }

        for _, tc := range toolCalls {
            if ctx.Err() != nil { return }
            result, err := runtime.ExecuteTool(ctx, tc.name, tc.params)
            r.emit(toolResult(tc.id, tc.name, result, err))
            messages = append(messages, {tool, result})
        }
    }
}
```

### RunManager API

```go
type RunManager struct {
    mu          sync.RWMutex
    runs        map[runID]*Run
    subscribers map[sessionID][]chan Event
}

func (m *RunManager) Start(run *Run)            // pick pending → running, spawn goroutine
func (m *RunManager) Stop(runID)                // ctx.Cancel() → goroutine exits
func (m *RunManager) Confirm(runID, action)     // send to run.confirmCh
func (m *RunManager) Subscribe(sessionIDs, fromID) (chan Event, func())  // SSE handler
func (m *RunManager) OnRunComplete(run)         // state=done: aggregate run_events → messages,
                                                //            DELETE events, pick next pending
                                                // state=error/stopped: keep events, pick next pending
```

## API Surface

### New Endpoints

| Method | Path | Body | Returns |
|---|---|---|---|
| `GET` | `/api/agent/events?session_ids=a,b,c&last_event_id=N` | — | SSE stream |
| `POST` | `/api/agent/chat/confirm` | `{run_id, action: confirm\|reject}` | `{run_id, state}` |
| `POST` | `/api/agent/chat/stop` | `{run_id}` | `{run_id, state}` |

### Modified Endpoints

| Method | Path | Old | New |
|---|---|---|---|
| `POST` | `/api/agent/chat/stream` | SSE response with tokens | `202` + `{run_id, session_id, state}` |
| `GET` | `/api/agent/sessions` | sessions list with `status` | sessions list with derived `state`, `queue_depth`, `has_unread`, `last_finished_at`, `last_viewed_at` |
| `GET` | `/api/agent/sessions/:id` | messages only | `messages` + `active_run_events` + `pending_runs` |

### Deleted Endpoints

| Method | Path | Reason |
|---|---|---|
| `POST` | `/api/agent/chat` | Non-streaming chat (miniprogram-only, no longer used) |
| `POST` | `/api/agent/execute` | Plan execution (miniprogram-only stub, no longer used) |

### SSE Protocol

Request:
```
GET /api/agent/events?session_ids=uuid1,uuid2,uuid3&last_event_id=12345
Authorization: Bearer ...
```

Response (`text/event-stream`):
```
id: 12346
event: token
data: {"content":"我"}

id: 12347
event: token
data: {"content":"来"}

id: 12348
event: tool_start
data: {"tool_calls":[{"id":"tc_0","name":"get_cloud_stats","params":"{}"}]}
```

- `id:` = `run_events.id` (BIGSERIAL). Client passes it back via `Last-Event-ID` (or `?last_event_id=` query param, see Frontend below).
- Server replays `run_events WHERE id > $last_event_id AND session_id = ANY($1) ORDER BY id` first, then keeps the connection open and pushes live events.
- `data` is a JSON-encoded object whose schema depends on `event`.

### Error Responses

| Endpoint | Status | When |
|---|---|---|
| `POST /agent/chat/confirm` | 404 | run_id not found |
| `POST /agent/chat/confirm` | 409 | run state is not `waiting_confirm` |
| `POST /agent/chat/stop` | 404 | run_id not found |
| `POST /agent/chat/stop` | 409 | run already in terminal state |

`POST /agent/chat/stream` does not return errors in v1: a new user message while a run is active always creates a `pending` run in the queue.

### List Query (modified)

```sql
SELECT 
  s.session_id, s.title, s.created_at, s.updated_at,
  COALESCE(r.state, 'idle') as state,
  r.id as active_run_id,
  (SELECT COUNT(*) FROM runs WHERE session_id = s.id AND state = 'pending')::int as queue_depth,
  (SELECT MAX(finished_at) FROM runs WHERE session_id = s.id 
   AND state IN ('done','error','stopped')) as last_finished_at,
  s.last_viewed_at,
  (s.last_viewed_at IS NULL OR s.last_viewed_at < (SELECT MAX(finished_at) FROM runs 
   WHERE session_id = s.id AND state = 'done')) as has_unread
FROM sessions s
LEFT JOIN LATERAL (
  SELECT id, state FROM runs 
  WHERE session_id = s.id AND state IN ('running','waiting_confirm') 
  ORDER BY created_at DESC LIMIT 1
) r ON true
ORDER BY s.updated_at DESC LIMIT 50
```

### Get Session (modified)

Response:
```json
{
  "session_id": "uuid",
  "title": "...",
  "state": "running",
  "active_run_id": "uuid",
  "messages": [...],                // aggregated history rows (state=done runs only)
  "active_run_events": [...],       // events for the current active run, in seq order
  "pending_runs": [                 // queued user messages (state=pending)
    { "run_id": "uuid", "user_message": "...", "created_at": "..." }
  ],
  "incomplete_runs": [              // state=error or state=stopped runs, last 5
    {
      "run_id": "uuid",
      "state": "stopped",
      "user_message": "...",
      "events": [...],              // last 200 events
      "created_at": "...",
      "terminal_at": "...",
      "error_message": "..."
    }
  ]
}
```

Server side: on this endpoint, `UPDATE sessions SET last_viewed_at = NOW() WHERE id = $1` clears the unread marker.

### Session-level `state` Derivation

`state` is computed at read time, not stored. The list and get endpoints apply the same rules:

```
1. If any run.state IN ('running', 'waiting_confirm'):
     return that run's state
2. Else if any run.state = 'pending' (and none is active):
     return 'queued'   // session is waiting to start a run
3. Else if latest terminal run is state='done' AND terminal_at > last_viewed_at:
     return 'done'     // new content waiting to be read
4. Else if latest terminal run is state IN ('error', 'stopped'):
     return that state // still relevant for the user
5. Else:
     return 'idle'     // everything viewed, no active or queued runs
```

Result: a session badge never silently flips back to `idle` after a run finishes — the user always sees the latest terminal status until they open the session.

## Frontend Integration

### Global EventSource

The page maintains a single EventSource that subscribes to all sessions the user is currently aware of (initial: most recent 50 from the list API).

```javascript
let GLOBAL_EVENT_SOURCE = null;
let LAST_EVENT_ID = parseInt(localStorage.getItem('last_event_id') || '0', 10);
let SUBSCRIBED_SESSIONS = new Set();
const EVENT_HANDLERS = {
  token: handleTokenEvent,
  tool_start: handleToolStartEvent,
  tool_result: handleToolResultEvent,
  confirm_required: handleConfirmRequiredEvent,
  state_change: handleStateChangeEvent,
};

function startGlobalEventSource() {
  const ids = Array.from(SUBSCRIBED_SESSIONS).slice(0, 50);
  const params = new URLSearchParams({
    session_ids: ids.join(','),
    last_event_id: String(LAST_EVENT_ID),
  });
  const es = new EventSource(API + '/agent/events?' + params);
  es.onmessage = (e) => {
    LAST_EVENT_ID = parseInt(e.lastEventId, 10);
    localStorage.setItem('last_event_id', String(LAST_EVENT_ID));
    const handler = EVENT_HANDLERS[JSON.parse(e.data).event_type];
    if (handler) handler(JSON.parse(e.data), e.lastEventId);
  };
  es.onerror = () => {
    // Browser auto-reconnects with Last-Event-ID; just log
    console.warn('EventSource disconnected, browser will auto-reconnect');
  };
  GLOBAL_EVENT_SOURCE = es;
}
```

### Session List Badges

```html
<div class="session-item" data-sid="uuid">
  <div class="session-title">查一下资源</div>
  <div class="session-meta">
    <span class="badge badge-running"><span class="spinner"></span> 思考中</span>
    <span class="badge badge-confirm"><span class="dot dot-yellow"></span> 待确认</span>
    <span class="badge badge-done"><span class="dot dot-green"></span> 新回复</span>
    <span class="badge badge-error"><span class="dot dot-red"></span> 错误</span>
    <span class="badge badge-queue"><span class="dot dot-gray"></span> 排队中 (1)</span>
  </div>
</div>
```

`state_change` events update the badge class and text. The "new reply" badge is set when `state_change` to `done` fires, and cleared when the user opens the session (server clears `last_viewed_at`).

### Chat Panel — Active Run Replay

When the user opens a session, the client calls `GET /api/agent/sessions/:id`, which returns:
- `messages` — already-rendered history (completed runs).
- `active_run_events` — events from the current active run, in `seq` order.
- `pending_runs` — queued user messages displayed as "排队中..." placeholders.

The frontend renders `messages` first, then if `active_run_events` is non-empty it replays each event in order through the same handler functions used for live events. This is what gives the user the in-progress AI bubble when they refresh or switch back to a session with an active run.

### Send / Confirm / Stop

```javascript
async function sendChatMessage() {
  const res = await apiFetch(API + '/agent/chat/stream', {
    method: 'POST',
    body: JSON.stringify({ message, session_id: CURRENT_SESSION, mode: CURRENT_MODE }),
  });
  // res = { run_id, session_id, state }
  chatInput.value = '';
  showUserMessage(message);
  showThinkingPlaceholder();
  // Events will arrive via EventSource
}

async function doConfirm(runId, action) {
  await apiFetch(API + '/agent/chat/confirm', {
    method: 'POST',
    body: JSON.stringify({ run_id: runId, action }),
  });
}

async function doStopRun(runId) {
  await apiFetch(API + '/agent/chat/stop', {
    method: 'POST',
    body: JSON.stringify({ run_id: runId }),
  });
}
```

### localStorage State

```javascript
{
  'last_event_id': '12345',                 // global, written on every received event
}
```

On page load, the client reads `last_event_id` and passes it to EventSource as the `?last_event_id=` query parameter (because EventSource cannot set custom request headers; the browser sets `Last-Event-ID` from the most recent SSE event id on auto-reconnect).

## Edge Cases and Error Handling

### Backend Restart

On startup, scan all non-terminal runs and mark them as `error` with reason "Backend restarted":

```go
db.Exec(`UPDATE runs SET state = 'error', error_message = 'Backend restarted',
         finished_at = NOW()
         WHERE state IN ('pending','running','waiting_confirm')`)
```

The user sees an error badge on those sessions and can resubmit. (Resumable runs are out of scope for v1; the LLM call is lost.)

### Concurrency

- Different sessions with active runs: fully independent.
- Same session: at most one `active` run (state `running` or `waiting_confirm`). Additional user messages while a run is active become `pending` runs in the queue.
- Confirm and Stop on the same run: serialized by an internal mutex on the Run; the loser gets HTTP 409.
- Multiple tabs on the same session: each has its own EventSource; server fans out; UI renders are idempotent.

### Confirm / Stop Semantics

- **Confirm** requires the run to be in `waiting_confirm`. Handler sends the action to `run.confirmCh`; the goroutine wakes up and continues.
- **Stop** is a soft cancel: `r.ctx.Cancel()`. The goroutine checks `ctx.Err()` at the next safe point (between LLM iterations, between tool calls) and exits. The run is marked `stopped`. **`run_events` is preserved** (not aggregated into `messages`) so the user can see what the AI had produced so far.

### SSE Client Disconnect

Browser auto-reconnects with `Last-Event-ID`. Server unsubscribes on disconnect (via `defer unsubscribe()`). Missed events are replayed from `run_events` on reconnect.

### Event Persistence Failure

`Run.emit(event)` writes the event to DB inside a transaction before broadcasting. If the DB write fails, the run is marked `error` and stops. The event log is the source of truth; we never broadcast an event we haven't persisted.

### Event Log Size

- A typical run produces 200–2000 events.
- Hard cap: 5000 events per run; if exceeded the run is forced to `stopped` with an error.
- On terminal transition, behavior depends on the terminal state:
  - `state = done`: RunManager aggregates `run_events` into `messages` (re-using the existing `saveSessionMessages` shape, sourced from events), then `DELETE FROM run_events WHERE run_id = $1`. The events table no longer holds this run; the aggregated rows in `messages` are the durable history.
  - `state = error` or `state = stopped`: `run_events` rows are **preserved** (not deleted, not aggregated into `messages`). They are surfaced via the `incomplete_runs` field on the session Get endpoint, capped to the most recent 5 runs and the last 200 events per run. This keeps incomplete content visible without polluting the linear conversation history.
- The aggregation step is idempotent: on retry (e.g., backend crash between aggregation and delete), the `delete` is conditional on `state='done'`, so re-running aggregation won't lose data.

### Resource Limits

| Resource | Limit | Behavior on exceeded |
|---|---|---|
| Active runs per session | 1 | Additional user messages become pending runs |
| Events per run | 5000 | Force `stopped` + error |
| Run total wall time | 10 min | Goroutine timeout ctx → `stopped` |
| Subscribers per session | unbounded | Channel buffer 256; overflow drops the event for that subscriber (it will replay from DB on reconnect) |

### Multi-Tab Consistency

All tabs share the same `run_events` log and SSE stream. Any state change broadcasts to all tabs. Multiple `confirm`/`stop` calls on the same run are serialized by the Run mutex.

## File Deletions

- `miniprogram/` — entire directory (90+ files including pages, components, automation results, screenshots, docs).
- `docs/2026-05-25-多云管理小程序设计文档.md` — miniprogram design doc, no longer relevant.

## Code Deletions (Backend)

- `internal/api/chat.go`:
  - `Chat()` method (non-streaming, ~140 lines)
  - `Execute()` method (~20 lines)
  - Unused `ChatRequest.ConfirmAction / ToolName / ToolParams` fields
  - `c, flusher == nil` non-streaming branch in `collectStreamResponse`
- `internal/api/router.go`:
  - `auth.POST("/agent/chat", chatHandler.Chat)` line
  - `auth.POST("/agent/execute", chatHandler.Execute)` line

## New Code (Backend)

- `internal/api/runs.go` — `RunManager`, `Run`, event types
- `internal/api/events_sse.go` — SSE handler with replay
- `internal/api/chat_async.go` — modified `Stream()` that creates a Run and returns 202; new `Confirm()` and `Stop()` handlers
- `internal/db/db.go` — schema for `runs`, `run_events`, `sessions` columns

## Testing Strategy

### Unit Tests (Go)

- State transitions for all 6 states and 5 transition paths
- `emit` always persists to DB before broadcasting
- All subscribers receive all events
- Unsubscribe stops delivery
- Reconnect replays events with `id > last_event_id`
- Pending runs are picked in FIFO order
- `confirmCh` wakes the goroutine
- `ctx.Done()` from `Stop` exits the goroutine gracefully
- Event aggregation on `done` produces the correct `messages` row
- Event cleanup deletes `run_events` rows only when terminal state is `done` (error/stopped are preserved)
- `incomplete_runs` in Get response returns at most 5 runs and at most 200 events per run
- Backend restart marks non-terminal runs as `error`
- 5000-event cap forces `stopped`
- Backend restart marks non-terminal runs as `error`

Mock LLM via `httptest.Server` returning canned SSE streams.

### Integration Tests

- `POST /agent/chat/stream` returns 202 with `run_id`
- `GET /agent/sessions/:id` returns messages + active events + pending
- `GET /agent/sessions` includes state, queue depth, unread
- SSE event format is correct (`id:` / `event:` / `data:`)
- SSE replay from `last_event_id` returns only newer events
- Confirm returns 409 if not `waiting_confirm`
- Stop returns 409 if terminal
- Multiple subscribers receive the same events

### End-to-End Manual Verification

- Send message → see tokens stream → see tool cards → see done badge
- **Refresh mid-run** → in-progress bubble restored, continues live
- **Switch to another session and back** → still running, no duplicate work
- **Tool confirm flow** → list shows "待确认", confirm buttons appear, click Confirm → continues
- **Stop button** → list shows "已停止", partial events preserved
- **Multi-tab** → both tabs update in sync
- **Close browser 5 min, return** → list shows "新回复", opening shows full conversation
- **Backend restart mid-run** → list shows "错误", user can resubmit

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| DB event log write pressure at high token rate | High INSERT TPS | Single-row insert v1; observe; add batch writes if needed |
| Backend restart loses in-flight work | User has to resubmit | Startup marks non-terminal as `error`; UI guides resubmit |
| Multi-tab concurrent confirm/stop on same run | State race | Internal mutex on Run |
| Event aggregation bug leaves messages inconsistent on `done` | User sees garbled conversation | Write `messages` first, clear events second; clear is conditional on `state='done'` so a retry won't double-delete |
| Browser auto-reconnect + server zombie subscriber | Memory leak | `defer unsubscribe()`; ctx close clears channel |

## Release Plan

Single coordinated release:
1. Backend + frontend + miniprogram deletion packaged in one release
2. DB schema auto-migrates on startup (no downtime; old sessions still load with `state=idle` and existing messages)
3. Run end-to-end manual verification checklist
4. Observe DB event log size and run error rate for one week before optimizing

## Open Questions / Future Work

1. **Multi-instance backend**: would require Redis pub/sub for subscriber fan-out. v1 is single instance.
2. **Conversation compression**: long sessions grow `messages` unbounded. Existing `pruneMessages` is a stopgap.
3. **Run priorities / SLAs**: no priority queue or budget in v1.
4. **Audit / search**: events are persisted but not exposed for search.
5. **Pause / resume within a Run**: v1 only supports stop; pause would require a more complex channel protocol.
6. **Resumable Runs across backend restarts**: would require per-iteration state snapshots; v1 marks in-flight runs as error instead.
