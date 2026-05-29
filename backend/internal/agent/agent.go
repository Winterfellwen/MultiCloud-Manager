package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"strings"
)

type AgentMode string

const (
	ModeBuild   AgentMode = "build"
	ModePlan    AgentMode = "plan"
	ModeConfirm AgentMode = "confirm"
)

var modeConfigs = map[AgentMode]ModeConfig{
	ModeBuild: {
		Mode:      ModeBuild,
		MaxRounds: 10,
		SystemPrompt: `你是 MultiCloud Manager 的 AI 云助手（Build模式），帮助用户管理多云资源。

你可以查询、创建、管理云资源。
对于创建类任务，先执行操作再告知结果。
始终使用中文回复。

工具调用格式：
<tool>工具名称</tool>
<parameters>{"参数名":"参数值"}</parameters></tool_call>

可以同时调用多个工具。`,
	},
	ModePlan: {
		Mode:      ModePlan,
		MaxRounds: 5,
		DenyTools: []string{"start_vm", "stop_vm", "restart_vm", "create_vm", "create_database", "create_aks", "log_deletion"},
		SystemPrompt: `你是 MultiCloud Manager 的 AI 云助手（Plan模式），专注于分析和规划。

你可以查询云账户、资源信息、云平台定价和免费层信息、检查配额。
你不可以直接执行操作（启动/停止/创建资源），只能提供方案供用户确认。

工具调用格式：
<tool>工具名称</tool>
<parameters>{"参数名":"参数值"}</parameters></tool_call>

可以同时调用多个工具。始终使用中文回复。`,
	},
	ModeConfirm: {
		Mode:      ModeConfirm,
		MaxRounds: 10,
		DenyTools: []string{},
		SystemPrompt: `你是 MultiCloud Manager 的 AI 云助手（确认模式），帮助用户管理多云资源。

你可以查询、创建、管理云资源。
在生成操作类工具调用时，返回给用户等待确认。
用户确认后，再执行并返回结果。
始终使用中文回复。

工具调用格式：
<tool>工具名称</tool>
<parameters>{"参数名":"参数值"}</parameters></tool_call>

可以同时调用多个工具。`,
	},
}

type ModeConfig struct {
	Mode         AgentMode
	MaxRounds    int
	DenyTools    []string
	Tools        []string
	SystemPrompt string
}

type Agent struct {
	llmClient    LLMClient
	toolRegistry *ToolRegistry
	config       *AgentConfig
}

type AgentConfig struct {
	MaxIterations    int
	MaxTokens        int
	CompactThreshold int
}

func NewAgent(llmClient LLMClient, config *AgentConfig) *Agent {
	if config == nil {
		config = &AgentConfig{
			MaxIterations:    10,
			MaxTokens:        8192,
			CompactThreshold: 6000,
		}
	}
	return &Agent{
		llmClient:    llmClient,
		toolRegistry: NewToolRegistry(),
		config:       config,
	}
}

func (a *Agent) RegisterTool(tool Tool) {
	a.toolRegistry.Register(tool)
}

func (a *Agent) GetTools() []ToolInfo {
	return a.toolRegistry.List()
}

type ChatRequest struct {
	Messages           []Message
	Mode               AgentMode
	SessionID          string
	PendingToolCalls   []ToolCall
	ConfirmedToolCalls []ToolCall
}

type ChatResponse struct {
	Content          string
	Mode             AgentMode
	Compact          bool
	Summary          string
	NeedsConfirm     bool
	PendingToolCalls []ToolCall
	ToolResults      []ToolResult
}

type ToolResult struct {
	Tool   string
	Params map[string]interface{}
	Result string
	Error  string
}

