package provider

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
)

type Provider interface {
	ID() string
	Name() string
	Stream(req *LLMRequest) (*LLMStream, error)
}

type LLMRequest struct {
	Messages    []Message    `json:"messages"`
	Model       string       `json:"model"`
	Tools       []ToolDef    `json:"tools,omitempty"`
	MaxTokens   int          `json:"max_tokens,omitempty"`
	Temperature *float64     `json:"temperature,omitempty"`
	System      string       `json:"system,omitempty"`
}

type Message struct {
	Role    string      `json:"role"`
	Content interface{} `json:"content"`
}

type ToolDef struct {
	Name        string      `json:"name"`
	Description string      `json:"description"`
	Parameters  interface{} `json:"parameters"`
}

type LLMStream struct {
	Events chan LLMEvent
	Done   chan struct{}
	Err    error
}

type LLMEvent struct {
	Type       string      `json:"type"`
	Text       string      `json:"text,omitempty"`
	ToolName   string      `json:"toolName,omitempty"`
	ToolID     string      `json:"toolID,omitempty"`
	ToolInput  interface{} `json:"toolInput,omitempty"`
	Error      string      `json:"error,omitempty"`
	Usage      *Usage      `json:"usage,omitempty"`
	FinishReason string   `json:"finishReason,omitempty"`
}

type Usage struct {
	InputTokens  int `json:"inputTokens"`
	OutputTokens int `json:"outputTokens"`
}

// Anthropic Provider
type AnthropicProvider struct {
	apiKey string
	client *http.Client
}

func NewAnthropicProvider() *AnthropicProvider {
	apiKey := os.Getenv("ANTHROPIC_API_KEY")
	return &AnthropicProvider{
		apiKey: apiKey,
		client: &http.Client{},
	}
}

func (p *AnthropicProvider) ID() string   { return "anthropic" }
func (p *AnthropicProvider) Name() string { return "Anthropic" }

func (p *AnthropicProvider) Stream(req *LLMRequest) (*LLMStream, error) {
	if p.apiKey == "" {
		return nil, fmt.Errorf("ANTHROPIC_API_KEY not set")
	}

	messages := make([]map[string]interface{}, 0)
	for _, m := range req.Messages {
		messages = append(messages, map[string]interface{}{
			"role":    m.Role,
			"content": m.Content,
		})
	}

	body := map[string]interface{}{
		"model":      req.Model,
		"messages":   messages,
		"max_tokens": req.MaxTokens,
		"stream":     true,
	}

	if req.System != "" {
		body["system"] = req.System
	}
	if req.Temperature != nil {
		body["temperature"] = *req.Temperature
	}

	if len(req.Tools) > 0 {
		tools := make([]map[string]interface{}, 0)
		for _, t := range req.Tools {
			tools = append(tools, map[string]interface{}{
				"name":        t.Name,
				"description": t.Description,
				"input_schema": t.Parameters,
			})
		}
		body["tools"] = tools
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequest("POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", p.apiKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("anthropic API error %d: %s", resp.StatusCode, string(body))
	}

	stream := &LLMStream{
		Events: make(chan LLMEvent, 100),
		Done:   make(chan struct{}),
	}

	go p.parseStream(resp.Body, stream)
	return stream, nil
}

func (p *AnthropicProvider) parseStream(body io.ReadCloser, stream *LLMStream) {
	defer body.Close()
	defer close(stream.Done)
	defer close(stream.Events)

	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			stream.Events <- LLMEvent{Type: "finish"}
			return
		}

		var event map[string]interface{}
		if err := json.Unmarshal([]byte(data), &event); err != nil {
			continue
		}

		eventType, _ := event["type"].(string)

		switch eventType {
		case "message_start":
			stream.Events <- LLMEvent{Type: "step-start"}

		case "content_block_start":
			index, _ := event["index"].(float64)
			contentBlock, _ := event["content_block"].(map[string]interface{})
			blockType, _ := contentBlock["type"].(string)

			if blockType == "text" {
				stream.Events <- LLMEvent{
					Type: "text-start",
					ToolID: fmt.Sprintf("text_%.0f", index),
				}
			} else if blockType == "tool_use" {
				id, _ := contentBlock["id"].(string)
				name, _ := contentBlock["name"].(string)
				stream.Events <- LLMEvent{
					Type:     "tool-input-start",
					ToolID:   id,
					ToolName: name,
				}
			} else if blockType == "thinking" {
				stream.Events <- LLMEvent{
					Type:   "reasoning-start",
					ToolID: fmt.Sprintf("reasoning_%.0f", index),
				}
			}

		case "content_block_delta":
			index, _ := event["index"].(float64)
			delta, _ := event["delta"].(map[string]interface{})
			deltaType, _ := delta["type"].(string)

			switch deltaType {
			case "text_delta":
				text, _ := delta["text"].(string)
				stream.Events <- LLMEvent{
					Type:   "text-delta",
					ToolID: fmt.Sprintf("text_%.0f", index),
					Text:   text,
				}
			case "input_json_delta":
				partial, _ := delta["partial_json"].(string)
				stream.Events <- LLMEvent{
					Type: "tool-input-delta",
					Text: partial,
				}
			case "thinking_delta":
				text, _ := delta["thinking"].(string)
				stream.Events <- LLMEvent{
					Type:   "reasoning-delta",
					ToolID: fmt.Sprintf("reasoning_%.0f", index),
					Text:   text,
				}
			}

		case "content_block_stop":
			index, _ := event["index"].(float64)
			stream.Events <- LLMEvent{
				Type:   "content-block-stop",
				ToolID: fmt.Sprintf("%.0f", index),
			}

		case "message_delta":
			delta, _ := event["delta"].(map[string]interface{})
			stopReason, _ := delta["stop_reason"].(string)
			usageData, _ := event["usage"].(map[string]interface{})

			var usage *Usage
			if usageData != nil {
				usage = &Usage{
					OutputTokens: int(usageData["output_tokens"].(float64)),
				}
			}

			stream.Events <- LLMEvent{
				Type:         "step-finish",
				FinishReason: stopReason,
				Usage:        usage,
			}

		case "message_stop":
			stream.Events <- LLMEvent{Type: "finish"}

		case "error":
			errData, _ := event["error"].(map[string]interface{})
			errMsg, _ := errData["message"].(string)
			stream.Events <- LLMEvent{Type: "error", Error: errMsg}
		}
	}
}

