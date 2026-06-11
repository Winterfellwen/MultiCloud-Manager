package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"
)

// State is the lifecycle state of a Run.
type State string

const (
	StatePending        State = "pending"
	StateRunning        State = "running"
	StateWaitingConfirm State = "waiting_confirm"
	StateDone           State = "done"
	StateError          State = "error"
	StateStopped        State = "stopped"
)

// EventType is the kind of event emitted during a Run.
type EventType string

const (
	EventToken           EventType = "token"
	EventToolStart       EventType = "tool_start"
	EventToolResult      EventType = "tool_result"
	EventConfirmRequired EventType = "confirm_required"
	EventStateChange     EventType = "state_change"
	EventDone            EventType = "done"
	EventError           EventType = "error"
)

// Event is a single entry in a Run's event log.
type Event struct {
	ID        int64                  `json:"id"`
	RunID     string                 `json:"run_id"`
	SessionID string                 `json:"session_id"`
	Seq       int                    `json:"seq"`
	Type      EventType              `json:"event_type"`
	Payload   map[string]interface{} `json:"payload"`
	CreatedAt time.Time              `json:"created_at"`
}

// Run is one in-flight or completed chat execution.
type Run struct {
	ID           string
	SessionID    string // UUID, matches sessions.session_id — used for broadcast (SSE matching)
	InternalID   string // integer string, matches sessions.id — used for DB queries
	State        State
	Mode         string
	UserMessage  string
	UserRole     string
	Final        string
	ErrorMessage string

	mu          sync.Mutex
	seq         int
	confirmCh   chan confirmReply
	cancelFn    context.CancelFunc
	confirmOnce sync.Once
	cancelOnce  sync.Once
}

type confirmReply struct {
	Action string
	OK     bool
}

// NewRun constructs a Run in the pending state.
func NewRun(sessionID, mode, userMessage, userRole string) *Run {
	ctx, cancel := context.WithCancel(context.Background())
	_ = ctx // used by goroutine later
	return &Run{
		ID:          newUUID(),
		SessionID:   sessionID,
		State:       StatePending,
		Mode:        mode,
		UserMessage: userMessage,
		UserRole:    userRole,
		confirmCh:   make(chan confirmReply, 1),
		cancelFn:    cancel,
	}
}

// SendConfirm delivers the user's confirmation decision. Safe to call once.
func (r *Run) SendConfirm(action string) bool {
	r.confirmOnce.Do(func() {
		r.confirmCh <- confirmReply{Action: action, OK: true}
	})
	return true
}

// Cancel stops the Run's goroutine. Safe to call once.
func (r *Run) Cancel() {
	r.cancelOnce.Do(func() {
		r.cancelFn()
	})
}

// RunManager owns the in-memory map of active runs.
type RunManager struct {
	mu      sync.RWMutex
	runs    map[string]*Run
	subs    map[string][]chan Event
	subMu   sync.RWMutex
	db      *sql.DB
	queue   chan string // run ids waiting to start
	started bool
	execFn  func(*Run)
}

// NewRunManager constructs an empty manager. db is required; pass nil in tests that don't persist.
func NewRunManager() *RunManager {
	return &RunManager{
		runs:  map[string]*Run{},
		subs:  map[string][]chan Event{},
		queue: make(chan string, 256),
	}
}

// SetDB attaches a database handle (used to recover runs on restart).
func (m *RunManager) SetDB(db *sql.DB) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.db = db
}

// SetExecutor registers the LLM execution function that runLoop will invoke.
func (m *RunManager) SetExecutor(fn func(*Run)) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.execFn = fn
}

// Start registers a run and starts its goroutine.
func (m *RunManager) Start(r *Run) error {
	m.mu.Lock()
	m.runs[r.ID] = r
	m.mu.Unlock()
	go m.runLoop(r)
	return nil
}

// Get returns the run by id, or false if not present.
func (m *RunManager) Get(id string) (*Run, bool) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	r, ok := m.runs[id]
	return r, ok
}

// HasActiveRun returns true if the run is registered (in any state).
func (m *RunManager) HasActiveRun(id string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()
	_, ok := m.runs[id]
	return ok
}

