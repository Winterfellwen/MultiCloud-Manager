package mcp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"sync"
	"sync/atomic"
)

type StdioTransport struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout io.ReadCloser
	stderr io.ReadCloser

	mu      sync.Mutex
	nextID  int64
	pending map[interface{}]chan *JSONRPCResponse
	done    chan struct{}
	closed  bool
}

func NewStdioTransport(command string, args []string, env map[string]string) *StdioTransport {
	cmd := exec.Command(command, args...)
	for k, v := range env {
		cmd.Env = append(cmd.Env, k+"="+v)
	}
	return &StdioTransport{
		cmd:     cmd,
		pending: make(map[interface{}]chan *JSONRPCResponse),
		done:    make(chan struct{}),
	}
}

func (t *StdioTransport) Start(ctx context.Context) error {
	var err error
	t.stdin, err = t.cmd.StdinPipe()
	if err != nil {
		return fmt.Errorf("stdin pipe: %w", err)
	}
	t.stdout, err = t.cmd.StdoutPipe()
	if err != nil {
		return fmt.Errorf("stdout pipe: %w", err)
	}
	t.stderr, err = t.cmd.StderrPipe()
	if err != nil {
		return fmt.Errorf("stderr pipe: %w", err)
	}

	if err := t.cmd.Start(); err != nil {
		return fmt.Errorf("start process: %w", err)
	}

	go t.readLoop()
	return nil
}

func (t *StdioTransport) readLoop() {
	defer close(t.done)
	scanner := bufio.NewScanner(t.stdout)
	for scanner.Scan() {
		line := scanner.Bytes()
		var resp JSONRPCResponse
		if err := json.Unmarshal(line, &resp); err != nil {
			continue
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

func (t *StdioTransport) SendRequest(ctx context.Context, method string, params interface{}) (*JSONRPCResponse, error) {
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
	data = append(data, '\n')

	ch := make(chan *JSONRPCResponse, 1)
	t.mu.Lock()
	if t.closed {
		t.mu.Unlock()
		return nil, fmt.Errorf("transport closed")
	}
	t.pending[id] = ch
	t.mu.Unlock()

	if _, err := t.stdin.Write(data); err != nil {
		t.mu.Lock()
		delete(t.pending, id)
		t.mu.Unlock()
		return nil, fmt.Errorf("write request: %w", err)
	}

	select {
	case <-ctx.Done():
		t.mu.Lock()
		delete(t.pending, id)
		t.mu.Unlock()
		return nil, ctx.Err()
	case resp := <-ch:
		if resp.Error != nil {
			return resp, fmt.Errorf("JSON-RPC error %d: %s", resp.Error.Code, resp.Error.Message)
		}
		return resp, nil
	}
}

func (t *StdioTransport) Close() error {
	t.mu.Lock()
	if t.closed {
		t.mu.Unlock()
		return nil
	}
	t.closed = true
	t.mu.Unlock()

	if t.stdin != nil {
		t.stdin.Close()
	}
	if t.stdout != nil {
		t.stdout.Close()
	}
	if t.stderr != nil {
		t.stderr.Close()
	}
	<-t.done
	return t.cmd.Process.Kill()
}