// OpenAI Provider
type OpenAIProvider struct {
	apiKey  string
	baseURL string
	client  *http.Client
}

func NewOpenAIProvider() *OpenAIProvider {
	apiKey := os.Getenv("OPENAI_API_KEY")
	return &OpenAIProvider{
		apiKey:  apiKey,
		baseURL: "https://api.openai.com/v1",
		client:  &http.Client{},
	}
}

func (p *OpenAIProvider) ID() string   { return "openai" }
func (p *OpenAIProvider) Name() string { return "OpenAI" }

func (p *OpenAIProvider) Stream(req *LLMRequest) (*LLMStream, error) {
	if p.apiKey == "" {
		return nil, fmt.Errorf("OPENAI_API_KEY not set")
	}

	messages := make([]map[string]interface{}, 0)
	if req.System != "" {
		messages = append(messages, map[string]interface{}{
			"role":    "system",
			"content": req.System,
		})
	}
	for _, m := range req.Messages {
		messages = append(messages, map[string]interface{}{
			"role":    m.Role,
			"content": m.Content,
		})
	}

	body := map[string]interface{}{
		"model":    req.Model,
		"messages": messages,
		"stream":   true,
	}

	if req.MaxTokens > 0 {
		body["max_tokens"] = req.MaxTokens
	}
	if req.Temperature != nil {
		body["temperature"] = *req.Temperature
	}

	if len(req.Tools) > 0 {
		tools := make([]map[string]interface{}, 0)
		for _, t := range req.Tools {
			tools = append(tools, map[string]interface{}{
				"type": "function",
				"function": map[string]interface{}{
					"name":        t.Name,
					"description": t.Description,
					"parameters":  t.Parameters,
				},
			})
		}
		body["tools"] = tools
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	url := p.baseURL + "/chat/completions"
	httpReq, err := http.NewRequest("POST", url, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("openai API error %d: %s", resp.StatusCode, string(body))
	}

	stream := &LLMStream{
		Events: make(chan LLMEvent, 100),
		Done:   make(chan struct{}),
	}

	go p.parseStream(resp.Body, stream)
	return stream, nil
}

func (p *OpenAIProvider) parseStream(body io.ReadCloser, stream *LLMStream) {
	defer body.Close()
	defer close(stream.Done)
	defer close(stream.Events)

	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	toolCalls := make(map[int]*pendingToolCall)

	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			stream.Events <- LLMEvent{Type: "finish"}
			return
		}

		var chunk map[string]interface{}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}

		choices, _ := chunk["choices"].([]interface{})
		if len(choices) == 0 {
			continue
		}

		choice, _ := choices[0].(map[string]interface{})
		delta, _ := choice["delta"].(map[string]interface{})
		finishReason, _ := choice["finish_reason"].(string)

		role, _ := delta["role"].(string)
		if role == "assistant" {
			stream.Events <- LLMEvent{Type: "step-start"}
			stream.Events <- LLMEvent{Type: "text-start", ToolID: "text_0"}
			continue
		}

		content, _ := delta["content"].(string)
		if content != "" {
			stream.Events <- LLMEvent{
				Type:   "text-delta",
				ToolID: "text_0",
				Text:   content,
			}
			continue
		}

		reasoning, _ := delta["reasoning_content"].(string)
		if reasoning != "" {
			stream.Events <- LLMEvent{
				Type:   "reasoning-delta",
				ToolID: "reasoning_0",
				Text:   reasoning,
			}
			continue
		}

		toolCallsData, _ := delta["tool_calls"].([]interface{})
		for _, tc := range toolCallsData {
			toolCall, _ := tc.(map[string]interface{})
			index := int(toolCall["index"].(float64))

			if _, exists := toolCalls[index]; !exists {
				toolCalls[index] = &pendingToolCall{}
			}

			id, _ := toolCall["id"].(string)
			if id != "" {
				toolCalls[index].ID = id
			}

			fn, _ := toolCall["function"].(map[string]interface{})
			if fn != nil {
				name, _ := fn["name"].(string)
				if name != "" {
					toolCalls[index].Name = name
					stream.Events <- LLMEvent{
						Type:     "tool-input-start",
						ToolID:   id,
						ToolName: name,
					}
				}

				arguments, _ := fn["arguments"].(string)
				if arguments != "" {
					toolCalls[index].Arguments += arguments
					stream.Events <- LLMEvent{
						Type: "tool-input-delta",
						Text: arguments,
					}
				}
			}
		}

		if finishReason != "" {
			for _, tc := range toolCalls {
				if tc.ID != "" && tc.Name != "" {
					var input interface{}
					json.Unmarshal([]byte(tc.Arguments), &input)
					stream.Events <- LLMEvent{
						Type:      "tool-call",
						ToolID:    tc.ID,
						ToolName:  tc.Name,
						ToolInput: input,
					}
				}
			}

			stream.Events <- LLMEvent{
				Type:         "step-finish",
				FinishReason: finishReason,
			}
		}
	}
}