// Stop signals the run to stop. Idempotent.
func (m *RunManager) Stop(id string) {
	m.mu.RLock()
	r, ok := m.runs[id]
	m.mu.RUnlock()
	if !ok {
		return
	}
	r.Cancel()
}

// Confirm signals the run's pending confirmation. Returns false if run is not waiting.
func (m *RunManager) Confirm(id, action string) bool {
	m.mu.RLock()
	r, ok := m.runs[id]
	m.mu.RUnlock()
	if !ok {
		return false
	}
	r.mu.Lock()
	state := r.State
	r.mu.Unlock()
	if state != StateWaitingConfirm {
		return false
	}
	r.SendConfirm(action)
	return true
}

// runLoop is the per-Run goroutine. Delegates to execFn if set, otherwise
// immediately marks the run as done (stub behavior for tests).
func (m *RunManager) runLoop(r *Run) {
	defer m.cleanup(r)
	defer func() {
		if rec := recover(); rec != nil {
			log.Printf("runLoop PANIC run=%s: %v", r.ID, rec)
			r.mu.Lock()
			r.State = StateError
			r.ErrorMessage = fmt.Sprintf("panic: %v", rec)
			r.mu.Unlock()
		}
	}()
	m.mu.RLock()
	fn := m.execFn
	m.mu.RUnlock()
	if fn != nil {
		fn(r)
		return
	}
	r.mu.Lock()
	r.State = StateDone
	r.mu.Unlock()
	// Persist a synthetic state_change event so subscribers see the transition.
	if m.db != nil {
		var id int64
		m.db.QueryRow(
			`INSERT INTO run_events (run_id, session_id, seq, event_type, payload)
			 VALUES ($1, $2, 1, 'state_change', $3) RETURNING id`,
			r.ID, r.SessionID, mustJSON(map[string]interface{}{"state": string(StateDone)})).Scan(&id)
	}
	m.broadcast(Event{
		ID:        0,
		RunID:     r.ID,
		SessionID: r.SessionID,
		Seq:       1,
		Type:      EventStateChange,
		Payload:   map[string]interface{}{"state": string(StateDone)},
		CreatedAt: time.Now(),
	})
}

// cleanup removes the run from the in-memory map and persists terminal state.
func (m *RunManager) cleanup(r *Run) {
	m.mu.Lock()
	delete(m.runs, r.ID)
	m.mu.Unlock()
	if m.db != nil {
		if _, err := m.db.Exec(`UPDATE runs SET state=$1, terminal_at=CURRENT_TIMESTAMP WHERE id=$2`, string(r.State), r.ID); err != nil {
			log.Printf("WARNING: failed to persist terminal state for run %s: %v", r.ID, err)
		}
	}
}

// newUUID is a thin wrapper to allow tests to inject ids later. Currently
// uses crypto/rand; declared in sessions.go. Re-declared here as a
// forward declaration to keep the file self-contained.
var newUUID = newSessionID

// Subscribe returns a buffered channel of events for the given sessions,
// plus an unsubscribe function. fromID > 0 causes the channel to first
// replay events with id > fromID (read from the DB).
func (m *RunManager) Subscribe(sessionIDs []string, fromID int64) (<-chan Event, func()) {
	ch := make(chan Event, 256)
	for _, sid := range sessionIDs {
		m.subMu.Lock()
		if len(m.subs[sid]) >= 100 {
			m.subMu.Unlock()
			close(ch)
			return ch, func() {}
		}
		m.subs[sid] = append(m.subs[sid], ch)
		m.subMu.Unlock()
	}
	go m.replayEvents(ch, sessionIDs, fromID)
	return ch, func() {
		m.subMu.Lock()
		for _, sid := range sessionIDs {
			subs := m.subs[sid]
			for i, c := range subs {
				if c == ch {
					m.subs[sid] = append(subs[:i], subs[i+1:]...)
					break
				}
			}
		}
		m.subMu.Unlock()
	}
}

