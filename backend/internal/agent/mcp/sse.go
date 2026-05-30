package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"sync/atomic"
)

type SSETransport struct {
	endpoint string
	headers  map[string]string
	client   *http.Client

	mu      sync.Mutex
	nextID  int64
	pending map[interface{}]chan *JSONRPCResponse
	done    chan struct{}
	closed  bool
	session string
}

func NewSSETransport(endpoint string, headers map[string]string) *SSETransport {
	return &SSETransport{
		endpoint: endpoint,
		headers:  headers,
		client:   &http.Client{},
		pending:  make(map[interface{}]chan *JSONRPCResponse),
		done:     make(chan struct{}),
	}
}

func (t *SSETransport) Start(ctx context.Context) error {
	parsedURL, err := url.Parse(t.endpoint)
	if err != nil {
		return fmt.Errorf("parse endpoint: %w", err)
	}
	sseURL := *parsedURL
	sseURL.Path = strings.TrimSuffix(sseURL.Path, "/") + "/sse"

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, sseURL.String(), nil)
	if err != nil {
		return fmt.Errorf("create SSE request: %w", err)
	}
	for k, v := range t.headers {
		req.Header.Set(k, v)
	}

	resp, err := t.client.Do(req)
	if err != nil {
		return fmt.Errorf("connect SSE: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		resp.Body.Close()
		return fmt.Errorf("SSE connect returned status %d", resp.StatusCode)
	}

	go t.readSSE(resp.Body)
	return nil
}

func (t *SSETransport) readSSE(body io.ReadCloser) {
	defer close(t.done)
	defer body.Close()

	scanner := bufio.NewScanner(body)
	var eventType string
	var data strings.Builder

	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			// Dispatch event
			if data.Len() > 0 {
				t.handleSSEEvent(eventType, data.String())
			}
			eventType = ""
			data.Reset()
			continue
		}
		if strings.HasPrefix(line, "event:") {
			eventType = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		} else if strings.HasPrefix(line, "data:") {
			if data.Len() > 0 {
				data.WriteString("\n")
			}
			data.WriteString(strings.TrimSpace(strings.TrimPrefix(line, "data:")))
		}
	}
}

func (t *SSETransport) handleSSEEvent(eventType, data string) {
	if eventType == "endpoint" {
		t.mu.Lock()
		t.session = strings.TrimSpace(data)
		t.mu.Unlock()
		return
	}

	if eventType == "message" || eventType == "" {
		var resp JSONRPCResponse
		if err := json.Unmarshal([]byte(data), &resp); err != nil {
			return
		}
		t.mu.Lock()
		if ch, ok := t.pending[resp.ID]; ok {
			delete(t.pending, resp.ID)
			t.mu.Unlock()
			ch <- &resp
		} else {
			t.mu.Unlock()
		}
	}
}

func (t *SSETransport) SendRequest(ctx context.Context, method string, params interface{}) (*JSONRPCResponse, error) {
	id := atomic.AddInt64(&t.nextID, 1)
	req := JSONRPCRequest{
		JSONRPC: "2.0",
		ID:      id,
		Method:  method,
		Params:  params,
	}

	data, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	t.mu.Lock()
	postURL := t.endpoint
	session := t.session
	t.mu.Unlock()

	if session != "" {
		parsedURL, err := url.Parse(postURL)
		if err != nil {
			return nil, fmt.Errorf("parse endpoint: %w", err)
		}
		q := parsedURL.Query()
		q.Set("session_id", session)
		parsedURL.RawQuery = q.Encode()
		postURL = parsedURL.String()
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, postURL, strings.NewReader(string(data)))
	if err != nil {
		return nil, fmt.Errorf("create POST request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	for k, v := range t.headers {
		httpReq.Header.Set(k, v)
	}

	ch := make(chan *JSONRPCResponse, 1)
	t.mu.Lock()
	if t.closed {
		t.mu.Unlock()
		return nil, fmt.Errorf("transport closed")
	}
	t.pending[id] = ch
	t.mu.Unlock()

	resp, err := t.client.Do(httpReq)
	if err != nil {
		t.mu.Lock()
		delete(t.pending, id)
		t.mu.Unlock()
		return nil, fmt.Errorf("send POST request: %w", err)
	}
	resp.Body.Close()

	select {
	case <-ctx.Done():
		t.mu.Lock()
		delete(t.pending, id)
		t.mu.Unlock()
		return nil, ctx.Err()
	case r := <-ch:
		if r.Error != nil {
			return r, fmt.Errorf("JSON-RPC error %d: %s", r.Error.Code, r.Error.Message)
		}
		return r, nil
	}
}

func (t *SSETransport) Close() error {
	t.mu.Lock()
	if t.closed {
		t.mu.Unlock()
		return nil
	}
	t.closed = true
	t.mu.Unlock()
	<-t.done
	return nil
}
