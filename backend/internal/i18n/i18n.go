package i18n

import (
	"fmt"
	"strings"

	"github.com/gin-gonic/gin"
)

type Locale string

const (
	Zh Locale = "zh"
	En Locale = "en"
)

var messages = map[Locale]map[string]string{
	Zh: {
		"msg_required":         "请输入消息",
		"missing_params":       "缺少必要参数",
		"invalid_params":       "参数错误",
		"save_ok":              "已保存",
		"save_failed":          "保存失败",
		"query_failed":         "查询失败",
		"delete_failed":        "删除失败",
		"create_failed":        "创建失败",
		"exec_cancelled":       "执行已取消，需要确认后才能执行",
		"exec_started":         "执行已启动",
		"no_accounts":          "还没有添加任何云账户。在「账户」标签页中可以添加 Azure、腾讯云、Oracle Cloud 或 Render 账户。",
		"query_accounts_error": "查询账户时出错，请稍后重试。",
		"dev_no_accounts":      "开发模式下暂无账户数据。连接数据库后可查看真实账户列表。",
		"account_list_header":  "**已连接的云账户**：",
		"account_list_footer":  "\n\n你可以在「账户」标签页管理这些账户。",
		"resource_list":        "**当前资源列表**：",
		"resource_list_footer": "\n\n在「资源」标签页可以执行启动/停止操作。",
		"plan_header":          "**执行方案生成**：\n\n📋 **风险评估**：🟡 中等风险（涉及资源创建，可能产生费用）",
		"plan_create_vm":       "**方案**：创建虚拟机\n• 云平台：Azure（推荐，资源最充足）\n• 规格：Standard_B1s (1 vCPU, 1 GB RAM)\n• 系统：Ubuntu 22.04 LTS\n• 预估费用：约 $0.01/小时",
		"plan_create_db":       "**方案**：创建数据库实例\n• 云平台：腾讯云\n• 规格：MySQL 5.7, 1核2GB\n• 存储：50 GB SSD\n• 预估费用：约 ¥0.3/小时",
		"plan_create_generic":  "**方案**：创建云资源\n• 请指定具体资源类型（VM / 数据库 / Kubernetes 等）",
		"plan_confirm":         "\n\n⚠️ **注意**：此操作将在云平台产生实际费用。请确认是否继续？\n回复「确认创建」即可执行。",
		"welcome":              "你好！我是 MultiCloud AI Agent，可以帮你管理多云资源。\n\n你可以：\n• **查看账户** - 管理已连接的云平台\n• **查看资源** - 列出所有虚拟机、数据库等\n• **创建资源** - 新建 VM 或部署服务\n• **执行操作** - 启动/停止/重启资源\n\n需要帮助的话，请直接告诉我。",
		"help":                 "**可用命令**：\n• 查看所有云账户\n• 列出所有资源\n• 创建一个新的虚拟机\n• 启动/停止某个资源\n• 查看某个资源的详细信息",
		"default_reply":        "收到你的指令：「%s」\n\n我可以帮你处理以下类型的请求：\n• 云账户管理（添加/查看/删除）\n• 资源管理（列表/启动/停止）\n• 新建资源（VM、数据库等）\n\n请提供更具体的指令，我会为你执行。",
		"resource_running":     "运行中",
		"resource_stopped":     "已停止",
		"plan_estimated_cost":  "预估费用",
		"plan_risk_assessment": "风险评估",
	},
	En: {
		"msg_required":         "Please enter a message",
		"missing_params":       "Missing required parameters",
		"invalid_params":       "Invalid parameters",
		"save_ok":              "Saved successfully",
		"save_failed":          "Failed to save",
		"query_failed":         "Query failed",
		"delete_failed":        "Delete failed",
		"create_failed":        "Create failed",
		"exec_cancelled":       "Execution cancelled. Confirmation is required before execution.",
		"exec_started":         "Execution started",
		"no_accounts":          "No cloud accounts added yet. Go to the Accounts tab to add Azure, Tencent Cloud, Oracle Cloud, or Render accounts.",
		"query_accounts_error": "Error querying accounts. Please try again later.",
		"dev_no_accounts":      "No account data in dev mode. Connect to a database to see real accounts.",
		"account_list_header":  "**Connected Cloud Accounts**:",
		"account_list_footer":  "\n\nYou can manage these accounts in the Accounts tab.",
		"resource_list":        "**Current Resources**:",
		"resource_list_footer": "\n\nGo to the Resources tab to start/stop instances.",
		"plan_header":          "**Plan Generated**:\n\n📋 **Risk Assessment**: 🟡 Medium Risk (resource creation may incur costs)",
		"plan_create_vm":       "**Plan**: Create Virtual Machine\n• Cloud: Azure (recommended)\n• Spec: Standard_B1s (1 vCPU, 1 GB RAM)\n• OS: Ubuntu 22.04 LTS\n• Est. Cost: ~$0.01/hr",
		"plan_create_db":       "**Plan**: Create Database\n• Cloud: Tencent Cloud\n• Spec: MySQL 5.7, 1C2GB\n• Storage: 50 GB SSD\n• Est. Cost: ~¥0.3/hr",
		"plan_create_generic":  "**Plan**: Create Cloud Resource\n• Please specify the resource type (VM / Database / Kubernetes, etc.)",
		"plan_confirm":         "\n\n⚠️ **Note**: This operation will incur actual costs on the cloud platform. Proceed?\nReply 'confirm' to execute.",
		"welcome":              "Hello! I am the MultiCloud AI Agent, here to help you manage multi-cloud resources.\n\nYou can:\n• **View Accounts** - manage connected cloud platforms\n• **View Resources** - list all VMs, databases, etc.\n• **Create Resources** - deploy new VMs or services\n• **Execute Actions** - start/stop/restart resources\n\nHow can I help you today?",
		"help":                 "**Available Commands**:\n• View all cloud accounts\n• List all resources\n• Create a new VM\n• Start/stop a resource\n• View resource details",
		"default_reply":        "Got your message: 「%s」\n\nI can help with:\n• Cloud account management (add/view/delete)\n• Resource management (list/start/stop)\n• Create new resources (VM, database, etc.)\n\nPlease provide more specific instructions.",
		"resource_running":     "running",
		"resource_stopped":     "stopped",
		"plan_estimated_cost":  "Estimated Cost",
		"plan_risk_assessment": "Risk Assessment",
	},
}

