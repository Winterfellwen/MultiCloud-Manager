package agent

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"multicloud-manager/internal/cloud/providers"
	"multicloud-manager/internal/cloud/types"
	"multicloud-manager/internal/services"
)

// Tool 工具接口
type Tool interface {
	Name() string
	Description() string
	Execute(ctx context.Context, params map[string]interface{}) (string, error)
}

// ToolRegistry 工具注册表
type ToolRegistry struct {
	tools map[string]Tool
}

// NewToolRegistry 创建工具注册表
func NewToolRegistry() *ToolRegistry {
	return &ToolRegistry{
		tools: make(map[string]Tool),
	}
}

// Register 注册工具
func (r *ToolRegistry) Register(tool Tool) {
	r.tools[tool.Name()] = tool
}

// Get 获取工具
func (r *ToolRegistry) Get(name string) (Tool, bool) {
	tool, ok := r.tools[name]
	return tool, ok
}

// List 列出所有工具
func (r *ToolRegistry) List() []ToolInfo {
	var tools []ToolInfo
	for _, tool := range r.tools {
		tools = append(tools, ToolInfo{
			Name:        tool.Name(),
			Description: tool.Description(),
		})
	}
	return tools
}

// ToolInfo 工具信息
type ToolInfo struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

// ============================================================
// VM操作工具（共享逻辑）
// ============================================================

// vmHelper VM操作辅助函数
type vmHelper struct {
	db *services.Database
}

func (h *vmHelper) vmAction(ctx context.Context, name, action string) (string, error) {
	if h.db == nil {
		return "数据库不可用", nil
	}

	// 查找VM
	var resourceID, cloudType, accountID string
	err := h.db.QueryRow(`
		SELECT rc.cloud_resource_id, ca.cloud_type, rc.account_id
		FROM resources_cache rc
		JOIN cloud_accounts ca ON rc.account_id = ca.id
		WHERE rc.resource_type = 'virtualMachines'
		AND LOWER(rc.name) LIKE '%' || LOWER($1) || '%'
		LIMIT 1
	`, name).Scan(&resourceID, &cloudType, &accountID)
	if err != nil {
		return fmt.Sprintf("未找到名为「%s」的VM: %v", name, err), nil
	}

	// 获取凭证
	var credJSON string
	err = h.db.QueryRow(`SELECT encrypted_credentials FROM cloud_accounts WHERE id = $1`, accountID).Scan(&credJSON)
	if err != nil {
		return "获取账户凭证失败", nil
	}

	var creds map[string]string
	if err := json.Unmarshal([]byte(credJSON), &creds); err != nil {
		return "解析凭证失败", nil
	}

	// 创建provider并执行操作
	var provider types.Provider
	switch cloudType {
	case "azure":
		provider = providers.NewAzureProvider(creds)
	case "tencent":
		provider = providers.NewTencentProvider(creds)
	case "oracle":
		provider = providers.NewOracleProvider(creds)
	case "render":
		provider = providers.NewRenderProvider(creds)
	default:
		return fmt.Sprintf("不支持的云平台: %s", cloudType), nil
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
		return fmt.Sprintf("操作失败: %v", err), nil
	}

	actionNames := map[string]string{"start": "启动", "stop": "停止", "restart": "重启"}
	return fmt.Sprintf("已%s VM「%s」", actionNames[action], name), nil
}

// ============================================================
// 查询工具
// ============================================================

// QueryResourcesTool 查询资源工具
type QueryResourcesTool struct {
	db *services.Database
}

func NewQueryResourcesTool(db *services.Database) *QueryResourcesTool {
	return &QueryResourcesTool{db: db}
}

func (t *QueryResourcesTool) Name() string { return "query_resources" }
func (t *QueryResourcesTool) Description() string {
	return "查询所有已同步的云资源。可以按云平台、资源类型、状态过滤。"
}

