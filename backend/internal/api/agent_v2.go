package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"sync"
	"time"

	"multicloud-manager/config"
	"multicloud-manager/internal/agent"
	"multicloud-manager/internal/cloud"
	"multicloud-manager/internal/i18n"
	"multicloud-manager/internal/knowledge"
	"multicloud-manager/internal/services"
	"multicloud-manager/internal/vault"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// AgentHandlerV2 新版Agent Handler（Tool-based）
type AgentHandlerV2 struct {
	db        *services.Database
	rdb       *services.RedisClient
	config    *ConfigHandler
	vault     *vault.Client
	syncer    *cloud.Syncer
	knowledge *knowledge.KnowledgeService
	agent     *agent.Agent

	// pending confirmations: sessionID -> chan pending tool calls
	pendingConfirms   map[string]*pendingConfirm
	pendingConfirmsMu sync.Mutex
}

type pendingConfirm struct {
	ToolCalls []agent.ToolCall
	CreatedAt time.Time
	Done      chan struct{}
	Result    []agent.ToolCall
}

// NewAgentHandlerV2 创建新版Agent Handler
func NewAgentHandlerV2(db *services.Database, rdb *services.RedisClient, cfg *config.Config) *AgentHandlerV2 {
	h := &AgentHandlerV2{
		db:     db,
		rdb:    rdb,
		config: NewConfigHandler(db),
		pendingConfirms: make(map[string]*pendingConfirm),
	}

	// 初始化 vault 客户端
	vaultURL := cfg.VaultURL
	vaultToken := cfg.VaultToken
	if vaultURL == "" {
		vaultURL = "http://localhost:8200"
	}
	if vaultToken == "" {
		if token, err := getLocalVaultToken(); err == nil {
			vaultToken = token
		}
	}
	if vaultURL != "" && vaultToken != "" {
		h.vault = vault.NewClient(vaultURL, vaultToken)
		log.Printf("Vault client initialized: %s", vaultURL)
	} else {
		log.Println("Vault client disabled (no token available)")
	}

	// 初始化云平台知识库服务
	h.knowledge = knowledge.New()

	// 初始化Agent
	llmClient := &apiLLMClient{db: db, config: h.config}
	h.agent = agent.NewAgent(llmClient, nil)

	// 注册工具
	h.registerTools()

	return h
}

// registerTools 注册所有工具
func (h *AgentHandlerV2) registerTools() {
	// 查询工具
	h.agent.RegisterTool(agent.NewQueryResourcesTool(h.db))
	h.agent.RegisterTool(agent.NewQueryAccountsTool(h.db))

	// VM操作工具
	h.agent.RegisterTool(agent.NewStartVMTool(h.db))
	h.agent.RegisterTool(agent.NewStopVMTool(h.db))
	h.agent.RegisterTool(agent.NewRestartVMTool(h.db))

	// 创建工具
	h.agent.RegisterTool(agent.NewCreateVMTool(h.db))
	h.agent.RegisterTool(agent.NewCreateDatabaseTool(h.db))
	h.agent.RegisterTool(agent.NewCreateAKSTool(h.db))

	// 信息工具
	h.agent.RegisterTool(agent.NewGetFreeTierTool())
	h.agent.RegisterTool(agent.NewCheckQuotaTool(h.db))

	// 日志工具
	h.agent.RegisterTool(agent.NewLogDeletionTool(h.db))
}

// SetSyncer 注入同步器
func (h *AgentHandlerV2) SetSyncer(syncer *cloud.Syncer) {
	h.syncer = syncer
}

