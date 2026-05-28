package api

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"multicloud-manager/config"
	"multicloud-manager/internal/agent"
	"multicloud-manager/internal/i18n"
	"multicloud-manager/internal/knowledge"
	"multicloud-manager/internal/services"
	"multicloud-manager/internal/vault"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AgentHandler struct {
	db           *services.Database
	rdb          *services.RedisClient
	config       *ConfigHandler
	vault        *vault.Client
	orchestrator *agent.Orchestrator
	knowledge    *knowledge.KnowledgeService
}

func NewAgentHandler(db *services.Database, rdb *services.RedisClient, cfg *config.Config) *AgentHandler {
	h := &AgentHandler{
		db:     db,
		rdb:    rdb,
		config: NewConfigHandler(db),
	}

	// 初始化 vault 客户端 - 优先使用环境变量，否则尝试本地连接
	vaultURL := cfg.VaultURL
	vaultToken := cfg.VaultToken
	
	// 如果没有配置vault，尝试从本地docker vault获取token
	if vaultURL == "" {
		vaultURL = "http://localhost:8200"
	}
	if vaultToken == "" {
		// 尝试从vault容器获取token
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

	// 初始化 orchestrator
	llmClient := &orchestratorLLMClient{db: db, config: h.config}
	h.orchestrator = agent.NewOrchestrator(llmClient)

	// 初始化云平台知识库服务
	h.knowledge = knowledge.New()

	return h
}

// getLocalVaultToken 尝试从本地vault容器获取token
func getLocalVaultToken() (string, error) {
	// 从环境变量读取
	if token := os.Getenv("VAULT_TOKEN"); token != "" {
		return token, nil
	}
	// 尝试从docker-compose vault容器读取
	// 这里可以扩展为读取vault容器的输出
	return "", fmt.Errorf("no vault token available")
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

	// 判断是否为明确的操作请求（创建/删除/启动/停止等），否则走直接LLM对话
	actionWords := []string{"create", "delete", "start", "stop", "restart", "创建", "删除", "启动", "停止", "重启"}
	questionWords := []string{"推荐", "建议", "什么", "如何", "怎么", "哪个", "推荐一下", "介绍一下", "是什么"}
	msgLower := strings.ToLower(req.Message)

	isOperation := false
	for _, word := range actionWords {
		if strings.Contains(msgLower, word) {
			isOperation = true
			break
		}
	}
	// 如果是疑问句/咨询句，即使含操作词也不算操作请求
	if isOperation {
		for _, q := range questionWords {
			if strings.Contains(msgLower, q) {
				isOperation = false
				break
			}
		}
	}

	var reply string
	var planData *agent.ExecutionPlan

	if isOperation {
		ctx := c.Request.Context()
		plan, err := h.orchestrator.ProcessUserInput(ctx, req.Message)
		if err != nil {
			log.Printf("Orchestrator failed, falling back to direct LLM: %v", err)
			reply = h.processMessage(c, req.Message, sessionID)
		} else {
			planData = plan
			reply = h.formatPlanResponse(plan)
		}
	} else {
		reply = h.processMessage(c, req.Message, sessionID)
	}

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
		"plan":       planData,
	})
}

func (h *AgentHandler) formatPlanResponse(plan *agent.ExecutionPlan) string {
	var b strings.Builder
	b.WriteString(fmt.Sprintf("**%s**\n\n", plan.Title))

	if plan.Description != "" {
		b.WriteString(fmt.Sprintf("%s\n\n", plan.Description))
	}

	if plan.RiskSummary != nil {
		b.WriteString(fmt.Sprintf("⚠️ 风险等级: **%s**\n", plan.RiskSummary.OverallRisk))
		if len(plan.RiskSummary.Warnings) > 0 {
			b.WriteString("警告:\n")
			for _, w := range plan.RiskSummary.Warnings {
				b.WriteString(fmt.Sprintf("- %s\n", w))
			}
		}
		b.WriteString("\n")
	}

	b.WriteString(fmt.Sprintf("**执行方案 (%d 步)**\n", len(plan.Steps)))
	for i, step := range plan.Steps {
		b.WriteString(fmt.Sprintf("\n**步骤 %d:** %s\n", i+1, step.Action))
		b.WriteString(fmt.Sprintf("- 云平台: %s\n", step.Cloud))
		if step.Params != nil {
			if specs, ok := step.Params["specs"]; ok {
				b.WriteString(fmt.Sprintf("- 规格: %v\n", specs))
			}
			if region, ok := step.Params["region"]; ok {
				b.WriteString(fmt.Sprintf("- 区域: %v\n", region))
			}
			if osName, ok := step.Params["os"]; ok {
				b.WriteString(fmt.Sprintf("- 系统: %v\n", osName))
			}
		}
		if desc, ok := step.Params["description"]; ok {
			b.WriteString(fmt.Sprintf("- 说明: %v\n", desc))
		}
		if step.RiskLevel != "" {
			b.WriteString(fmt.Sprintf("- 风险: **%s**", step.RiskLevel))
			if step.RiskReason != "" {
				b.WriteString(fmt.Sprintf(" (%s)", step.RiskReason))
			}
		}
		b.WriteString("\n")
	}

	if plan.EstimatedCost > 0 {
		b.WriteString(fmt.Sprintf("\n💰 预估月费: **$%.2f**\n", plan.EstimatedCost))
	}

	if len(plan.MissingParams) > 0 {
		b.WriteString(fmt.Sprintf("\n⚠️ 缺少参数:\n"))
		for _, p := range plan.MissingParams {
			b.WriteString(fmt.Sprintf("- %s\n", p))
		}
	}
	if plan.Status == "awaiting_confirmation" {
		b.WriteString("\n> 以上方案需要您确认后才可执行。是否按此方案执行？")
	}
	return b.String()
}

func (h *AgentHandler) processMessage(c *gin.Context, msg string, sessionID string) string {
	loc := i18n.DetectLocale(c)

	if h.db != nil {
		cfg := h.config.loadConfig()
		if cfg.APIKey != "" {
			ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
			defer cancel()
			prompt := i18n.SystemPrompt[loc]

			// 注入云平台知识（定价、免费层等）
			if ctxWithTimeout, cancel := context.WithTimeout(context.Background(), 10*time.Second); true {
				if knowledge := h.knowledge.GetCloudKnowledge(ctxWithTimeout); knowledge != "" {
					prompt += "\n\n" + knowledge
				}
				cancel()
			}
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

// orchestratorLLMClient 适配 agent.LLMClient 接口
type orchestratorLLMClient struct {
	db     *services.Database
	config *ConfigHandler
}

func (c *orchestratorLLMClient) Chat(ctx context.Context, messages []agent.Message) (*agent.ChatResponse, error) {
	if c.db == nil {
		return nil, fmt.Errorf("database not available")
	}

	cfg := c.config.loadConfig()
	if cfg.APIKey == "" {
		return nil, fmt.Errorf("LLM API key not configured")
	}

	// 转换消息格式
	var msgs []string
	for _, m := range messages {
		msgs = append(msgs, m.Role+": "+m.Content)
	}

	prompt := strings.Join(msgs, "\n")
	reply, err := callLLM(ctx, cfg.APIEndpoint, cfg.Model, cfg.APIKey,
		cfg.EnableReasoning, cfg.ReasoningEffort, "", prompt)
	if err != nil {
		return nil, err
	}

	return &agent.ChatResponse{Content: reply}, nil
}
