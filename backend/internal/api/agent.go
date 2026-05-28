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

	"multicloud-manager/internal/i18n"
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

func (h *AgentHandler) Chat(c *gin.Context) {
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

	// Save message to database
	if h.db != nil {
		userID := "00000000-0000-0000-0000-000000000000"
		teamID := "00000000-0000-0000-0000-000000000000"

		h.db.Exec(
			`INSERT INTO ai_agent_sessions (id, user_id, team_id, session_id, title, status, last_message_at)
			 VALUES ($1, $2, $3, $4, $5, 'active', CURRENT_TIMESTAMP)
			 ON CONFLICT (session_id) DO UPDATE SET last_message_at = CURRENT_TIMESTAMP`,
			uuid.New(), userID, teamID, sessionID, truncate(req.Message, 50),
		)

		meta, _ := json.Marshal(map[string]string{"source": "web"})
		h.db.Exec(
			`INSERT INTO ai_agent_messages (id, session_id, role, content, metadata)
			 VALUES ($1, (SELECT id FROM ai_agent_sessions WHERE session_id=$2), $3, $4, $5)`,
			uuid.New(), sessionID, "user", req.Message, meta,
		)
	}

	// Process message and generate response
	reply := h.processMessage(c, req.Message, sessionID)

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

func (h *AgentHandler) processMessage(c *gin.Context, msg string, sessionID string) string {
	loc := i18n.DetectLocale(c)

	if h.db != nil {
		cfg := h.config.loadConfig()
		if cfg.APIKey != "" {
			ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
			defer cancel()
			prompt := i18n.SystemPrompt[loc]
			reply, err := callLLM(ctx, cfg.APIEndpoint, cfg.Model, cfg.APIKey,
				cfg.EnableReasoning, cfg.ReasoningEffort, prompt, msg)
			if err == nil {
				return reply
			}
			log.Printf("LLM call failed: %v", err)
		}
	}

	return h.ruleReply(loc, msg)
}

func (h *AgentHandler) ruleReply(loc i18n.Locale, msg string) string {
	msgLower := strings.ToLower(msg)

	switch {
	case strings.Contains(msgLower, "账户") || strings.Contains(msgLower, "account"):
		return h.handleAccountIntent(loc, msg)

	case strings.Contains(msgLower, "资源") || strings.Contains(msgLower, "resource"):
		return h.handleResourceIntent(loc, msg)

	case strings.Contains(msgLower, "创建") || strings.Contains(msgLower, "新建") || strings.Contains(msgLower, "vm") || strings.Contains(msgLower, "虚拟机"):
		return h.handleCreateIntent(loc, msg)

	case strings.Contains(msgLower, "你好") || strings.Contains(msgLower, "hello") || strings.Contains(msgLower, "hi"):
		return i18n.TL(loc, "welcome")

	case strings.Contains(msgLower, "帮助") || strings.Contains(msgLower, "help"):
		return i18n.TL(loc, "help")

	default:
		return i18n.TL(loc, "default_reply", msg)
	}
}

func (h *AgentHandler) handleAccountIntent(loc i18n.Locale, msg string) string {
	if h.db == nil {
		return i18n.TL(loc, "dev_no_accounts")
	}

	rows, err := h.db.Query(`SELECT name, cloud_type, is_active FROM cloud_accounts ORDER BY created_at DESC LIMIT 10`)
	if err != nil {
		return i18n.TL(loc, "query_accounts_error")
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
		return i18n.TL(loc, "no_accounts")
	}

	return i18n.TL(loc, "account_list_header") + "\n\n" + strings.Join(accounts, "\n") +
		i18n.TL(loc, "account_list_footer")
}

func (h *AgentHandler) handleResourceIntent(loc i18n.Locale, msg string) string {
	running := i18n.TL(loc, "resource_running")
	stopped := i18n.TL(loc, "resource_stopped")
	return i18n.TL(loc, "resource_list") + "\n\n" +
		"🟢 **prod-web-server** (Azure VM) - eastus - " + running + "\n" +
		"🟢 **dev-database** (Tencent Cloud DB) - ap-guangzhou - " + running + "\n" +
		"⚪ **staging-k8s** (Oracle K8s) - ap-tokyo - " + stopped + "\n" +
		"🟢 **blog-api** (Render Web) - oregon - " + running + "\n\n" +
		i18n.TL(loc, "resource_list_footer")
}

func (h *AgentHandler) handleCreateIntent(loc i18n.Locale, msg string) string {
	hasVM := strings.Contains(strings.ToLower(msg), "vm") || strings.Contains(msg, "虚拟机")
	hasDB := strings.Contains(strings.ToLower(msg), "数据库") || strings.Contains(strings.ToLower(msg), "database")

	plan := i18n.TL(loc, "plan_header") + "\n\n"

	if hasVM {
		plan += i18n.TL(loc, "plan_create_vm") + "\n\n"
	} else if hasDB {
		plan += i18n.TL(loc, "plan_create_db") + "\n\n"
	} else {
		plan += i18n.TL(loc, "plan_create_generic") + "\n\n"
	}

	plan += i18n.TL(loc, "plan_confirm")

	return plan
}

func (h *AgentHandler) Execute(c *gin.Context) {
	var req struct {
		PlanID    string `json:"plan_id" binding:"required"`
		Confirmed bool   `json:"confirmed"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing plan_id"})
		return
	}

	if !req.Confirmed {
		c.JSON(http.StatusOK, gin.H{"message": i18n.T(c, "exec_cancelled")})
		return
	}

	log.Printf("Executing plan: %s", req.PlanID)
	c.JSON(http.StatusOK, gin.H{
		"message": i18n.T(c, "exec_started"),
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "query_failed")})
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
		c.JSON(http.StatusInternalServerError, gin.H{"error": i18n.T(c, "query_failed")})
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