type pendingToolCall struct {
	ID        string
	Name      string
	Arguments string
}

// NVIDIA Provider (OpenAI-compatible)
type NVIDIAProvider struct {
	apiKey  string
	baseURL string
	client  *http.Client
}

func NewNVIDIAProvider() *NVIDIAProvider {
	apiKey := os.Getenv("NVIDIA_API_KEY")
	if apiKey == "" {
		apiKey = os.Getenv("OPENAI_API_KEY")
	}
	baseURL := os.Getenv("NVIDIA_BASE_URL")
	if baseURL == "" {
		baseURL = "https://integrate.api.nvidia.com/v1"
	}
	return &NVIDIAProvider{
		apiKey:  apiKey,
		baseURL: baseURL,
		client:  &http.Client{},
	}
}

func (p *NVIDIAProvider) ID() string   { return "nvidia" }
func (p *NVIDIAProvider) Name() string { return "NVIDIA" }

func (p *NVIDIAProvider) Stream(req *LLMRequest) (*LLMStream, error) {
	if p.apiKey == "" {
		return nil, fmt.Errorf("NVIDIA_API_KEY not set")
	}

	messages := make([]map[string]interface{}, 0)
	if req.System != "" {
		messages = append(messages, map[string]interface{}{
			"role":    "system",
			"content": req.System,
		})
	}
	for _, m := range req.Messages {
		messages = append(messages, map[string]interface{}{
			"role":    m.Role,
			"content": m.Content,
		})
	}

	body := map[string]interface{}{
		"model":    req.Model,
		"messages": messages,
		"stream":   true,
	}

	if req.MaxTokens > 0 {
		body["max_tokens"] = req.MaxTokens
	}
	if req.Temperature != nil {
		body["temperature"] = *req.Temperature
	}

	jsonBody, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}

	url := p.baseURL + "/chat/completions"
	httpReq, err := http.NewRequest("POST", url, bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}

	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+p.apiKey)

	resp, err := p.client.Do(httpReq)
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != 200 {
		body, _ := io.ReadAll(resp.Body)
		resp.Body.Close()
		return nil, fmt.Errorf("nvidia API error %d: %s", resp.StatusCode, string(body))
	}

	stream := &LLMStream{
		Events: make(chan LLMEvent, 100),
		Done:   make(chan struct{}),
	}

	go p.parseStream(resp.Body, stream)
	return stream, nil
}