// Chat 聊天接口（非流式，保持兼容）
func (h *AgentHandlerV2) Chat(c *gin.Context) {
	var req struct {
		Message   string `json:"message" binding:"required"`
		SessionID string `json:"session_id"`
		Mode      string `json:"mode"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": i18n.T(c, "msg_required")})
		return
	}

	sessionID := req.SessionID
	if sessionID == "" {
		sessionID = "session-" + uuid.New().String()[:8]
	}

	mode := agent.ModePlan
	if req.Mode == "build" {
		mode = agent.ModeBuild
	} else if req.Mode == "confirm" {
		mode = agent.ModeConfirm
	}

	h.saveMessage(sessionID, "user", req.Message)

	history := h.getConversationHistory(sessionID, 4)

	var messages []agent.Message
	for _, m := range history {
		if m.Role == "user" {
			messages = append(messages, agent.Message{
				Role:    "user",
				Content: m.Content,
			})
		}
	}
	messages = append(messages, agent.Message{
		Role:    "user",
		Content: req.Message,
	})

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	chatReq := agent.ChatRequest{
		Messages:  messages,
		Mode:      mode,
		SessionID: sessionID,
	}

	resp, err := h.agent.Chat(ctx, chatReq)
	if err != nil {
		log.Printf("Agent chat failed: %v | sessionID=%s", err, sessionID)
		h.saveMessage(sessionID, "agent", "抱歉，处理您的请求时遇到了错误。")
		c.JSON(http.StatusOK, gin.H{
			"message":    "抱歉，处理您的请求时遇到了错误。",
			"session_id": sessionID,
		})
		return
	}

	if resp.Compact {
		h.saveMessage(sessionID, "system", "[上下文已压缩]")
		chatReq.Messages = []agent.Message{
			{Role: "user", Content: req.Message},
		}
		resp, err = h.agent.Chat(ctx, chatReq)
		if err != nil {
			h.saveMessage(sessionID, "agent", "抱歉，处理您的请求时遇到了错误。")
			c.JSON(http.StatusOK, gin.H{
				"message":    "抱歉，处理您的请求时遇到了错误。",
				"session_id": sessionID,
			})
			return
		}
	}

	cleanReply := resp.Content
	if idx := strings.Index(cleanReply, "<tool>"); idx >= 0 {
		cleanReply = cleanReply[:idx]
	}
	if idx := strings.Index(cleanReply, "```tool"); idx >= 0 {
		cleanReply = cleanReply[:idx]
	}
	cleanReply = strings.TrimSpace(cleanReply)
	if cleanReply == "" {
		cleanReply = "已处理您的请求"
	}
	h.saveMessage(sessionID, "agent", cleanReply)

	c.JSON(http.StatusOK, gin.H{
		"message":    resp.Content,
		"session_id": sessionID,
		"mode":       resp.Mode,
		"compact":    resp.Compact,
	})
}

