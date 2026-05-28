package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
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
}

// NewAgentHandlerV2 创建新版Agent Handler
func NewAgentHandlerV2(db *services.Database, rdb *services.RedisClient, cfg *config.Config) *AgentHandlerV2 {
	h := &AgentHandlerV2{
		db:     db,
		rdb:    rdb,
		config: NewConfigHandler(db),
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

// Chat 聊天接口
func (h *AgentHandlerV2) Chat(c *gin.Context) {
	var req struct {
		Message   string `json:"message" binding:"required"`
		SessionID string `json:"session_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": i18n.T(c, "msg_required")})
		return
	}

	sessionID := req.SessionID
	if sessionID == "" {
		sessionID = "session-" + uuid.New().String()[:8]
	}

	// 保存用户消息
	h.saveMessage(sessionID, "user", req.Message)

	// 获取对话历史（仅保留最近2条，agent回复截断到100字符）
	history := h.getConversationHistory(sessionID, 2)

	// 构建消息列表
	var messages []agent.Message
	for _, m := range history {
		content := m.Content
		// 截断过长的agent回复，避免token超限
		if m.Role == "agent" && len(content) > 100 {
			content = content[:100] + "..."
		}
		messages = append(messages, agent.Message{
			Role:    m.Role,
			Content: content,
		})
	}
	messages = append(messages, agent.Message{
		Role:    "user",
		Content: req.Message,
	})

	// 调用Agent
	ctx, cancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer cancel()

	resp, err := h.agent.Chat(ctx, messages, sessionID)
	if err != nil {
		log.Printf("Agent chat failed: %v | sessionID=%s | msgLen=%d | historyLen=%d", err, sessionID, len(req.Message), len(messages))
		h.saveMessage(sessionID, "agent", "抱歉，处理您的请求时遇到了错误。")
		c.JSON(http.StatusOK, gin.H{
			"message":    "抱歉，处理您的请求时遇到了错误。",
			"session_id": sessionID,
		})
		return
	}

	// 保存AI回复
	h.saveMessage(sessionID, "agent", resp.Content)

	c.JSON(http.StatusOK, gin.H{
		"message":    resp.Content,
		"session_id": sessionID,
	})
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
