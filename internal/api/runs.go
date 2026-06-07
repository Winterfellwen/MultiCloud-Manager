package api

import (
	"context"
	"database/sql"
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
	ID          string
	SessionID   string
	State       State
	Mode        string
	UserMessage string
	Final       string

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
func NewRun(sessionID, mode, userMessage string) *Run {
	ctx, cancel := context.WithCancel(context.Background())
	_ = ctx // used by goroutine later
	return &Run{
		ID:          newUUID(),
		SessionID:   sessionID,
		State:       StatePending,
		Mode:        mode,
		UserMessage: userMessage,
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
	db      *sql.DB
	queue   chan string // run ids waiting to start
	started bool
}

// NewRunManager constructs an empty manager. db is required; pass nil in tests that don't persist.
func NewRunManager() *RunManager {
	return &RunManager{
		runs:  map[string]*Run{},
		queue: make(chan string, 256),
	}
}

// SetDB attaches a database handle (used to recover runs on restart).
func (m *RunManager) SetDB(db *sql.DB) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.db = db
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
	if !ok || r.State != StateWaitingConfirm {
		return false
	}
	r.SendConfirm(action)
	return true
}

// runLoop is the per-Run goroutine. Implementation in Task 4.
func (m *RunManager) runLoop(r *Run) {
	// Stub: no-op until Task 4 wires the LLM loop.
	defer m.cleanup(r)
	// Yield back to the runtime so the test sees the run reach a terminal state.
	r.mu.Lock()
	r.State = StateDone
	r.mu.Unlock()
}

// cleanup removes the run from the in-memory map and persists terminal state.
func (m *RunManager) cleanup(r *Run) {
	m.mu.Lock()
	delete(m.runs, r.ID)
	m.mu.Unlock()
	if m.db != nil {
		m.db.Exec(`UPDATE runs SET state=$1, terminal_at=CURRENT_TIMESTAMP WHERE id=$2`, string(r.State), r.ID)
	}
}

// newUUID is a thin wrapper to allow tests to inject ids later. Currently
// uses crypto/rand; declared in sessions.go. Re-declared here as a
// forward declaration to keep the file self-contained.
var newUUID = newSessionID
