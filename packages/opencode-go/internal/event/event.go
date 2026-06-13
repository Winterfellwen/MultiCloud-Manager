package event

import (
	"encoding/json"
	"fmt"
	"log"
	"sync"
	"time"
)

type EventType string

const (
	EventServerConnected   EventType = "server.connected"
	EventServerHeartbeat   EventType = "server.heartbeat"
	EventSessionUpdated    EventType = "session.updated"
	EventMessageUpdated    EventType = "message.updated"
	EventPartUpdated       EventType = "part.updated"
	EventPartDelta         EventType = "part.delta"
	EventTextDelta         EventType = "session.next.text.delta"
	EventTextStarted       EventType = "session.next.text.started"
	EventTextEnded         EventType = "session.next.text.ended"
	EventToolCalled        EventType = "session.next.tool.called"
	EventToolSuccess       EventType = "session.next.tool.success"
	EventToolFailed        EventType = "session.next.tool.failed"
	EventStepStarted       EventType = "session.next.step.started"
	EventStepEnded         EventType = "session.next.step.ended"
	EventPrompted          EventType = "session.next.prompted"
)

type Event struct {
	ID       string          `json:"id,omitempty"`
	Type     EventType       `json:"type"`
	Location *Location       `json:"location,omitempty"`
	Data     json.RawMessage `json:"data,omitempty"`
}

type Location struct {
	Directory   string `json:"directory"`
	WorkspaceID string `json:"workspaceID,omitempty"`
}

type Listener struct {
	ID          string
	Directory   string
	WorkspaceID string
	Ch          chan Event
	Done        chan struct{}
}

type Bus struct {
	mu        sync.RWMutex
	listeners map[string]*Listener
	counter   int
}

func NewBus() *Bus {
	return &Bus{
		listeners: make(map[string]*Listener),
	}
}

func (b *Bus) Subscribe(directory, workspaceID string) *Listener {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.counter++
	l := &Listener{
		ID:          generateID(),
		Directory:   directory,
		WorkspaceID: workspaceID,
		Ch:          make(chan Event, 100),
		Done:        make(chan struct{}),
	}
	b.listeners[l.ID] = l
	return l
}

func (b *Bus) Unsubscribe(id string) {
	b.mu.Lock()
	defer b.mu.Unlock()

	if l, ok := b.listeners[id]; ok {
		close(l.Done)
		delete(b.listeners, id)
	}
}

func (b *Bus) Publish(evt Event) {
	b.mu.RLock()
	defer b.mu.RUnlock()

	for _, l := range b.listeners {
		if l.Directory != "" && (evt.Location == nil || l.Directory != evt.Location.Directory) {
			continue
		}
		if l.WorkspaceID != "" && (evt.Location == nil || l.WorkspaceID != evt.Location.WorkspaceID) {
			continue
		}

		select {
		case l.Ch <- evt:
		default:
			log.Printf("listener %s buffer full, dropping event", l.ID)
		}
	}
}

func (b *Bus) StartHeartbeat() {
	go func() {
		ticker := time.NewTicker(10 * time.Second)
		defer ticker.Stop()

		for range ticker.C {
			b.Publish(Event{
				ID:   generateID(),
				Type: EventServerHeartbeat,
				Data: json.RawMessage(`{}`),
			})
		}
	}()
}

func generateID() string {
	return fmt.Sprintf("%d", time.Now().UnixNano())
}