func (a *Agent) Chat(ctx context.Context, req ChatRequest) (*ChatResponse, error) {
	mode := req.Mode
	if mode == "" {
		mode = ModePlan
	}

	modeCfg, ok := modeConfigs[mode]
	if !ok {
		modeCfg = modeConfigs[ModePlan]
	}

	systemPrompt := a.buildSystemPrompt(mode, modeCfg)

	allMessages := []Message{
		{Role: "system", Content: systemPrompt},
	}
	allMessages = append(allMessages, req.Messages...)

	totalChars := 0
	for _, m := range allMessages {
		totalChars += len(m.Content)
	}

	estimatedTokens := totalChars / 2
	if estimatedTokens > a.config.CompactThreshold {
		summary, err := a.compact(ctx, allMessages)
		if err == nil && summary != "" {
			userMsgs := []Message{}
			for _, m := range req.Messages {
				if m.Role == "user" {
					userMsgs = append(userMsgs, m)
				}
			}
			if len(userMsgs) > 2 {
				userMsgs = userMsgs[len(userMsgs)-2:]
			}
			allMessages = []Message{
				{Role: "system", Content: systemPrompt},
				{Role: "system", Content: "对话历史摘要:\n" + summary},
			}
			allMessages = append(allMessages, userMsgs...)

			return &ChatResponse{
				Content: "",
				Mode:    mode,
				Compact: true,
				Summary: summary,
			}, nil
		}
	}

	for i := 0; i < modeCfg.MaxRounds; i++ {
		resp, err := a.llmClient.Chat(ctx, allMessages)
		if err != nil {
			return nil, fmt.Errorf("LLM call failed: %v", err)
		}

		content := resp.Content

		toolCalls := a.parseToolCalls(content)
		if len(toolCalls) == 0 {
			return &ChatResponse{
				Content: content,
				Mode:    mode,
			}, nil
		}

		var validCalls []ToolCall
		for _, tc := range toolCalls {
			if a.isToolAllowed(tc.Name, modeCfg) {
				validCalls = append(validCalls, tc)
			}
		}

		if len(validCalls) == 0 {
			return &ChatResponse{
				Content: content,
				Mode:    mode,
			}, nil
		}

		// Confirm mode: return tool calls for approval on first pass
		if mode == ModeConfirm && len(req.ConfirmedToolCalls) == 0 {
			return &ChatResponse{
				Content:          content,
				Mode:             mode,
				NeedsConfirm:     true,
				PendingToolCalls: validCalls,
			}, nil
		}

		// Determine which tools to execute
		toExecute := validCalls
		if mode == ModeConfirm && len(req.ConfirmedToolCalls) > 0 {
			toExecute = req.ConfirmedToolCalls
		}

		// Execute tools
		var toolResults []string
		var toolResultsList []ToolResult
		for _, tc := range toExecute {
			tool, ok := a.toolRegistry.Get(tc.Name)
			if !ok {
				msg := fmt.Sprintf("工具「%s」不存在", tc.Name)
				toolResults = append(toolResults, msg)
				toolResultsList = append(toolResultsList, ToolResult{Tool: tc.Name, Error: msg})
				continue
			}
			result, err := tool.Execute(ctx, tc.Params)
			if err != nil {
				msg := fmt.Sprintf("工具「%s」执行失败: %v", tc.Name, err)
				toolResults = append(toolResults, msg)
				toolResultsList = append(toolResultsList, ToolResult{Tool: tc.Name, Error: msg})
			} else {
				toolResults = append(toolResults, result)
				toolResultsList = append(toolResultsList, ToolResult{Tool: tc.Name, Result: result, Params: tc.Params})
			}
		}

		toolResultMsg := fmt.Sprintf("工具执行结果:\n%s", strings.Join(toolResults, "\n\n"))
		allMessages = append(allMessages, Message{Role: "assistant", Content: content})
		allMessages = append(allMessages, Message{Role: "user", Content: toolResultMsg})

		// If confirm mode and we just executed confirmed tools, continue loop for final response
		if mode == ModeConfirm && len(req.ConfirmedToolCalls) > 0 {
			req.ConfirmedToolCalls = nil
		}
	}

	return &ChatResponse{
		Content: "抱歉，处理您的请求时遇到了困难。请尝试简化您的问题。",
		Mode:    mode,
	}, nil
}

var toolCallRegex = regexp.MustCompile(`<tool>(.*?)</tool>\s*<parameters>(.*?)</parameters>\s*</tool_call>`)

func (a *Agent) parseToolCalls(content string) []ToolCall {
	var toolCalls []ToolCall

	matches := toolCallRegex.FindAllStringSubmatch(content, -1)
	for _, match := range matches {
		if len(match) < 3 {
			continue
		}
		name := strings.TrimSpace(match[1])
		paramsJSON := strings.TrimSpace(match[2])

		var params map[string]interface{}
		if err := json.Unmarshal([]byte(paramsJSON), &params); err != nil {
			log.Printf("parse tool params: %v", err)
			continue
		}
		toolCalls = append(toolCalls, ToolCall{Name: name, Params: params})
	}

	if len(toolCalls) == 0 {
		oldRegex := regexp.MustCompile("```tool\n(.*?)\n```")
		oldMatches := oldRegex.FindAllStringSubmatch(content, -1)
		for _, match := range oldMatches {
			if len(match) < 2 {
				continue
			}
			var tc ToolCall
			if err := json.Unmarshal([]byte(match[1]), &tc); err != nil {
				continue
			}
			toolCalls = append(toolCalls, tc)
		}
	}

	return toolCalls
}

func (a *Agent) isToolAllowed(name string, cfg ModeConfig) bool {
	for _, denied := range cfg.DenyTools {
		if denied == name {
			return false
		}
	}
	if len(cfg.Tools) == 0 {
		return true
	}
	for _, allowed := range cfg.Tools {
		if allowed == name {
			return true
		}
	}
	return false
}

func (a *Agent) buildSystemPrompt(mode AgentMode, cfg ModeConfig) string {
	var b strings.Builder
	b.WriteString(cfg.SystemPrompt)

	b.WriteString("\n\n可用工具:\n")
	for _, tool := range a.toolRegistry.List() {
		if a.isToolAllowed(tool.Name, cfg) {
			b.WriteString(fmt.Sprintf("- %s: %s\n", tool.Name, tool.Description))
		}
	}

	return b.String()
}

func (a *Agent) compact(ctx context.Context, messages []Message) (string, error) {
	prompt := "请将以下对话历史压缩为结构化摘要，使用markdown格式，包含：已完成工作、进行中、关键决策、下一步、关键上下文。\n\n"

	for _, m := range messages {
		if m.Role == "system" {
			continue
		}
		content := m.Content
		if len(content) > 500 {
			content = content[:500] + "..."
		}
		prompt += fmt.Sprintf("[%s]: %s\n", m.Role, content)
	}

	resp, err := a.llmClient.Chat(ctx, []Message{
		{Role: "system", Content: "你是一个对话历史摘要助手。请压缩对话历史为结构化摘要。"},
		{Role: "user", Content: prompt},
	})
	if err != nil {
		return "", err
	}
	return resp.Content, nil
}

type ToolCall struct {
	Name   string                 `json:"name"`
	Params map[string]interface{} `json:"params"`
}

type Message struct {
	Role    string
	Content string
}
