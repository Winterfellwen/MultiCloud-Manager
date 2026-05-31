package api

import (
	"encoding/json"
	"io"
	"strings"
	"testing"
)

func TestCollectStreamResponse_ValidToolCall(t *testing.T) {
	// Simulate a valid streaming response with a complete tool call
	sseData := `data: {"choices":[{"delta":{"role":"assistant"},"index":0}]}
data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_123","type":"function","function":{"name":"list_cloud_resources","arguments":"{\"cloud_type\":"}}]},"index":0}]}
data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"\"azure\"}"}}]},"index":0}]}
data: {"choices":[{"delta":{"content":"I found some resources."},"index":0}]}
data: {"choices":[{"finish_reason":"stop","index":0}]}
data: [DONE]
`

	h := &ChatStreamHandler{}
	body := io.NopCloser(strings.NewReader(sseData))

	content, toolCalls, finishReason := h.collectStreamResponse(body, nil, nil)

	t.Logf("Content: %s", content)
	t.Logf("Tool calls: %+v", toolCalls)
	t.Logf("Finish reason: %s", finishReason)

	if len(toolCalls) == 0 {
		t.Fatal("Expected at least one tool call")
	}

	tc := toolCalls[0]
	fn, ok := tc["function"].(map[string]interface{})
	if !ok {
		t.Fatal("Expected function to be a map")
	}

	argsStr, ok := fn["arguments"].(string)
	if !ok {
		t.Fatal("Expected arguments to be a string")
	}

	// Verify the accumulated arguments are valid JSON
	var argsMap map[string]interface{}
	if err := json.Unmarshal([]byte(argsStr), &argsMap); err != nil {
		t.Fatalf("Arguments are not valid JSON: %v\nArguments: %s", err, argsStr)
	}

	if argsMap["cloud_type"] != "azure" {
		t.Errorf("Expected cloud_type=azure, got %v", argsMap["cloud_type"])
	}
}

func TestCollectStreamResponse_InvalidToolCall(t *testing.T) {
	// Simulate a streaming response where arguments are truncated (incomplete JSON)
	sseData := `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_456","type":"function","function":{"name":"list_cloud_resources","arguments":"{\"cloud_type\":"}}]},"index":0}]}
data: [DONE]
`

	h := &ChatStreamHandler{}
	body := io.NopCloser(strings.NewReader(sseData))

	content, toolCalls, _ := h.collectStreamResponse(body, nil, nil)

	t.Logf("Content: %s", content)
	t.Logf("Tool calls: %+v", toolCalls)

	// With incomplete JSON, the arguments field should be removed
	if len(toolCalls) == 0 {
		t.Fatal("Expected at least one tool call")
	}

	tc := toolCalls[0]
	fn, ok := tc["function"].(map[string]interface{})
	if !ok {
		t.Fatal("Expected function to be a map")
	}

	// If arguments are present, they must be valid JSON
	if argsStr, ok := fn["arguments"].(string); ok {
		var argsMap map[string]interface{}
		if err := json.Unmarshal([]byte(argsStr), &argsMap); err != nil {
			t.Fatalf("Arguments are present but not valid JSON: %v\nArguments: %s", err, argsStr)
		}
		t.Logf("Arguments (valid): %s", argsStr)
	} else {
		t.Fatal("Arguments should always be present (replaced with {} if invalid)")
	}
}

func TestCollectStreamResponse_NilArguments(t *testing.T) {
	// Simulate a streaming response where function has no arguments at all
	sseData := `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_789","type":"function","function":{"name":"get_cloud_stats"}}]},"index":0}]}
data: {"choices":[{"finish_reason":"stop","index":0}]}
data: [DONE]
`

	h := &ChatStreamHandler{}
	body := io.NopCloser(strings.NewReader(sseData))

	_, toolCalls, _ := h.collectStreamResponse(body, nil, nil)

	if len(toolCalls) == 0 {
		t.Fatal("Expected at least one tool call")
	}

	tc := toolCalls[0]
	fn, ok := tc["function"].(map[string]interface{})
	if !ok {
		t.Fatal("Expected function to be a map")
	}

	// Verify function is valid
	if fn["name"] != "get_cloud_stats" {
		t.Errorf("Expected name=get_cloud_stats, got %v", fn["name"])
	}

	// Verify arguments defaults to {}
	if fn["arguments"] != "{}" {
		t.Errorf("Expected arguments={}, got %v", fn["arguments"])
	}

	// Verify the whole tool call can be marshaled to valid JSON
	t.Logf("Tool call: %+v", tc)
}

func TestCollectStreamResponse_NilFunction(t *testing.T) {
	// Simulate a streaming response where function is nil (should be skipped)
	sseData := `data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_999","type":"function"}]},"index":0}]}
data: {"choices":[{"finish_reason":"stop","index":0}]}
data: [DONE]
`

	h := &ChatStreamHandler{}
	body := io.NopCloser(strings.NewReader(sseData))

	_, toolCalls, _ := h.collectStreamResponse(body, nil, nil)

	// Tool call with nil function should be skipped
	if len(toolCalls) != 0 {
		t.Errorf("Expected 0 tool calls (nil function skipped), got %d", len(toolCalls))
	}
}