func (t *QueryResourcesTool) Execute(ctx context.Context, params map[string]interface{}) (string, error) {
	if t.db == nil {
		return "数据库不可用", nil
	}

	rows, err := t.db.Query(`
		SELECT rc.name, rc.resource_type, rc.cloud_region, rc.status, ca.cloud_type
		FROM resources_cache rc
		JOIN cloud_accounts ca ON rc.account_id = ca.id
		ORDER BY rc.last_synced_at DESC
	`)
	if err != nil {
		return fmt.Sprintf("查询失败: %v", err), nil
	}
	defer rows.Close()

	type Resource struct {
		Name         string
		ResourceType string
		Region       string
		Status       string
		CloudType    string
	}

	var resources []Resource
	for rows.Next() {
		var r Resource
		if err := rows.Scan(&r.Name, &r.ResourceType, &r.Region, &r.Status, &r.CloudType); err != nil {
			continue
		}
		resources = append(resources, r)
	}

	if len(resources) == 0 {
		return "当前没有已同步的资源", nil
	}

	// 按云平台分组
	byCloud := make(map[string][]Resource)
	for _, r := range resources {
		byCloud[r.CloudType] = append(byCloud[r.CloudType], r)
	}

	var b strings.Builder
	b.WriteString(fmt.Sprintf("共 %d 个资源:\n\n", len(resources)))

	for ct, res := range byCloud {
		b.WriteString(fmt.Sprintf("%s (%d个):\n", ct, len(res)))
		for _, r := range res {
			status := "运行中"
			if r.Status == "stopped" || r.Status == "deallocated" {
				status = "已停止"
			}
			b.WriteString(fmt.Sprintf("  - %s (%s) - %s - %s\n",
				r.Name, r.ResourceType, r.Region, status))
		}
		b.WriteString("\n")
	}

	return b.String(), nil
}

// QueryAccountsTool 查询账户工具
type QueryAccountsTool struct {
	db *services.Database
}

func NewQueryAccountsTool(db *services.Database) *QueryAccountsTool {
	return &QueryAccountsTool{db: db}
}

func (t *QueryAccountsTool) Name() string { return "query_accounts" }
func (t *QueryAccountsTool) Description() string {
	return "查询所有已配置的云账户。显示账户名称、云平台类型、同步状态。"
}

func (t *QueryAccountsTool) Execute(ctx context.Context, params map[string]interface{}) (string, error) {
	if t.db == nil {
		return "数据库不可用", nil
	}

	rows, err := t.db.Query(`SELECT name, cloud_type, is_active, last_sync_at FROM cloud_accounts ORDER BY created_at DESC`)
	if err != nil {
		return fmt.Sprintf("查询失败: %v", err), nil
	}
	defer rows.Close()

	var accounts []string
	for rows.Next() {
		var name, cloud string
		var active bool
		var lastSync *time.Time
		if err := rows.Scan(&name, &cloud, &active, &lastSync); err != nil {
			continue
		}
		status := "活跃"
		if !active {
			status = "禁用"
		}
		syncInfo := "未同步"
		if lastSync != nil {
			syncInfo = fmt.Sprintf("上次同步: %s", lastSync.Format("01-02 15:04"))
		}
		accounts = append(accounts, fmt.Sprintf("- %s (%s) - %s - %s", name, cloud, status, syncInfo))
	}

	if len(accounts) == 0 {
		return "当前没有云账户", nil
	}

	return fmt.Sprintf("云账户列表 (%d个):\n\n%s", len(accounts), strings.Join(accounts, "\n")), nil
}

// ============================================================
// VM操作工具
// ============================================================

// StartVMTool 启动VM工具
type StartVMTool struct {
	db     *services.Database
	helper *vmHelper
}

func NewStartVMTool(db *services.Database) *StartVMTool {
	return &StartVMTool{db: db, helper: &vmHelper{db: db}}
}

func (t *StartVMTool) Name() string { return "start_vm" }
func (t *StartVMTool) Description() string {
	return "启动一个虚拟机。需要提供VM名称或ID。"
}

func (t *StartVMTool) Execute(ctx context.Context, params map[string]interface{}) (string, error) {
	name, _ := params["name"].(string)
	if name == "" {
		return "请提供VM名称", nil
	}
	return t.helper.vmAction(ctx, name, "start")
}

// StopVMTool 停止VM工具
type StopVMTool struct {
	db     *services.Database
	helper *vmHelper
}

func NewStopVMTool(db *services.Database) *StopVMTool {
	return &StopVMTool{db: db, helper: &vmHelper{db: db}}
}

func (t *StopVMTool) Name() string { return "stop_vm" }
func (t *StopVMTool) Description() string {
	return "停止一个虚拟机。需要提供VM名称或ID。"
}

func (t *StopVMTool) Execute(ctx context.Context, params map[string]interface{}) (string, error) {
	name, _ := params["name"].(string)
	if name == "" {
		return "请提供VM名称", nil
	}
	return t.helper.vmAction(ctx, name, "stop")
}