func (p *NVIDIAProvider) parseStream(body io.ReadCloser, stream *LLMStream) {
	defer body.Close()
	defer close(stream.Done)
	defer close(stream.Events)

	scanner := bufio.NewScanner(body)
	scanner.Buffer(make([]byte, 1024*1024), 1024*1024)

	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}

		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			stream.Events <- LLMEvent{Type: "finish"}
			return
		}

		var chunk map[string]interface{}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}

		choices, _ := chunk["choices"].([]interface{})
		if len(choices) == 0 {
			continue
		}

		choice, _ := choices[0].(map[string]interface{})
		delta, _ := choice["delta"].(map[string]interface{})
		finishReason, _ := choice["finish_reason"].(string)

		role, _ := delta["role"].(string)
		if role == "assistant" {
			stream.Events <- LLMEvent{Type: "step-start"}
			stream.Events <- LLMEvent{Type: "text-start", ToolID: "text_0"}
			continue
		}

		content, _ := delta["content"].(string)
		if content != "" {
			stream.Events <- LLMEvent{
				Type:   "text-delta",
				ToolID: "text_0",
				Text:   content,
			}
			continue
		}

		if finishReason != "" {
			stream.Events <- LLMEvent{
				Type:         "step-finish",
				FinishReason: finishReason,
			}
		}
	}
}

// Registry
type Registry struct {
	providers map[string]Provider
}

func NewRegistry() *Registry {
	r := &Registry{
		providers: make(map[string]Provider),
	}

	anthropic := NewAnthropicProvider()
	if anthropic.apiKey != "" {
		r.providers[anthropic.ID()] = anthropic
	}

	openai := NewOpenAIProvider()
	if openai.apiKey != "" {
		r.providers[openai.ID()] = openai
	}

	nvidia := NewNVIDIAProvider()
	if nvidia.apiKey != "" {
		r.providers[nvidia.ID()] = nvidia
	}

	return r
}

func (r *Registry) Get(id string) (Provider, bool) {
	p, ok := r.providers[id]
	return p, ok
}

func (r *Registry) List() []Provider {
	var list []Provider
	for _, p := range r.providers {
		list = append(list, p)
	}
	return list
}

func (r *Registry) GetModel(providerID, modelID string) (Provider, string, error) {
	p, ok := r.providers[providerID]
	if !ok {
		return nil, "", fmt.Errorf("provider not found: %s", providerID)
	}
	return p, modelID, nil
}

// ResolveModel resolves a model reference to provider and model ID
func ResolveModel(modelRef string) (providerID, modelID string) {
	parts := strings.SplitN(modelRef, "/", 2)
	if len(parts) == 2 {
		return parts[0], parts[1]
	}

	// Auto-detect based on model name
	lower := strings.ToLower(modelRef)
	switch {
	case strings.Contains(lower, "claude"):
		return "anthropic", modelRef
	case strings.Contains(lower, "gpt"):
		return "openai", modelRef
	case strings.Contains(lower, "o1") || strings.Contains(lower, "o3"):
		return "openai", modelRef
	case strings.Contains(lower, "nemotron") || strings.Contains(lower, "nvidia"):
		return "nvidia", modelRef
	default:
		return "anthropic", modelRef
	}
}

// ToolDefinitions returns tool definitions for the LLM
func ToolDefinitions(tools []interface{}) []ToolDef {
	defs := make([]ToolDef, 0)
	for _, t := range tools {
		if tool, ok := t.(interface {
			ID() string
			Description() string
			Schema() interface{}
		}); ok {
			defs = append(defs, ToolDef{
				Name:        tool.ID(),
				Description: tool.Description(),
				Parameters:  tool.Schema(),
			})
		}
	}
	return defs
}

// Log providers
func LogProviders() {
	log.Println("available providers:")
	for _, p := range NewRegistry().List() {
		log.Printf("  - %s (%s)", p.ID(), p.Name())
	}
}