// ChatStream SSE流式聊天接口
func (h *AgentHandlerV2) ChatStream(c *gin.Context) {
	var req struct {
		Message          string            `json:"message"`
		SessionID        string            `json:"session_id"`
		Mode             string            `json:"mode"`
		ConfirmedTools   []agent.ToolCall  `json:"confirmed_tools,omitempty"`
		ConfirmAction    string            `json:"confirm_action,omitempty"` // "confirm" | "reject" | "skip"
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": i18n.T(c, "msg_required")})
		return
	}

	sessionID := req.SessionID
	if sessionID == "" {
		sessionID = "session-" + uuid.New().String()[:8]
	}

	mode := agent.ModePlan
	if req.Mode == "build" {
		mode = agent.ModeBuild
	} else if req.Mode == "confirm" {
		mode = agent.ModeConfirm
	}

	// SSE headers
	c.Writer.Header().Set("Content-Type", "text/event-stream")
	c.Writer.Header().Set("Cache-Control", "no-cache")
	c.Writer.Header().Set("Connection", "keep-alive")
	c.Writer.Header().Set("X-Accel-Buffering", "no")
	flusher, ok := c.Writer.(http.Flusher)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "streaming not supported"})
		return
	}

	sendSSE := func(event string, data interface{}) {
		d, _ := json.Marshal(data)
		fmt.Fprintf(c.Writer, "event: %s\ndata: %s\n\n", event, d)
		flusher.Flush()
	}

	// Save user message
	if req.Message != "" {
		h.saveMessage(sessionID, "user", req.Message)
	}

	// Build message history
	history := h.getConversationHistory(sessionID, 8)

	var messages []agent.Message
	for _, m := range history {
		if m.Role == "user" {
			messages = append(messages, agent.Message{Role: "user", Content: m.Content})
		}
	}
	if req.Message != "" {
		messages = append(messages, agent.Message{Role: "user", Content: req.Message})
	}

	// Run agent in goroutine, stream via channel
	type streamEvent struct {
		event string
		data  interface{}
	}
	eventChan := make(chan streamEvent, 100)
	done := make(chan struct{})

	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	go func() {
		defer close(done)

		chatReq := agent.ChatRequest{
			Messages:           messages,
			Mode:               mode,
			SessionID:          sessionID,
			ConfirmedToolCalls: req.ConfirmedTools,
		}

		resp, err := h.agent.Chat(ctx, chatReq)
		if err != nil {
			eventChan <- streamEvent{"error", map[string]string{"message": err.Error()}}
			return
		}

		if resp.Compact {
			eventChan <- streamEvent{"compact", map[string]string{"summary": resp.Summary}}
			// Re-run with compacted history
			chatReq.Messages = []agent.Message{{Role: "user", Content: req.Message}}
			resp, err = h.agent.Chat(ctx, chatReq)
			if err != nil {
				eventChan <- streamEvent{"error", map[string]string{"message": err.Error()}}
				return
			}
		}

		if resp.NeedsConfirm {
			// Stream text content first
			cleanContent := resp.Content
			if idx := strings.Index(cleanContent, "<tool>"); idx >= 0 {
				cleanContent = cleanContent[:idx]
			}
			cleanContent = strings.TrimSpace(cleanContent)

			// Stream tokens
			for _, ch := range cleanContent {
				eventChan <- streamEvent{"token", map[string]string{"content": string(ch)}}
				time.Sleep(10 * time.Millisecond)
			}

			// Save the clean content as agent message
			h.saveMessage(sessionID, "agent", cleanContent)

			// Save pending tool calls
			h.pendingConfirmsMu.Lock()
			pc := &pendingConfirm{
				ToolCalls: resp.PendingToolCalls,
				CreatedAt: time.Now(),
				Done:      make(chan struct{}),
			}
			h.pendingConfirms[sessionID] = pc
			h.pendingConfirmsMu.Unlock()

			// Send confirm_required event
			eventChan <- streamEvent{"confirm_required", map[string]interface{}{
				"tool_calls": resp.PendingToolCalls,
				"session_id": sessionID,
			}}
			return
		}

		// Clean tool calls from the saved content
		cleanContent := resp.Content
		if idx := strings.Index(cleanContent, "<tool>"); idx >= 0 {
			cleanContent = cleanContent[:idx]
		}
		if idx := strings.Index(cleanContent, "```tool"); idx >= 0 {
			cleanContent = cleanContent[:idx]
		}
		cleanContent = strings.TrimSpace(cleanContent)
		if cleanContent == "" {
			cleanContent = "已处理您的请求"
		}
		h.saveMessage(sessionID, "agent", cleanContent)

		// Stream tokens
		for _, ch := range resp.Content {
			eventChan <- streamEvent{"token", map[string]string{"content": string(ch)}}
			time.Sleep(10 * time.Millisecond)
		}
	}()

	// Read events and send to SSE
	for {
		select {
		case evt, ok := <-eventChan:
			if !ok {
				sendSSE("done", map[string]string{})
				return
			}
			sendSSE(evt.event, evt.data)
		case <-done:
			sendSSE("done", map[string]string{})
			return
		case <-ctx.Done():
			sendSSE("error", map[string]string{"message": "request timeout"})
			return
		}
	}
}