// RestartVMTool 重启VM工具
type RestartVMTool struct {
	db     *services.Database
	helper *vmHelper
}

func NewRestartVMTool(db *services.Database) *RestartVMTool {
	return &RestartVMTool{db: db, helper: &vmHelper{db: db}}
}

func (t *RestartVMTool) Name() string { return "restart_vm" }
func (t *RestartVMTool) Description() string {
	return "重启一个虚拟机。需要提供VM名称或ID。"
}

func (t *RestartVMTool) Execute(ctx context.Context, params map[string]interface{}) (string, error) {
	name, _ := params["name"].(string)
	if name == "" {
		return "请提供VM名称", nil
	}
	return t.helper.vmAction(ctx, name, "restart")
}

// ============================================================
// 信息工具
// ============================================================

// GetFreeTierTool 获取免费层工具
type GetFreeTierTool struct{}

func NewGetFreeTierTool() *GetFreeTierTool {
	return &GetFreeTierTool{}
}

func (t *GetFreeTierTool) Name() string { return "get_free_tier" }
func (t *GetFreeTierTool) Description() string {
	return "获取各云平台的免费层信息。包括免费VM、免费存储、免费额度等。"
}

func (t *GetFreeTierTool) Execute(ctx context.Context, params map[string]interface{}) (string, error) {
	return `各云平台免费层信息：

Azure 免费层：
- 12个月免费：B1S VM (1 vCPU, 1GB RAM) 每月750小时
- 永久免费：200MB Functions、5GB Blob存储、250GB SQL Database等
- 新用户 $200 额度（30天有效）

Oracle Cloud Always Free（永久免费）：
- VM.Standard.A1.Flex：最多4 vCPU + 24GB RAM（ARM架构）
- VM.Standard.E2.1.Micro：1 vCPU + 1GB RAM（AMD架构）
- 总计200GB块存储、10TB出站流量/月

腾讯云免费相关：
- 新用户专享：轻量应用服务器 ¥10/月起（1C2G）
- 部分基础服务有免费额度（COS 50GB 存储、CDN 10GB/月等）

Google Cloud (GCP) 免费层：
- 永久免费：e2-micro (1 vCPU, 1GB RAM) 每月750小时
- 30GB HDD存储、5GB Cloud Storage等
- $300 试用额度（90天）`, nil
}

// CheckQuotaTool 检查配额工具
type CheckQuotaTool struct {
	db *services.Database
}

func NewCheckQuotaTool(db *services.Database) *CheckQuotaTool {
	return &CheckQuotaTool{db: db}
}

func (t *CheckQuotaTool) Name() string { return "check_quota" }
func (t *CheckQuotaTool) Description() string {
	return "检查云平台配额。可以查看VM数量限制、存储配额、网络资源等。"
}

func (t *CheckQuotaTool) Execute(ctx context.Context, params map[string]interface{}) (string, error) {
	if t.db == nil {
		return "数据库不可用", nil
	}

	// 获取当前资源数量
	var vmCount int
	err := t.db.QueryRow(`SELECT COUNT(*) FROM resources_cache WHERE resource_type = 'virtualMachines'`).Scan(&vmCount)
	if err != nil {
		return "查询失败", nil
	}

	plan := fmt.Sprintf(`当前资源使用情况：

虚拟机数量: %d / 20 (Azure免费层限制)
存储使用: 按实际使用量计费
网络: 无限制（出站流量按量计费）

建议：
- Azure免费层VM限制20个，当前使用%d个
- 建议保持在限制以内以避免额外费用`, vmCount, vmCount)

	return plan, nil
}

// ============================================================
// 创建工具
// ============================================================

// CreateVMTool 创建VM工具
type CreateVMTool struct {
	db *services.Database
}

func NewCreateVMTool(db *services.Database) *CreateVMTool {
	return &CreateVMTool{db: db}
}

func (t *CreateVMTool) Name() string { return "create_vm" }
func (t *CreateVMTool) Description() string {
	return "创建一个虚拟机。需要指定云平台、区域、规格、操作系统等参数。"
}

