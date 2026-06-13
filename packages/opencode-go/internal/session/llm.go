package session

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"github.com/multicloud/opencode-go/internal/event"
	"github.com/multicloud/opencode-go/internal/provider"
	"github.com/multicloud/opencode-go/internal/tool"
)

const MaxSteps = 25

type LLMService struct {
	sessions    *Service
	messages    *MessageService
	providers   *provider.Registry
	tools       *tool.Registry
	eventBus    *event.Bus
}

func NewLLMService(sessions *Service, messages *MessageService, providers *provider.Registry, tools *tool.Registry, bus *event.Bus) *LLMService {
	return &LLMService{
		sessions:  sessions,
		messages:  messages,
		providers: providers,
		tools:     tools,
		eventBus:  bus,
	}
}

func (l *LLMService) Prompt(ctx context.Context, sessionID, text string) (*Message, error) {
	sess, err := l.sessions.Get(sessionID)
	if err != nil {
		return nil, err
	}

	// Create user message
	userMsg, err := l.messages.Create(sessionID, "user", &UserMessage{
		Text: text,
	})
	if err != nil {
		return nil, err
	}

	// Publish message event
	l.publishEvent(sess, "message.updated", map[string]interface{}{
		"sessionID": sessionID,
		"messageID": userMsg.ID,
	})

	// Start agent loop
	err = l.runLoop(ctx, sess)
	if err != nil {
		return nil, err
	}

	return userMsg, nil
}

func (l *LLMService) runLoop(ctx context.Context, sess *Session) error {
	providerID, modelID := resolveModel(sess.Model)

	p, ok := l.providers.Get(providerID)
	if !ok {
		return fmt.Errorf("provider not found: %s", providerID)
	}

	// Build messages history
	history, err := l.buildHistory(sess.ID)
	if err != nil {
		return err
	}

	// Build system prompt
	systemPrompt := l.buildSystemPrompt(sess)

	// Get tool definitions
	toolDefsRaw := l.tools.Definitions()
	toolDefs := make([]provider.ToolDef, len(toolDefsRaw))
	for i, td := range toolDefsRaw {
		toolDefs[i] = provider.ToolDef{
			Name:        td.Name,
			Description: td.Description,
			Parameters:  td.Parameters,
		}
	}

	// Agent loop
	for step := 0; step < MaxSteps; step++ {
		log.Printf("step %d/%d for session %s", step+1, MaxSteps, sess.ID)

		// Publish step started
		l.publishEvent(sess, "session.next.step.started", map[string]interface{}{
			"sessionID": sess.ID,
			"step":      step,
		})

		// Create assistant message placeholder
		assistantMsg, err := l.messages.Create(sess.ID, "assistant", &AssistantMessage{
			Agent: "coder",
			Model: sess.Model,
		})
		if err != nil {
			return err
		}

		// Call LLM
		stream, err := p.Stream(&provider.LLMRequest{
			Messages:  history,
			Model:     modelID,
			Tools:     toolDefs,
			MaxTokens: 8192,
			System:    systemPrompt,
		})
		if err != nil {
			return err
		}

		// Process stream events
		var textContent strings.Builder
		var toolCalls []pendingToolCall
		var currentToolCall *pendingToolCall

		for evt := range stream.Events {
			switch evt.Type {
			case "text-delta":
				textContent.WriteString(evt.Text)
				l.publishEvent(sess, "session.next.text.delta", map[string]interface{}{
					"sessionID":         sess.ID,
					"assistantMessageID": assistantMsg.ID,
					"delta":             evt.Text,
				})

			case "tool-input-start":
				currentToolCall = &pendingToolCall{
					ID:   evt.ToolID,
					Name: evt.ToolName,
				}
				toolCalls = append(toolCalls, *currentToolCall)

			case "tool-input-delta":
				if currentToolCall != nil {
					currentToolCall.Arguments += evt.Text
				}

			case "tool-call":
				// Parse the tool input
				var input interface{}
				if evt.ToolInput != nil {
					input = evt.ToolInput
				} else if currentToolCall != nil {
					json.Unmarshal([]byte(currentToolCall.Arguments), &input)
				}

				toolCalls = append(toolCalls, pendingToolCall{
					ID:   evt.ToolID,
					Name: evt.ToolName,
					Input: input,
				})

				l.publishEvent(sess, "session.next.tool.called", map[string]interface{}{
					"sessionID":         sess.ID,
					"assistantMessageID": assistantMsg.ID,
					"callID":            evt.ToolID,
					"tool":              evt.ToolName,
				})

			case "finish":
				// Check if there are tool calls to execute
				if len(toolCalls) == 0 {
					// No tool calls, we're done
					l.updateAssistantMessage(assistantMsg, textContent.String(), "stop")
					l.publishEvent(sess, "session.next.step.ended", map[string]interface{}{
						"sessionID": sess.ID,
						"finish":    "stop",
					})
					return nil
				}

				// Execute tool calls
				toolResults := make([]provider.Message, 0)
				for _, tc := range toolCalls {
					result := l.executeTool(ctx, tc)
					toolResults = append(toolResults, provider.Message{
						Role: "tool",
						Content: map[string]interface{}{
							"tool_use_id": tc.ID,
							"content":     result.Output,
						},
					})

					l.publishEvent(sess, "session.next.tool.success", map[string]interface{}{
						"sessionID":         sess.ID,
						"assistantMessageID": assistantMsg.ID,
						"callID":            tc.ID,
						"content":           result.Output,
					})
				}

				// Add assistant message with tool calls to history
				history = append(history, provider.Message{
					Role:    "assistant",
					Content: l.buildAssistantContent(textContent.String(), toolCalls),
				})

				// Add tool results to history
				history = append(history, toolResults...)

				// Continue loop for next step
				toolCalls = nil
				textContent.Reset()
				currentToolCall = nil

			case "step-finish":
				if evt.FinishReason == "end_turn" && len(toolCalls) == 0 {
					l.updateAssistantMessage(assistantMsg, textContent.String(), "stop")
					return nil
				}

			case "error":
				l.updateAssistantMessage(assistantMsg, textContent.String(), "error")
				return fmt.Errorf("LLM error: %s", evt.Error)
			}
		}

		// If we get here without finishing, continue loop
	}

	return fmt.Errorf("max steps (%d) exceeded", MaxSteps)
}

