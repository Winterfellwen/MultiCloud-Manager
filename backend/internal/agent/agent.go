package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"strings"
)

// Agent AI Agent核心
type Agent struct {
	llmClient   LLMClient
	toolRegistry *ToolRegistry
	config      *AgentConfig
}

// AgentConfig Agent配置
type AgentConfig struct {
	MaxIterations int
	MaxTokens     int
	SystemPrompt  string
}

// NewAgent 创建Agent
func NewAgent(llmClient LLMClient, config *AgentConfig) *Agent {
	if config == nil {
		config = &AgentConfig{
			MaxIterations: 5,
			MaxTokens:     4096,
			SystemPrompt:  getDefaultSystemPrompt(),
		}
	}

	return &Agent{
		llmClient:    llmClient,
		toolRegistry: NewToolRegistry(),
		config:       config,
	}
}

// RegisterTool 注册工具
func (a *Agent) RegisterTool(tool Tool) {
	a.toolRegistry.Register(tool)
}

// GetTools 获取所有工具信息
func (a *Agent) GetTools() []ToolInfo {
	return a.toolRegistry.List()
}

// Chat 聊天接口
func (a *Agent) Chat(ctx context.Context, messages []Message, sessionID string) (*AgentChatResponse, error) {
	// 构建系统提示
	systemPrompt := a.buildSystemPrompt()

	// 构建消息列表
	allMessages := []Message{
		{Role: "system", Content: systemPrompt},
	}
	allMessages = append(allMessages, messages...)

	log.Printf("Agent.Chat: sessionID=%s totalMessages=%d", sessionID, len(allMessages))
	for i, m := range allMessages {
		content := m.Content
		if len(content) > 100 {
			content = content[:100] + "..."
		}
		log.Printf("  msg[%d] role=%s content=%s", i, m.Role, content)
	}

	// 迭代执行（支持多轮tool calling）
	for i := 0; i < a.config.MaxIterations; i++ {
		// 调用LLM
		log.Printf("Agent iteration %d, messages=%d", i, len(allMessages))
		resp, err := a.llmClient.Chat(ctx, allMessages)
		if err != nil {
			log.Printf("LLM call failed at iteration %d: %v", i, err)
			return nil, fmt.Errorf("LLM call failed: %v", err)
		}

		content := resp.Content

		// 检查是否需要调用工具
		if !strings.Contains(content, "```tool") {
			// 不需要调用工具，直接返回
			return &AgentChatResponse{
				Content: content,
			}, nil
		}

		// 解析tool call
		toolCalls := a.parseToolCalls(content)
		if len(toolCalls) == 0 {
			// 解析失败，直接返回
			return &AgentChatResponse{
				Content: content,
			}, nil
		}

		// 执行工具调用
		var toolResults []string
		for _, tc := range toolCalls {
			tool, ok := a.toolRegistry.Get(tc.Name)
			if !ok {
				toolResults = append(toolResults, fmt.Sprintf("工具「%s」不存在", tc.Name))
				continue
			}

			result, err := tool.Execute(ctx, tc.Params)
			if err != nil {
				toolResults = append(toolResults, fmt.Sprintf("工具「%s」执行失败: %v", tc.Name, err))
			} else {
				toolResults = append(toolResults, result)
			}
		}

		// 将工具结果添加到消息列表
		toolResultMsg := fmt.Sprintf("工具执行结果:\n%s", strings.Join(toolResults, "\n\n"))
		allMessages = append(allMessages, Message{Role: "assistant", Content: content})
		allMessages = append(allMessages, Message{Role: "user", Content: toolResultMsg})
	}

	// 超过最大迭代次数
	return &AgentChatResponse{
		Content: "抱歉，处理您的请求时遇到了困难。请尝试简化您的问题。",
	}, nil
}

// buildSystemPrompt 构建系统提示
func (a *Agent) buildSystemPrompt() string {
	var b strings.Builder
	b.WriteString(a.config.SystemPrompt)

	// 添加工具描述
	b.WriteString("\n\n可用工具:\n")
	for _, tool := range a.toolRegistry.List() {
		b.WriteString(fmt.Sprintf("- %s: %s\n", tool.Name, tool.Description))
	}

	// 添加工具调用格式说明
	b.WriteString(`
工具调用格式:
` + "```tool" + `
{
  "name": "工具名称",
  "params": {
    "参数名": "参数值"
  }
}
` + "```" + `

可以同时调用多个工具，每个工具调用用空行分隔。

重要规则:
1. 对于简单查询（查看资源、查看账户等），直接返回结果
2. 对于操作类任务（启动/停止VM等），先调用工具获取信息，再执行操作
3. 对于创建类任务，先调用工具生成方案，等用户确认后再执行
4. 对于复杂任务，分解成多个步骤，逐步执行
5. 始终使用中文回复`)

	return b.String()
}

// parseToolCalls 解析工具调用
func (a *Agent) parseToolCalls(content string) []ToolCall {
	var toolCalls []ToolCall

	// 查找所有tool call块
	start := 0
	for {
		idx := strings.Index(content[start:], "```tool")
		if idx == -1 {
			break
		}

		start += idx + 7 // 跳过```tool
		endIdx := strings.Index(content[start:], "```")
		if endIdx == -1 {
			break
		}

		toolJSON := strings.TrimSpace(content[start : start+endIdx])
		start += endIdx + 3

		var tc ToolCall
		if err := json.Unmarshal([]byte(toolJSON), &tc); err != nil {
			log.Printf("parse tool call: %v", err)
			continue
		}

		toolCalls = append(toolCalls, tc)
	}

	return toolCalls
}

// ToolCall 工具调用
type ToolCall struct {
	Name   string                 `json:"name"`
	Params map[string]interface{} `json:"params"`
}

// getDefaultSystemPrompt 获取默认系统提示
func getDefaultSystemPrompt() string {
	return `你是 MultiCloud Manager 的 AI 云助手，帮助用户管理多云资源（Azure、腾讯云、Oracle Cloud、Render）。

你的能力:
- 查询云账户和资源
- 启动、停止、重启虚拟机
- 创建新的云资源（VM、数据库、AKS集群等）
- 获取云平台定价和免费层信息
- 检查云平台配额
- 搜索云平台知识库

工作方式:
1. 理解用户意图
2. 决定需要调用哪些工具
3. 执行工具调用
4. 基于结果生成回复
5. 对于创建类任务，先生成方案，等用户确认后再执行

重要规则:
- 简单查询直接执行，不需要确认
- 操作类任务直接执行
- 创建类任务先生成方案供用户确认
- 复杂任务分解成多个步骤
- 始终使用中文回复
- 不确定时询问用户`
}

// AgentChatResponse Agent聊天响应
type AgentChatResponse struct {
	Content    string                 `json:"content"`
	ToolCalls  []ToolCall             `json:"tool_calls,omitempty"`
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
}