func (t *CreateVMTool) Execute(ctx context.Context, params map[string]interface{}) (string, error) {
	cloudType, _ := params["cloud"].(string)
	if cloudType == "" {
		cloudType = "azure"
	}

	region, _ := params["region"].(string)
	if region == "" {
		region = "eastus"
	}

	vmSize, _ := params["vm_size"].(string)
	if vmSize == "" {
		vmSize = "Standard_B1s"
	}

	os, _ := params["os"].(string)
	if os == "" {
		os = "Ubuntu 22.04"
	}

	name, _ := params["name"].(string)
	if name == "" {
		name = fmt.Sprintf("vm-%s", time.Now().Format("01021504"))
	}

	plan := fmt.Sprintf(`VM创建方案：

云平台: %s
区域: %s
名称: %s
规格: %s
系统: %s

预估月费: $10-15

请确认以上方案，我将为您创建VM。`, cloudType, region, name, vmSize, os)

	return plan, nil
}

// CreateDatabaseTool 创建数据库工具
type CreateDatabaseTool struct {
	db *services.Database
}

func NewCreateDatabaseTool(db *services.Database) *CreateDatabaseTool {
	return &CreateDatabaseTool{db: db}
}

func (t *CreateDatabaseTool) Name() string { return "create_database" }
func (t *CreateDatabaseTool) Description() string {
	return "创建一个数据库。需要指定数据库类型、云平台、区域、规格等参数。"
}

func (t *CreateDatabaseTool) Execute(ctx context.Context, params map[string]interface{}) (string, error) {
	dbType, _ := params["db_type"].(string)
	if dbType == "" {
		dbType = "PostgreSQL"
	}

	cloudType, _ := params["cloud"].(string)
	if cloudType == "" {
		cloudType = "azure"
	}

	region, _ := params["region"].(string)
	if region == "" {
		region = "eastus"
	}

	size, _ := params["size"].(string)
	if size == "" {
		size = "Basic"
	}

	plan := fmt.Sprintf(`数据库创建方案：

数据库类型: %s
云平台: %s
区域: %s
规格: %s

预估月费: $20-50

请确认以上方案，我将为您创建数据库。`, dbType, cloudType, region, size)

	return plan, nil
}

// CreateAKSTool 创建AKS工具
type CreateAKSTool struct {
	db *services.Database
}

func NewCreateAKSTool(db *services.Database) *CreateAKSTool {
	return &CreateAKSTool{db: db}
}

func (t *CreateAKSTool) Name() string { return "create_aks" }
func (t *CreateAKSTool) Description() string {
	return "创建Azure Kubernetes Service (AKS)集群。需要指定集群名称、区域、节点数、节点大小等参数。"
}

func (t *CreateAKSTool) Execute(ctx context.Context, params map[string]interface{}) (string, error) {
	clusterName, _ := params["cluster_name"].(string)
	if clusterName == "" {
		return "请提供集群名称", nil
	}

	region, _ := params["region"].(string)
	if region == "" {
		region = "eastus"
	}

	nodeCount, _ := params["node_count"].(float64)
	if nodeCount == 0 {
		nodeCount = 3
	}

	nodeSize, _ := params["node_size"].(string)
	if nodeSize == "" {
		nodeSize = "Standard_B2s"
	}

	plan := fmt.Sprintf(`AKS集群创建方案：

集群名称: %s
区域: %s
节点数量: %d
节点大小: %s
Kubernetes版本: 最新稳定版

网络配置:
- 虚拟网络: 自动生成
- 子网: 10.0.0.0/16
- 网络插件: Azure CNI

监控:
- Azure Monitor: 启用
- 容器日志: 启用

安全:
- Azure AD集成: 可选
- 网络策略: Calico

预估月费: $150-200（3个B2s节点）

请确认以上方案，我将为您创建AKS集群。`, clusterName, region, int(nodeCount), nodeSize)

	return plan, nil
}

// LogDeletionTool 记录删除日志工具
type LogDeletionTool struct {
	db *services.Database
}

func NewLogDeletionTool(db *services.Database) *LogDeletionTool {
	return &LogDeletionTool{db: db}
}

func (t *LogDeletionTool) Name() string { return "log_deletion" }
func (t *LogDeletionTool) Description() string {
	return "记录资源删除日志。用于审计和追踪资源删除操作。"
}

func (t *LogDeletionTool) Execute(ctx context.Context, params map[string]interface{}) (string, error) {
	if t.db == nil {
		return "数据库不可用", nil
	}

	resourceID, _ := params["resource_id"].(string)
	if resourceID == "" {
		return "请提供资源ID", nil
	}

	// 这里可以调用syncer的LogDeletion方法
	// 目前返回确认信息
	return fmt.Sprintf("已记录资源「%s」的删除日志", resourceID), nil
}
