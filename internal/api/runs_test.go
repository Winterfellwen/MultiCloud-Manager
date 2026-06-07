package api

import (
	"testing"
	"time"
)

func TestNewRun_HasPendingState(t *testing.T) {
	r := NewRun("session-1", "plan", "hello")
	if r.State != StatePending {
		t.Fatalf("expected state=pending, got %s", r.State)
	}
	if r.UserMessage != "hello" {
		t.Errorf("expected user message to be preserved, got %q", r.UserMessage)
	}
	if r.SessionID != "session-1" {
		t.Errorf("expected session id to be preserved, got %q", r.SessionID)
	}
	if r.confirmCh == nil {
		t.Error("expected confirmCh to be initialized")
	}
	if r.cancelFn == nil {
		t.Error("expected cancelFn to be initialized")
	}
}

func TestEventTypes_AreDistinct(t *testing.T) {
	// All event type constants must exist and be distinct.
	types := []EventType{
		EventToken, EventToolStart, EventToolResult,
		EventConfirmRequired, EventStateChange, EventDone, EventError,
	}
	seen := map[EventType]bool{}
	for _, et := range types {
		if seen[et] {
			t.Fatalf("duplicate event type: %s", et)
		}
		seen[et] = true
	}
}

func TestRunManager_StartAndGet(t *testing.T) {
	m := NewRunManager()
	r := NewRun("s1", "plan", "hi")
	if err := m.Start(r); err != nil {
		t.Fatalf("Start: %v", err)
	}
	got, ok := m.Get(r.ID)
	if !ok {
		t.Fatal("expected to retrieve just-started run")
	}
	if got.ID != r.ID {
		t.Errorf("expected id=%s, got %s", r.ID, got.ID)
	}
	// Wait for goroutine to terminate (no work was scheduled so it exits).
	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if !m.HasActiveRun(r.ID) {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
}
