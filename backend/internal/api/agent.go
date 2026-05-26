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

	"multicloud-manager/internal/services"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AgentHandler struct {
	db     *services.Database
	rdb    *services.RedisClient
	config *ConfigHandler
}

func NewAgentHandler(db *services.Database, rdb *services.RedisClient) *AgentHandler {
	return &AgentHandler{
		db:     db,
		rdb:    rdb,
		config: NewConfigHandler(db),
	}
}

const systemPrompt = `你是 MultiCloud Manager 的 AI 云助手，帮助用户管理多云资源（Azure、腾讯云、Oracle Cloud、Render）。
你可以帮助用户：
- 查看和管理云账户
- 查看云资源列表
- 创建、启动、停止、重启资源
- 执行 Terraform 模板
- 管理团队

请用中文回复，保持简洁专业。对于需要实际操作的任务（创建/删除资源等），请先生成方案供用户确认后再执行。`

func (h *AgentHandler) Chat(c *gin.Context) {
	var req struct {
		Message   string `json:"message" binding:"required"`
		SessionID string `json:"session_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "请输入消息"})
		return
	}

	sessionID := req.SessionID
	if sessionID == "" {
		sessionID = "session-" + uuid.New().String()[:8]
	}

	// Save message to database
	if h.db != nil {
		userID := "00000000-0000-0000-0000-000000000000"
		teamID := "00000000-0000-0000-0000-000000000000"

		// Ensure session exists
		h.db.Exec(
			`INSERT INTO ai_agent_sessions (id, user_id, team_id, session_id, title, status, last_message_at)
			 VALUES ($1, $2, $3, $4, $5, 'active', CURRENT_TIMESTAMP)
			 ON CONFLICT (session_id) DO UPDATE SET last_message_at = CURRENT_TIMESTAMP`,
			uuid.New(), userID, teamID, sessionID, truncate(req.Message, 50),
		)

		// Save user message
		meta, _ := json.Marshal(map[string]string{"source": "web"})
		h.db.Exec(
			`INSERT INTO ai_agent_messages (id, session_id, role, content, metadata)
			 VALUES ($1, (SELECT id FROM ai_agent_sessions WHERE session_id=$2), $3, $4, $5)`,
			uuid.New(), sessionID, "user", req.Message, meta,
		)
	}

	// Process message and generate response
	reply := h.processMessage(req.Message, sessionID)

	// Save agent response
	if h.db != nil {
		meta, _ := json.Marshal(map[string]string{"source": "agent"})
		h.db.Exec(
			`INSERT INTO ai_agent_messages (id, session_id, role, content, metadata)
			 VALUES ($1, (SELECT id FROM ai_agent_sessions WHERE session_id=$2), $3, $4, $5)`,
			uuid.New(), sessionID, "agent", reply, meta,
		)
	}

	c.JSON(http.StatusOK, gin.H{
		"message":    reply,
		"session_id": sessionID,
	})
}

func (h *AgentHandler) processMessage(msg string, sessionID string) string {
	if h.db != nil {
		cfg := h.config.loadConfig()
		if cfg.APIKey != "" {
			ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
			defer cancel()
			reply, err := callLLM(ctx, cfg.APIEndpoint, cfg.Model, cfg.APIKey,
				cfg.EnableReasoning, cfg.ReasoningEffort, systemPrompt, msg)
			if err == nil {
				return reply
			}
			log.Printf("LLM call failed: %v", err)
		}
	}

	// Fallback to rule-based
	return h.ruleReply(msg)
}

func (h *AgentHandler) ruleReply(msg string) string {
	msgLower := strings.ToLower(msg)

	switch {
	case strings.Contains(msgLower, "账户") || strings.Contains(msgLower, "account"):
		return h.handleAccountIntent(msg)

	case strings.Contains(msgLower, "资源") || strings.Contains(msgLower, "resource"):
		return h.handleResourceIntent(msg)

	case strings.Contains(msgLower, "创建") || strings.Contains(msgLower, "新建") || strings.Contains(msgLower, "vm") || strings.Contains(msgLower, "虚拟机"):
		return h.handleCreateIntent(msg)

	case strings.Contains(msgLower, "你好") || strings.Contains(msgLower, "hello") || strings.Contains(msgLower, "hi"):
		return "你好！我是 MultiCloud AI Agent，可以帮你管理多云资源。\n\n你可以：\n• **查看账户** - 管理已连接的云平台\n• **查看资源** - 列出所有虚拟机、数据库等\n• **创建资源** - 新建 VM 或部署服务\n• **执行操作** - 启动/停止/重启资源\n\n需要帮助的话，请直接告诉我。"

	case strings.Contains(msgLower, "帮助") || strings.Contains(msgLower, "help"):
		return "**可用命令**：\n• 查看所有云账户\n• 列出所有资源\n• 创建一个新的虚拟机\n• 启动/停止某个资源\n• 查看某个资源的详细信息"

	default:
		return fmt.Sprintf("收到你的指令：「%s」\n\n我可以帮你处理以下类型的请求：\n• 云账户管理（添加/查看/删除）\n• 资源管理（列表/启动/停止）\n• 新建资源（VM、数据库等）\n\n请提供更具体的指令，我会为你执行。", msg)
	}
}

func (h *AgentHandler) handleAccountIntent(msg string) string {
	if h.db == nil {
		return "开发模式下暂无账户数据。连接数据库后可查看真实账户列表。"
	}

	rows, err := h.db.Query(`SELECT name, cloud_type, is_active FROM cloud_accounts ORDER BY created_at DESC LIMIT 10`)
	if err != nil {
		return "查询账户时出错，请稍后重试。"
	}
	defer rows.Close()

	var accounts []string
	for rows.Next() {
		var name, cloud string
		var active bool
		if err := rows.Scan(&name, &cloud, &active); err != nil {
			continue
		}
		status := "🟢"
		if !active {
			status = "⚪"
		}
		accounts = append(accounts, fmt.Sprintf("%s **%s** (%s)", status, name, cloud))
	}

	if len(accounts) == 0 {
		return "还没有添加任何云账户。在「账户」标签页中可以添加 Azure、腾讯云、Oracle Cloud 或 Render 账户。"
	}

	return "**已连接的云账户**：\n\n" + strings.Join(accounts, "\n") +
		"\n\n你可以在「账户」标签页管理这些账户。"
}

func (h *AgentHandler) handleResourceIntent(msg string) string {
	return "**当前资源列表**：\n\n" +
		"🟢 **prod-web-server** (Azure VM) - eastus - 运行中\n" +
		"🟢 **dev-database** (腾讯云 Database) - ap-guangzhou - 运行中\n" +
		"⚪ **staging-k8s** (Oracle K8s) - ap-tokyo - 已停止\n" +
		"🟢 **blog-api** (Render Web) - oregon - 运行中\n\n" +
		"在「资源」标签页可以执行启动/停止操作。"
}

func (h *AgentHandler) handleCreateIntent(msg string) string {
	// Risk assessment
	hasVM := strings.Contains(strings.ToLower(msg), "vm") || strings.Contains(msg, "虚拟机")
	hasDB := strings.Contains(strings.ToLower(msg), "数据库") || strings.Contains(strings.ToLower(msg), "database")

	plan := "**执行方案生成**：\n\n"
	plan += "📋 **风险评估**：🟡 中等风险（涉及资源创建，可能产生费用）\n\n"

	if hasVM {
		plan += "**方案**：创建虚拟机\n"
		plan += "• 云平台：Azure（推荐，资源最充足）\n"
		plan += "• 规格：Standard_B1s (1 vCPU, 1 GB RAM)\n"
		plan += "• 系统：Ubuntu 22.04 LTS\n"
		plan += "• 预估费用：约 $0.01/小时\n\n"
	} else if hasDB {
		plan += "**方案**：创建数据库实例\n"
		plan += "• 云平台：腾讯云\n"
		plan += "• 规格：MySQL 5.7, 1核2GB\n"
		plan += "• 存储：50 GB SSD\n"
		plan += "• 预估费用：约 ¥0.3/小时\n\n"
	} else {
		plan += "**方案**：创建云资源\n"
		plan += "• 请指定具体资源类型（VM / 数据库 / Kubernetes 等）\n\n"
	}

	plan += "⚠️ **注意**：此操作将在云平台产生实际费用。请确认是否继续？\n"
	plan += "回复「确认创建」即可执行。"

	return plan
}

func (h *AgentHandler) Execute(c *gin.Context) {
	var req struct {
		PlanID    string `json:"plan_id" binding:"required"`
		Confirmed bool   `json:"confirmed"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "缺少 plan_id"})
		return
	}

	if !req.Confirmed {
		c.JSON(http.StatusOK, gin.H{"message": "执行已取消，需要确认后才能执行"})
		return
	}

	// Simulate execution
	log.Printf("Executing plan: %s", req.PlanID)
	c.JSON(http.StatusOK, gin.H{
		"message": "执行已启动",
		"plan_id": req.PlanID,
		"status":  "executing",
	})
}

func (h *AgentHandler) ListSessions(c *gin.Context) {
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

func (h *AgentHandler) SessionDetail(c *gin.Context) {
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

func truncate(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen]) + "..."
}