// replayEvents fetches events with id > fromID from the DB and sends them to ch.
// It does not block on ch; if the buffer is full it drops (the live stream continues).
func (m *RunManager) replayEvents(ch chan<- Event, sessionIDs []string, fromID int64) {
	if m.db == nil {
		return
	}
	const maxReplay = 500
	rows, err := m.db.Query(
		`SELECT id, run_id, session_id, seq, event_type, payload, created_at FROM (
		   SELECT id, run_id, session_id, seq, event_type, payload, created_at
		   FROM run_events WHERE id > $1 AND session_id = ANY($2)
		   ORDER BY id DESC LIMIT $3
		 ) sub ORDER BY id`,
		fromID, sessionIDs, maxReplay)
	if err != nil {
		return
	}
	defer rows.Close()
	for rows.Next() {
		var ev Event
		var payload []byte
		if err := rows.Scan(&ev.ID, &ev.RunID, &ev.SessionID, &ev.Seq, &ev.Type, &payload, &ev.CreatedAt); err != nil {
			continue
		}
		if ev.Type == EventToken {
			continue
		}
		_ = jsonUnmarshal(payload, &ev.Payload)
		select {
		case ch <- ev:
		default:
			// drop on full buffer
		}
	}
}

// broadcast sends ev to all subscribers of its session.
func (m *RunManager) broadcast(ev Event) {
	m.subMu.RLock()
	subs := append([]chan Event(nil), m.subs[ev.SessionID]...)
	m.subMu.RUnlock()
	for _, c := range subs {
		select {
		case c <- ev:
		default:
		}
	}
}

// persistEvent stores an event in the DB (if available), assigns a sequence
// number, broadcasts to subscribers, and returns the DB row id.
func (m *RunManager) persistEvent(r *Run, t EventType, payload map[string]interface{}) int64 {
	r.mu.Lock()
	r.seq++
	seq := r.seq
	r.mu.Unlock()
	ev := Event{
		RunID:     r.ID,
		SessionID: r.SessionID,
		Seq:       seq,
		Type:      t,
		Payload:   payload,
		CreatedAt: time.Now(),
	}
	if m.db != nil {
		var id int64
		dbSessionID := r.SessionID
		err := m.db.QueryRow(
			`INSERT INTO run_events (run_id, session_id, seq, event_type, payload)
			 VALUES ($1, $2, $3, $4, $5) RETURNING id`,
			r.ID, dbSessionID, seq, string(t), mustJSON(payload)).Scan(&id)
		if err != nil {
			log.Printf("persistEvent INSERT error run=%s type=%s: %v", r.ID, t, err)
		} else {
			ev.ID = id
		}
	}
	m.broadcast(ev)
	return ev.ID
}

