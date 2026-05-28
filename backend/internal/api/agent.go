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
	"multicloud-manager/internal/cloud"
	"multicloud-manager/internal/cloud/providers"
	"multicloud-manager/internal/cloud/types"
	"multicloud-manager/internal/i18n"
	"multicloud-manager/internal/knowledge"
	"multicloud-manager/internal/services"
	"multicloud-manager/internal/vault"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type AgentHandler struct {
	db        *services.Database
	rdb       *services.RedisClient
	config    *ConfigHandler
	vault     *vault.Client
	syncer    *cloud.Syncer
	knowledge *knowledge.KnowledgeService
}

func NewAgentHandler(db *services.Database, rdb *services.RedisClient, cfg *config.Config) *AgentHandler {
	h := &AgentHandler{
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

	return h
}

// SetSyncer 注入同步器（由 main 启动时调用）
func (h *AgentHandler) SetSyncer(syncer *cloud.Syncer) {
	h.syncer = syncer
}

func getLocalVaultToken() (string, error) {
	if token := os.Getenv("VAULT_TOKEN"); token != "" {
		return token, nil
	}
	return "", fmt.Errorf("no vault token available")
}

// ============================================================
// Chat Handler - 核心入口
// 新架构：规则优先 → 真实数据查询 → LLM兜底
// ============================================================

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

	// 保存用户消息
	h.saveMessage(sessionID, "user", req.Message)

	// 核心路由：规则优先，LLM兜底
	reply, planData := h.routeMessage(c, req.Message, sessionID)

	// 保存AI回复
	h.saveMessage(sessionID, "agent", reply)

	c.JSON(http.StatusOK, gin.H{
		"message":    reply,
		"session_id": sessionID,
		"plan":       planData,
	})
}

// routeMessage 核心路由逻辑
func (h *AgentHandler) routeMessage(c *gin.Context, msg string, sessionID string) (string, *cloudSyncResult) {
	msgLower := strings.ToLower(strings.TrimSpace(msg))

	// ========== 第一层：精确规则匹配（不需要LLM） ==========

	// 资源查询
	if match(msgLower, "资源", "resource", "查看资源", "list resource") {
		return h.handleListResources(c, msg), nil
	}
	if match(msgLower, "账户", "account", "云账户") {
		return h.handleListAccounts(c, msg), nil
	}

	// VM操作 - 启动
	if match(msgLower, "启动", "start", "开机") && match(msgLower, "vm", "虚拟机", "服务器") {
		return h.handleVMAction(c, msg, "start"), nil
	}
	// VM操作 - 停止/关机
	if match(msgLower, "停止", "关机", "stop", "shutdown", "deallocate") && match(msgLower, "vm", "虚拟机", "服务器") {
		return h.handleVMAction(c, msg, "stop"), nil
	}
	// VM操作 - 重启
	if match(msgLower, "重启", "restart", "reboot") && match(msgLower, "vm", "虚拟机", "服务器") {
		return h.handleVMAction(c, msg, "restart"), nil
	}

	// 创建资源
	if match(msgLower, "创建", "新建", "create", "开一个") {
		return h.handleCreateResource(c, msg), nil
	}

	// 问候
	if match(msgLower, "你好", "hello", "hi", "嗨") {
		return h.getWelcome(c), nil
	}
	// 帮助
	if match(msgLower, "帮助", "help") {
		return h.getHelp(c), nil
	}

	// ========== 第二层：LLM兜底（复杂问题、推荐、咨询） ==========
	reply := h.processWithLLM(c, msg, sessionID)
	return reply, nil
}

// match 辅助函数：检查消息是否包含任一关键词
func match(msgLower string, keywords ...string) bool {
	for _, kw := range keywords {
		if strings.Contains(msgLower, kw) {
			return true
		}
	}
	return false
}

// ============================================================
// 规则处理器 - 直接查询数据库/调用云API，不经过LLM
// ============================================================