func (l *LLMService) executeTool(ctx context.Context, tc pendingToolCall) *tool.Result {
	t, ok := l.tools.Get(tc.Name)
	if !ok {
		return &tool.Result{
			Output:   fmt.Sprintf("Unknown tool: %s", tc.Name),
			ExitCode: 1,
		}
	}

	inputJSON, _ := json.Marshal(tc.Input)
	result, err := t.Execute(ctx, inputJSON)
	if err != nil {
		return &tool.Result{
			Output:   fmt.Sprintf("Tool error: %s", err.Error()),
			ExitCode: 1,
		}
	}

	return result
}

func (l *LLMService) buildHistory(sessionID string) ([]provider.Message, error) {
	msgs, err := l.messages.List(sessionID, 100, 0)
	if err != nil {
		return nil, err
	}

	history := make([]provider.Message, 0)
	for i := len(msgs) - 1; i >= 0; i-- {
		msg := msgs[i]
		switch msg.Type {
		case "user":
			var userMsg UserMessage
			json.Unmarshal([]byte(msg.RawData), &userMsg)
			history = append([]provider.Message{{
				Role:    "user",
				Content: userMsg.Text,
			}}, history...)
		case "assistant":
			var asstMsg AssistantMessage
			json.Unmarshal([]byte(msg.RawData), &asstMsg)
			if asstMsg.Content != nil {
				history = append([]provider.Message{{
					Role:    "assistant",
					Content: l.buildContentFromParts(asstMsg.Content),
				}}, history...)
			}
		}
	}

	return history, nil
}

func (l *LLMService) buildContentFromParts(parts []ContentPart) interface{} {
	textParts := make([]string, 0)
	for _, p := range parts {
		if p.Type == "text" {
			textParts = append(textParts, p.Text)
		}
	}
	if len(textParts) == 1 {
		return textParts[0]
	}
	return strings.Join(textParts, "\n")
}

func (l *LLMService) buildAssistantContent(text string, toolCalls []pendingToolCall) interface{} {
	if len(toolCalls) == 0 {
		return text
	}

	content := make([]map[string]interface{}, 0)
	if text != "" {
		content = append(content, map[string]interface{}{
			"type": "text",
			"text": text,
		})
	}
	for _, tc := range toolCalls {
		content = append(content, map[string]interface{}{
			"type":      "tool_use",
			"id":        tc.ID,
			"name":      tc.Name,
			"input":     tc.Input,
		})
	}
	return content
}

func (l *LLMService) buildSystemPrompt(sess *Session) string {
	return fmt.Sprintf(`You are an AI assistant helping with software development tasks.

Current directory: %s
Session ID: %s

You have access to the following tools:
- bash: Execute shell commands
- read: Read files and directories
- write: Write files
- edit: Edit files by replacing text
- glob: Find files matching patterns
- grep: Search file contents

When executing shell commands, be careful with destructive operations.
Always describe what you're doing in 5-10 words.`, sess.Directory, sess.ID)
}

func (l *LLMService) updateAssistantMessage(msg *Message, text, finish string) {
	var asstMsg AssistantMessage
	json.Unmarshal([]byte(msg.RawData), &asstMsg)

	asstMsg.Content = []ContentPart{
		{Type: "text", Text: text},
	}
	asstMsg.Finish = finish

	l.messages.Update(msg.ID, asstMsg)
}

func (l *LLMService) publishEvent(sess *Session, eventType event.EventType, data interface{}) {
	dataJSON, _ := json.Marshal(data)
	l.eventBus.Publish(event.Event{
		Type: eventType,
		Location: &event.Location{
			Directory: sess.Directory,
		},
		Data: dataJSON,
	})
}

func resolveModel(modelRef *ModelRef) (providerID, modelID string) {
	if modelRef != nil {
		return modelRef.ProviderID, modelRef.ID
	}
	return "nvidia", "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning"
}

type pendingToolCall struct {
	ID      string
	Name    string
	Input   interface{}
	Arguments string
}

func init() {
	// Ensure time is used
	_ = time.Now
}