// AggregateOnDone replays a completed run's events and writes the conversation
// history to the sessions table, then cleans up run_events.
func (m *RunManager) AggregateOnDone(r *Run) {
	if m.db == nil {
		return
	}
	rows, err := m.db.Query(
		`SELECT seq, event_type, payload FROM run_events WHERE run_id=$1 ORDER BY seq`, r.ID)
	if err != nil {
		return
	}
	defer rows.Close()

	var msgs []map[string]interface{}
	toolResults := map[string]string{}
	for rows.Next() {
		var seq int
		var etype string
		var payload []byte
		if err := rows.Scan(&seq, &etype, &payload); err != nil {
			continue
		}
		var p map[string]interface{}
		_ = jsonUnmarshal(payload, &p)
		switch EventType(etype) {
		case EventToken:
			if c, ok := p["content"].(string); ok && c != "" {
				if len(msgs) > 0 && msgs[len(msgs)-1]["role"] == "agent" {
					prev := msgs[len(msgs)-1]
					prev["content"] = prev["content"].(string) + c
				} else {
					msgs = append(msgs, map[string]interface{}{"role": "agent", "content": c})
				}
			}
		case EventToolStart:
			if tcs, ok := p["tool_calls"].([]interface{}); ok {
				var callInfos []map[string]interface{}
				for _, item := range tcs {
					if tc, ok := item.(map[string]interface{}); ok {
						fn, _ := tc["function"].(map[string]interface{})
						name, _ := fn["name"].(string)
						args, _ := fn["arguments"].(string)
						callInfos = append(callInfos, map[string]interface{}{
							"name": name, "params": args,
						})
					}
				}
				if len(callInfos) > 0 {
					b, _ := json.Marshal(callInfos)
					msgs = append(msgs, map[string]interface{}{"role": "tool-calls-stub", "content": string(b)})
				}
			}
		case EventToolResult:
			if name, ok := p["tool_name"].(string); ok {
				result, _ := p["result"].(string)
				toolResults[name] = result
			}
		}
	}

	var final []map[string]interface{}
	userMsgAdded := false
	now := time.Now().UTC().Format(time.RFC3339)
	for _, m := range msgs {
		if m["role"] == "tool-calls-stub" {
			var stubInfos []map[string]interface{}
			_ = jsonUnmarshal([]byte(m["content"].(string)), &stubInfos)
			var real []map[string]interface{}
			for _, ci := range stubInfos {
				name, _ := ci["name"].(string)
				params, _ := ci["params"].(string)
				real = append(real, map[string]interface{}{
					"name": name, "params": params, "result": toolResults[name],
				})
			}
			b, _ := json.Marshal(real)
			if !userMsgAdded {
				final = append(final, map[string]interface{}{"role": "user", "content": r.UserMessage, "created_at": now})
				userMsgAdded = true
			}
			final = append(final, map[string]interface{}{"role": "tool-calls", "content": string(b), "created_at": now})
			continue
		}
		if !userMsgAdded {
			final = append(final, map[string]interface{}{"role": "user", "content": r.UserMessage, "created_at": now})
			userMsgAdded = true
		}
		m["created_at"] = now
		final = append(final, m)
	}
	if len(final) == 0 {
		final = []map[string]interface{}{{"role": "user", "content": r.UserMessage}}
	}
	var sessionInternalID string
	if err := m.db.QueryRow(`SELECT id FROM sessions WHERE session_id=$1`, r.SessionID).Scan(&sessionInternalID); err != nil {
		m.db.QueryRow(`SELECT id FROM sessions WHERE id::text=$1`, r.SessionID).Scan(&sessionInternalID)
	}
	if sessionInternalID == "" {
		return
	}
	if _, err := m.db.Exec(`UPDATE sessions SET title = LEFT($1, 100), updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND title = '新对话'`, r.UserMessage, sessionInternalID); err != nil {
		log.Printf("WARNING: failed to update session title for run %s: %v", r.ID, err)
	}

	// Load existing history and append new messages from this run
	var existingHistory []map[string]interface{}
	var historyJSON string
	err = m.db.QueryRow(`SELECT content FROM messages WHERE session_id = $1 AND role = 'history' ORDER BY created_at DESC LIMIT 1`, sessionInternalID).Scan(&historyJSON)
	if err == nil && historyJSON != "" {
		_ = json.Unmarshal([]byte(historyJSON), &existingHistory)
	}
	combined := append(existingHistory, final...)
	combinedJSON, _ := json.Marshal(combined)
	if _, err := m.db.Exec(`DELETE FROM messages WHERE session_id = $1`, sessionInternalID); err != nil {
		log.Printf("WARNING: failed to delete old messages for session %s: %v", sessionInternalID, err)
	}
	if _, err := m.db.Exec(`INSERT INTO messages (session_id, role, content) VALUES ($1, 'history', $2)`, sessionInternalID, string(combinedJSON)); err != nil {
		log.Printf("WARNING: failed to insert history for session %s: %v", sessionInternalID, err)
	}
	if _, err := m.db.Exec(`DELETE FROM run_events WHERE run_id = $1 AND EXISTS (SELECT 1 FROM runs WHERE id = $1 AND state = 'done')`, r.ID); err != nil {
		log.Printf("WARNING: failed to cleanup events for run %s: %v", r.ID, err)
	}
}

// RecoverFromRestart marks any runs that were in-progress when the backend
// restarted as errors, so they don't remain in a zombie state.
func (m *RunManager) RecoverFromRestart() {
	if m.db == nil {
		return
	}
	_, err := m.db.Exec(
		`UPDATE runs SET state='error', error_message='Backend restarted',
		 terminal_at=CURRENT_TIMESTAMP
		 WHERE state IN ('pending','running','waiting_confirm')`)
	if err != nil {
		log.Printf("RecoverFromRestart: %v", err)
	}
}

func jsonUnmarshal(data []byte, v interface{}) error {
	return json.Unmarshal(data, v)
}

func mustJSON(v interface{}) []byte {
	b, _ := json.Marshal(v)
	return b
}