func DetectLocale(c *gin.Context) Locale {
	if c == nil {
		return Zh
	}
	lang := c.Query("lang")
	if lang == "en" {
		return En
	}
	accept := c.GetHeader("Accept-Language")
	if strings.HasPrefix(accept, "en") {
		return En
	}
	cookie, _ := c.Cookie("lang")
	if cookie == "en" {
		return En
	}
	return Zh
}

func T(c *gin.Context, key string, args ...interface{}) string {
	return TL(DetectLocale(c), key, args...)
}

func TL(locale Locale, key string, args ...interface{}) string {
	msg, ok := messages[locale][key]
	if !ok {
		msg, ok = messages[Zh][key]
		if !ok {
			return key
		}
	}
	if len(args) > 0 {
		return fmt.Sprintf(msg, args...)
	}
	return msg
}

var SystemPrompt = map[Locale]string{
	Zh: `你是 MultiCloud Manager 的 AI 云助手，帮助用户管理多云资源（Azure、腾讯云、Oracle Cloud、Render）。

你的能力：
- 查看云账户列表和状态
- 查看所有已同步的云资源（按云平台分组显示）
- 启动、停止、重启虚拟机（VM）
- 创建新的云资源（生成方案供确认）
- 回答云平台相关问题（定价、免费层、最佳实践等）
- 提供资源推荐和建议

工作方式：
- 简单查询（查看资源、查看账户等）直接执行，不需要确认
- 操作类任务（启动/停止VM）直接执行
- 创建类任务先生成方案供用户确认
- 复杂问题和咨询类问题基于你的知识回答

请用中文回复，保持简洁专业。对于不确定的信息，明确告知用户。`,
	En: `You are the AI assistant for MultiCloud Manager, helping users manage multi-cloud resources (Azure, Tencent Cloud, Oracle Cloud, Render).

Your capabilities:
- View cloud accounts and their status
- List all synced cloud resources (grouped by cloud platform)
- Start, stop, and restart virtual machines (VMs)
- Create new cloud resources (generate plan for confirmation)
- Answer cloud platform questions (pricing, free tiers, best practices)
- Provide resource recommendations and advice

How you work:
- Simple queries (list resources, list accounts) are executed directly
- Operations (start/stop VM) are executed directly
- Creation tasks generate a plan for user confirmation first
- Complex questions and consultations are answered based on your knowledge

Respond in English, be concise and professional. Clearly inform users when you're uncertain about information.`,
}