// ConfirmAction 用户确认/拒绝工具调用
func (h *AgentHandlerV2) ConfirmAction(c *gin.Context) {
	var req struct {
		SessionID  string           `json:"session_id" binding:"required"`
		Action     string           `json:"action" binding:"required"` // "confirm" | "reject"
		ToolName   string           `json:"tool_name"`                 // empty = all
		ToolParams map[string]interface{} `json:"tool_params"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	h.pendingConfirmsMu.Lock()
	pc, exists := h.pendingConfirms[req.SessionID]
	if !exists {
		h.pendingConfirmsMu.Unlock()
		c.JSON(http.StatusNotFound, gin.H{"error": "no pending confirmation for this session"})
		return
	}

	if req.Action == "confirm" {
		// Filter to the confirmed tool calls
		for _, tc := range pc.ToolCalls {
			if req.ToolName == "" || tc.Name == req.ToolName {
				pc.Result = append(pc.Result, tc)
			}
		}
	}

	// Signal the waiting stream handler
	delete(h.pendingConfirms, req.SessionID)
	h.pendingConfirmsMu.Unlock()

	close(pc.Done)

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// DeleteSession 删除会话
func (h *AgentHandlerV2) DeleteSession(c *gin.Context) {
	sessionID := c.Param("id")
	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
		return
	}

	h.db.Exec(`DELETE FROM ai_agent_messages WHERE session_id IN (SELECT id FROM ai_agent_sessions WHERE session_id=$1)`, sessionID)
	h.db.Exec(`DELETE FROM ai_agent_sessions WHERE session_id=$1`, sessionID)

	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

// saveMessage 保存消息
func (h *AgentHandlerV2) saveMessage(sessionID, role, content string) {
	if h.db == nil {
		return
	}

	userID := "00000000-0000-0000-0000-000000000000"
	teamID := "00000000-0000-0000-0000-000000000000"

	h.db.Exec(
		`INSERT INTO ai_agent_sessions (id, user_id, team_id, session_id, title, status, last_message_at)
		 VALUES ($1, $2, $3, $4, $5, 'active', CURRENT_TIMESTAMP)
		 ON CONFLICT (session_id) DO UPDATE SET last_message_at = CURRENT_TIMESTAMP`,
		uuid.New(), userID, teamID, sessionID, truncate(content, 50),
	)

	meta, _ := json.Marshal(map[string]string{"source": "web"})
	h.db.Exec(
		`INSERT INTO ai_agent_messages (id, session_id, role, content, metadata)
		 VALUES ($1, (SELECT id FROM ai_agent_sessions WHERE session_id=$2), $3, $4, $5)`,
		uuid.New(), sessionID, role, content, meta,
	)
}

// getConversationHistory 获取对话历史（截断过长的agent回复）
func (h *AgentHandlerV2) getConversationHistory(sessionID string, limit int) []chatMsg {
	if h.db == nil {
		return nil
	}

	rows, err := h.db.Query(
		`SELECT role, content FROM ai_agent_messages m
		 JOIN ai_agent_sessions s ON m.session_id = s.id
		 WHERE s.session_id = $1
		 ORDER BY m.created_at DESC LIMIT $2`,
		sessionID, limit,
	)
	if err != nil {
		return nil
	}
	defer rows.Close()

	var messages []chatMsg
	for rows.Next() {
		var m chatMsg
		if err := rows.Scan(&m.Role, &m.Content); err != nil {
			continue
		}
		// 截断过长的agent回复（工具调用结果），避免LLM调用失败
		if m.Role == "agent" && len(m.Content) > 500 {
			m.Content = m.Content[:500] + "...(已截断)"
		}
		messages = append(messages, m)
	}

	// 反转为正序
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	return messages
}

// apiLLMClient API LLM客户端
type apiLLMClient struct {
	db     *services.Database
	config *ConfigHandler
}

func (c *apiLLMClient) Chat(ctx context.Context, messages []agent.Message) (*agent.ChatResponse, error) {
	if c.db == nil {
		return nil, fmt.Errorf("database not available")
	}

	cfg := c.config.loadConfig()
	if cfg.APIKey == "" {
		return nil, fmt.Errorf("LLM API key not configured")
	}

	// 转换消息格式
	var msgs []chatMessage
	for _, m := range messages {
		msgs = append(msgs, chatMessage{
			Role:    m.Role,
			Content: m.Content,
		})
	}

	// 调用LLM
	body := chatRequest{
		Model:    cfg.Model,
		Messages: msgs,
		Stream:   false,
	}

	if cfg.EnableReasoning && cfg.ReasoningEffort != "" {
		body.ReasoningEffort = cfg.ReasoningEffort
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return nil, fmt.Errorf("marshal: %w", err)
	}

	url := strings.TrimRight(cfg.APIEndpoint, "/") + "/chat/completions"
	req, err := http.NewRequestWithContext(ctx, "POST", url, strings.NewReader(string(payload)))
	if err != nil {
		return nil, fmt.Errorf("request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+cfg.APIKey)

	client := &http.Client{Timeout: 90 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()

	var result chatResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode: %w", err)
	}

	if len(result.Choices) == 0 {
		return nil, fmt.Errorf("no choices in response")
	}

	return &agent.ChatResponse{
		Content: result.Choices[0].Message.Content,
	}, nil
}

// ============================================================
// 其他端点（保持兼容）
// ============================================================

// ListSessions 列出会话
func (h *AgentHandlerV2) ListSessions(c *gin.Context) {
	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"sessions": []gin.H{}})
		return
	}

	rows, err := h.db.Query(
		`SELECT session_id, title, status, last_message_at, created_at
		 FROM ai_agent_sessions ORDER BY last_message_at DESC LIMIT 20`,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败"})
		return
	}
	defer rows.Close()

	type Session struct {
		SessionID     string    `json:"session_id"`
		Title         string    `json:"title"`
		Status        string    `json:"status"`
		LastMessageAt time.Time `json:"last_message_at"`
		CreatedAt     time.Time `json:"created_at"`
	}

	var sessions []Session
	for rows.Next() {
		var s Session
		if err := rows.Scan(&s.SessionID, &s.Title, &s.Status, &s.LastMessageAt, &s.CreatedAt); err != nil {
			continue
		}
		sessions = append(sessions, s)
	}
	if sessions == nil {
		sessions = []Session{}
	}

	c.JSON(http.StatusOK, gin.H{"sessions": sessions})
}

// SessionDetail 会话详情
func (h *AgentHandlerV2) SessionDetail(c *gin.Context) {
	sessionID := c.Param("id")
	if h.db == nil {
		c.JSON(http.StatusOK, gin.H{"messages": []gin.H{}})
		return
	}

	rows, err := h.db.Query(
		`SELECT m.role, m.content, m.created_at
		 FROM ai_agent_messages m
		 JOIN ai_agent_sessions s ON m.session_id = s.id
		 WHERE s.session_id = $1
		 ORDER BY m.created_at ASC`,
		sessionID,
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "查询失败"})
		return
	}
	defer rows.Close()

	type Message struct {
		Role      string    `json:"role"`
		Content   string    `json:"content"`
		CreatedAt time.Time `json:"created_at"`
	}

	var messages []Message
	for rows.Next() {
		var m Message
		var t sql.NullTime
		if err := rows.Scan(&m.Role, &m.Content, &t); err != nil {
			continue
		}
		if t.Valid {
			m.CreatedAt = t.Time
		}
		messages = append(messages, m)
	}
	if messages == nil {
		messages = []Message{}
	}

	c.JSON(http.StatusOK, gin.H{"messages": messages})
}

// Execute 执行操作
func (h *AgentHandlerV2) Execute(c *gin.Context) {
	var req struct {
		PlanID    string `json:"plan_id" binding:"required"`
		Confirmed bool   `json:"confirmed"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing plan_id"})
		return
	}

	if !req.Confirmed {
		c.JSON(http.StatusOK, gin.H{"message": "执行已取消"})
		return
	}

	log.Printf("Executing plan: %s", req.PlanID)
	c.JSON(http.StatusOK, gin.H{
		"message":  "方案已开始执行",
		"plan_id": req.PlanID,
		"status":  "executing",
	})
}

// GetTools 获取可用工具列表
func (h *AgentHandlerV2) GetTools(c *gin.Context) {
	tools := h.agent.GetTools()
	c.JSON(http.StatusOK, gin.H{"tools": tools})
}