// handleListResources 真实数据：查询所有同步的资源
func (h *AgentHandler) handleListResources(c *gin.Context, msg string) string {
	if h.syncer == nil {
		return "⚠️ 同步服务未初始化，无法查询资源。"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	resources, err := h.syncer.GetResources(ctx)
	if err != nil {
		return fmt.Sprintf("⚠️ 查询资源失败: %v", err)
	}

	if len(resources) == 0 {
		return "📭 当前没有已同步的资源。请先在「云账户」页面添加账户并同步。"
	}

	// 按云平台分组
	byCloud := make(map[string][]map[string]interface{})
	for _, r := range resources {
		cloud := r["cloud_type"].(string)
		byCloud[cloud] = append(byCloud[cloud], r)
	}

	cloudNames := map[string]string{
		"azure":   "Azure",
		"tencent": "腾讯云",
		"oracle":  "Oracle Cloud",
		"render":  "Render",
	}

	var b strings.Builder
	b.WriteString(fmt.Sprintf("📦 **共 %d 个资源**\n\n", len(resources)))

	cloudOrder := []string{"azure", "tencent", "oracle", "render"}
	for _, ct := range cloudOrder {
		res, ok := byCloud[ct]
		if !ok || len(res) == 0 {
			continue
		}
		name := cloudNames[ct]
		if name == "" {
			name = ct
		}
		b.WriteString(fmt.Sprintf("### %s (%d个)\n", name, len(res)))
		for _, r := range res {
			status := "🟢"
			if s, ok := r["status"].(string); ok && (s == "stopped" || s == "deallocated") {
				status = "⚪"
			}
			b.WriteString(fmt.Sprintf("%s **%s** - %s (%s)\n",
				status,
				r["name"],
				r["region"],
				r["type"],
			))
		}
		b.WriteString("\n")
	}

	return b.String()
}

// handleListAccounts 真实数据：查询所有云账户
func (h *AgentHandler) handleListAccounts(c *gin.Context, msg string) string {
	if h.db == nil {
		return "⚠️ 数据库不可用"
	}

	rows, err := h.db.Query(`SELECT id, name, cloud_type, is_active, last_sync_at FROM cloud_accounts ORDER BY created_at DESC`)
	if err != nil {
		return fmt.Sprintf("⚠️ 查询账户失败: %v", err)
	}
	defer rows.Close()

	var accounts []string
	for rows.Next() {
		var id, name, cloud string
		var active bool
		var lastSync *time.Time
		if err := rows.Scan(&id, &name, &cloud, &active, &lastSync); err != nil {
			continue
		}
		status := "🟢"
		if !active {
			status = "⚪"
		}
		syncInfo := "未同步"
		if lastSync != nil {
			syncInfo = fmt.Sprintf("上次同步: %s", lastSync.Format("01-02 15:04"))
		}
		accounts = append(accounts, fmt.Sprintf("%s **%s** (%s) - %s", status, name, cloud, syncInfo))
	}

	if len(accounts) == 0 {
		return "📭 当前没有云账户。请先在「云账户」页面添加。"
	}

	return fmt.Sprintf("☁️ **云账户列表** (%d个)\n\n%s", len(accounts), strings.Join(accounts, "\n"))
}

// handleVMAction 真实操作：启动/停止/重启Azure VM
func (h *AgentHandler) handleVMAction(c *gin.Context, msg, action string) string {
	if h.db == nil {
		return "⚠️ 数据库不可用"
	}

	// 从消息中提取VM名称（简化：取所有资源中最匹配的）
	vmName := extractVMName(msg)
	if vmName == "" {
		// 没有指定VM名，列出所有VM让用户选择
		return h.listVMsForAction(action)
	}

	// 查找匹配的VM
	resourceID, cloudType, accountID, err := h.findVM(vmName)
	if err != nil {
		return fmt.Sprintf("⚠️ 未找到名为「%s」的VM: %v", vmName, err)
	}

	// 执行操作
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	actionNames := map[string]string{"start": "启动", "stop": "停止", "restart": "重启"}

	provider, err := h.getProvider(accountID, cloudType)
	if err != nil {
		return fmt.Sprintf("⚠️ 获取云平台连接失败: %v", err)
	}

	switch action {
	case "start":
		err = provider.StartInstance(ctx, resourceID)
	case "stop":
		err = provider.StopInstance(ctx, resourceID)
	case "restart":
		err = provider.RestartInstance(ctx, resourceID)
	}

	if err != nil {
		return fmt.Sprintf("⚠️ %s VM 失败: %v", actionNames[action], err)
	}

	return fmt.Sprintf("✅ 已%s VM **%s**，请稍等几秒钟生效。", actionNames[action], vmName)
}

// handleCreateResource 创建资源（生成方案供确认）
func (h *AgentHandler) handleCreateResource(c *gin.Context, msg string) string {
	msgLower := strings.ToLower(msg)

	// 检测资源类型
	if strings.Contains(msgLower, "vm") || strings.Contains(msgLower, "虚拟机") {
		return h.generateVMPlan(c, msg)
	}
	if strings.Contains(msgLower, "数据库") || strings.Contains(msgLower, "database") {
		return "📋 **创建数据库方案**\n\n" +
			"数据库创建需要指定以下参数：\n" +
			"- 数据库类型 (MySQL/PostgreSQL/MongoDB)\n" +
			"- 云平台 (Azure/Tencent/Oracle)\n" +
			"- 规格 (CPU/内存/存储)\n\n" +
			"请告诉我具体需求，例如：「在Azure创建一个PostgreSQL数据库，2核4G」"
	}

	return "📋 **创建资源**\n\n" +
		"支持创建的资源类型：\n" +
		"- **VM（虚拟机）** - 例如：「创建一个Azure VM」\n" +
		"- **数据库** - 例如：「创建一个PostgreSQL数据库」\n\n" +
		"请告诉我您想创建什么资源？"
}

// generateVMPlan 生成VM创建方案
func (h *AgentHandler) generateVMPlan(c *gin.Context, msg string) string {
	msgLower := strings.ToLower(msg)

	// 默认配置
	cloud := "azure"
	region := "eastus"
	vmSize := "Standard_B1s"
	os := "Ubuntu 22.04"

	// 根据消息调整
	if strings.Contains(msgLower, "腾讯") {
		cloud = "tencent"
		region = "ap-guangzhou"
	} else if strings.Contains(msgLower, "oracle") || strings.Contains(msgLower, "甲骨文") {
		cloud = "oracle"
		region = "us-ashburn-1"
	}

	// 从知识库获取定价
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	knowledge := h.knowledge.GetCloudKnowledge(ctx)

	plan := fmt.Sprintf("📋 **创建 VM 方案**\n\n"+
		"**云平台:** %s\n"+
		"**区域:** %s\n"+
		"**规格:** %s\n"+
		"**系统:** %s\n\n"+
		"**费用预估:**\n"+
		"%s\n\n"+
		"请确认以上方案，我将为您执行创建操作。",
		cloud, region, vmSize, os, knowledge)

	return plan
}

// listVMsForAction 列出所有VM供用户选择
func (h *AgentHandler) listVMsForAction(action string) string {
	if h.syncer == nil {
		return "⚠️ 同步服务未初始化"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	resources, err := h.syncer.GetResources(ctx)
	if err != nil {
		return fmt.Sprintf("⚠️ 查询资源失败: %v", err)
	}

	actionNames := map[string]string{"start": "启动", "stop": "停止", "restart": "重启"}

	var vms []string
	for _, r := range resources {
		if r["type"] == "virtualMachines" {
			status := "🟢运行中"
			if s, ok := r["status"].(string); ok && (s == "stopped" || s == "deallocated") {
				status = "⚪已停止"
			}
			vms = append(vms, fmt.Sprintf("- **%s** (%s) - %s %s",
				r["name"], r["cloud_type"], r["region"], status))
		}
	}

	if len(vms) == 0 {
		return "📭 当前没有虚拟机资源。"
	}

	return fmt.Sprintf("💻 **可操作的 VM 列表**\n\n"+
		"请告诉我您要%s哪个VM？\n\n"+
		"%s\n\n"+
		"例如：「%s prod-web-server」",
		actionNames[action], strings.Join(vms, "\n"), actionNames[action])
}

// getWelcome 欢迎语
func (h *AgentHandler) getWelcome(c *gin.Context) string {
	loc := i18n.DetectLocale(c)
	return i18n.TL(loc, "welcome")
}

// getHelp 帮助信息
func (h *AgentHandler) getHelp(c *gin.Context) string {
	return "🤖 **MultiCloud Manager AI 助手**\n\n" +
		"我可以帮您：\n\n" +
		"📦 **查看资源** - 例如：「查看资源」「列出所有资源」\n" +
		"☁️ **查看账户** - 例如：「查看账户」「云账户」\n" +
		"🚀 **启动VM** - 例如：「启动 prod-web-server」\n" +
		"⏹️ **停止VM** - 例如：「停止 prod-web-server」\n" +
		"🔄 **重启VM** - 例如：「重启 prod-web-server」\n" +
		"➕ **创建资源** - 例如：「创建一个Azure VM」\n\n" +
		"💬 **咨询问题** - 例如：「推荐一个免费的云平台」「Azure的定价是多少」\n\n" +
		"直接告诉我您想做什么，我会尽力帮助您！"
}

// ============================================================
// LLM处理 - 复杂问题、推荐、咨询
// ============================================================

func (h *AgentHandler) processWithLLM(c *gin.Context, msg string, sessionID string) string {
	loc := i18n.DetectLocale(c)

	if h.db == nil {
		return h.ruleReply(loc, msg)
	}

	cfg := h.config.loadConfig()
	if cfg.APIKey == "" {
		return h.ruleReply(loc, msg)
	}

	// 构建增强的系统提示
	systemPrompt := i18n.SystemPrompt[loc]

	// 注入云平台知识
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	if knowledge := h.knowledge.GetCloudKnowledge(ctx); knowledge != "" {
		systemPrompt += "\n\n" + knowledge
	}
	cancel()

	// 注入当前资源摘要（让LLM知道用户有什么资源）
	if h.syncer != nil {
		resCtx, resCancel := context.WithTimeout(context.Background(), 5*time.Second)
		if resources, err := h.syncer.GetResources(resCtx); err == nil && len(resources) > 0 {
			systemPrompt += "\n\n当前已同步的资源：\n"
			byCloud := make(map[string]int)
			for _, r := range resources {
				byCloud[r["cloud_type"].(string)]++
			}
			for ct, count := range byCloud {
				systemPrompt += fmt.Sprintf("- %s: %d个资源\n", ct, count)
			}
		}
		resCancel()
	}

	// 获取对话历史
	history := h.getConversationHistory(sessionID, 10)

	// 构建消息列表
	var messages []string
	messages = append(messages, "System: "+systemPrompt)

	// 添加历史对话
	for _, m := range history {
		role := "User"
		if m.Role == "agent" {
			role = "Assistant"
		}
		messages = append(messages, role+": "+m.Content)
	}

	// 添加当前消息
	messages = append(messages, "User: "+msg)

	prompt := strings.Join(messages, "\n")

	// 调用LLM
	llmCtx, llmCancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer llmCancel()

	reply, err := callLLM(llmCtx, cfg.APIEndpoint, cfg.Model, cfg.APIKey,
		cfg.EnableReasoning, cfg.ReasoningEffort, "", prompt)

	if err != nil {
		log.Printf("LLM call failed: %v", err)
		return h.ruleReply(loc, msg)
	}

	return reply
}

// ============================================================
// 辅助函数
// ============================================================

func (h *AgentHandler) saveMessage(sessionID, role, content string) {
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

type chatMsg struct {
	Role    string
	Content string
}

func (h *AgentHandler) getConversationHistory(sessionID string, limit int) []chatMsg {
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
		messages = append(messages, m)
	}

	// 反转为正序
	for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
		messages[i], messages[j] = messages[j], messages[i]
	}

	return messages
}

func (h *AgentHandler) findVM(name string) (resourceID, cloudType, accountID string, err error) {
	if h.db == nil {
		return "", "", "", fmt.Errorf("database not available")
	}

	err = h.db.QueryRow(`
		SELECT rc.cloud_resource_id, ca.cloud_type, rc.account_id
		FROM resources_cache rc
		JOIN cloud_accounts ca ON rc.account_id = ca.id
		WHERE rc.resource_type = 'virtualMachines'
		AND LOWER(rc.name) LIKE '%' || LOWER($1) || '%'
		LIMIT 1
	`, name).Scan(&resourceID, &cloudType, &accountID)

	if err != nil {
		return "", "", "", fmt.Errorf("VM not found: %w", err)
	}
	return resourceID, cloudType, accountID, nil
}

func (h *AgentHandler) getProvider(accountID, cloudType string) (types.Provider, error) {
	if h.db == nil {
		return nil, fmt.Errorf("database not available")
	}

	var credJSON string
	err := h.db.QueryRow(`SELECT encrypted_credentials FROM cloud_accounts WHERE id = $1`, accountID).Scan(&credJSON)
	if err != nil {
		return nil, fmt.Errorf("account not found: %w", err)
	}

	var creds map[string]string
	if err := json.Unmarshal([]byte(credJSON), &creds); err != nil {
		return nil, fmt.Errorf("parse credentials: %w", err)
	}

	switch cloudType {
	case "azure":
		return providers.NewAzureProvider(creds), nil
	case "tencent":
		return providers.NewTencentProvider(creds), nil
	case "oracle":
		return providers.NewOracleProvider(creds), nil
	case "render":
		return providers.NewRenderProvider(creds), nil
	default:
		return nil, fmt.Errorf("unsupported cloud: %s", cloudType)
	}
}

func extractVMName(msg string) string {
	// 简单提取：去掉常见动词，剩下的可能是VM名
	msg = strings.TrimSpace(msg)
	for _, prefix := range []string{"启动", "停止", "重启", "start", "stop", "restart", "vm", "虚拟机", "服务器", "的"} {
		msg = strings.ReplaceAll(strings.ToLower(msg), prefix, "")
	}
	msg = strings.TrimSpace(msg)
	if msg == "" {
		return ""
	}
	return msg
}

// ruleReply 规则回复（LLM不可用时的后备）
func (h *AgentHandler) ruleReply(loc i18n.Locale, msg string) string {
	msgLower := strings.ToLower(msg)

	switch {
	case strings.Contains(msgLower, "账户") || strings.Contains(msgLower, "account"):
		return h.handleListAccounts(nil, msg)
	case strings.Contains(msgLower, "资源") || strings.Contains(msgLower, "resource"):
		return h.handleListResources(nil, msg)
	case strings.Contains(msgLower, "创建") || strings.Contains(msgLower, "新建") || strings.Contains(msgLower, "vm") || strings.Contains(msgLower, "虚拟机"):
		return h.handleCreateResource(nil, msg)
	case strings.Contains(msgLower, "你好") || strings.Contains(msgLower, "hello") || strings.Contains(msgLower, "hi"):
		return h.getWelcome(nil)
	case strings.Contains(msgLower, "帮助") || strings.Contains(msgLower, "help"):
		return h.getHelp(nil)
	default:
		return i18n.TL(loc, "default_reply", msg)
	}
}

func truncate(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen]) + "..."
}

// ============================================================
// 其他端点
// ============================================================

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

// ============================================================
// 兼容旧接口（orchestrator相关，暂时保留）
// ============================================================

type cloudSyncResult struct{}

func (h *AgentHandler) formatPlanResponse(plan interface{}) string {
	return "方案已生成"
}
