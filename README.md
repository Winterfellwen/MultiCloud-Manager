# MultiCloud Manager — 多云管理平台

统一管理 Azure、腾讯云、Oracle Cloud、Render 资源的 Web + 微信小程序双端平台，具备 AI 云助手、后台定时同步、资源删除审计等能力。

## 项目架构

```
multicloud-manager/
├── backend/                     # Go 后端服务
│   ├── main.go                 # 入口文件
│   ├── config/config.go        # 配置管理（环境变量）
│   ├── render.yaml             # Render 部署配置
│   ├── internal/
│   │   ├── api/                # API 路由 & 处理器
│   │   │   ├── routes.go       # 路由注册
│   │   │   ├── agent.go        # AI 聊天 + 规则引擎兜底
│   │   │   ├── agent_config.go # AI 配置 CRUD + LLM 调用
│   │   │   ├── accounts.go     # 云账户管理
│   │   │   ├── resources.go    # 资源缓存读取/同步
│   │   │   ├── stats.go        # Dashboard 统计
│   │   │   └── auth.go         # 认证中间件
│   │   ├── agent/              # AI Agent 编排层（规划中）
│   │   ├── cloud/              # 多云适配层
│   │   │   ├── syncer.go       # 后台定时同步引擎
│   │   │   ├── providers/      # 各云平台 Provider
│   │   │   │   ├── azure.go    # Azure (OAuth2)
│   │   │   │   ├── tencent.go  # 腾讯云 (TC3-HMAC-SHA256)
│   │   │   │   ├── oracle.go   # Oracle Cloud (OCI RSA-SHA256)
│   │   │   │   └── render.go   # Render (Bearer Token)
│   │   │   └── types/types.go  # 统一资源模型
│   │   ├── services/
│   │   │   └── database.go     # DB 连接 + 自动迁移
│   │   └── vault/              # Agent Vault 客户端（规划中）
│   └── static/index.html       # Web 桌面版 SPA
├── web/index.html              # 同上，本地预览用
├── miniprogram/                 # 微信小程序
│   ├── app.js / app.json       # 小程序入口 & 配置
│   ├── pages/                  # 页面文件
│   │   ├── dashboard/          # 仪表盘
│   │   ├── accounts/           # 云账户
│   │   ├── resources/          # 资源列表
│   │   ├── agent/              # AI 云助手
│   │   └── mine/               # 个人中心
│   ├── components/             # 组件
│   ├── styles/tokens.wxss      # 设计 Token（暗色/浅色双主题）
│   └── utils/                  # 工具函数
└── vault/                      # Agent Vault 凭证代理（规划中）
    ├── Dockerfile
    ├── vault.hcl
    └── init.sh
```

## 当前状态

**生产地址**: <https://multicloud-backend-qw9d.onrender.com>
**技术栈**: Go 1.21 + Gin + PostgreSQL + Redis，部署在 Render（Singapore 免费套餐）

### ✅ 已完成

| 模块 | 状态 | 说明 |
|------|------|------|
| **Web SPA 前端** | ✅ 完成 | 7 页面响应式 SPA（仪表盘/资源/账户/Terraform/团队/AI 聊天/设置） |
| **暗色/浅色双主题** | ✅ 完成 | CSS 变量 + localStorage 持久化，默认暗色 |
| **微信小程序** | ✅ 完成 | 28 个 WXSS 文件双主题重写 + 设计 Token 统一 |
| **仪表盘** | ✅ 完成 | 统计卡片（账户/资源/成员/Terraform），调 `/api/stats` |
| **云账户管理** | ✅ 完成 | 增删改查 + 加密凭证存储 |
| **资源管理** | ✅ 完成 | 缓存优先读取 + 手动/定时同步 + 筛选/搜索/操作 |
| **后台同步引擎** | ✅ 完成 | goroutine 每 60s 定时同步，外部删除自动记入审计表 |
| **资源删除审计** | ✅ 完成 | `resource_deletions` 表记录手动删除和外删检测 |
| **AI 云助手** | ✅ 完成 | 可配置 LLM（API 端点 / 模型 / Key / Reasoning），失败时规则引擎兜底 |
| **AI 配置 UI** | ✅ 完成 | 聊天页齿轮弹窗，配置端点/模型/Key/Reasoning |
| **Azure Provider** | ✅ 完成 | OAuth2 认证，获取 VM 列表 |
| **腾讯云 Provider** | ✅ 完成 | TC3-HMAC-SHA256 签名，获取 CVM 列表 |
| **Oracle Provider** | ✅ 完成 | OCI RSA-SHA256 签名，获取实例列表 |
| **Render Provider** | ✅ 完成 | Bearer Token，列出 Web Service + PostgreSQL + Key Value |
| **9 张数据库表** | ✅ 完成 | 全部自动迁移创建（users, teams, cloud_accounts, ai_agent_sessions, ai_agent_messages, ai_agent_plans, resources_cache, resource_deletions, ai_config）|
| **Auth 中间件** | ✅ 完成 | no-op，预留 JWT 验证入口 |
| **健康检查** | ✅ 完成 | `/api/health` |

### 🚧 开发中 / 待实现

| 模块 | 状态 | 说明 |
|------|------|------|
| AI Agent 编排层 | 🚧 规划 | 意图解析、方案生成、风险审查 Pipeline |
| Agent Vault 凭证代理 | 🚧 规划 | HashiCorp Vault 凭征注入框架 |
| Terraform 执行器 | 🚧 规划 | 模板管理 + Plan/Apply |
| 团队管理 | 🚧 占位 | 基础路由 + 空返回 |
| 微信登录 | 🚧 占位 | 路由已注册，待集成 |
| 真实 JWT 认证 | 🚧 预留 | AuthMiddleware 当前为 no-op |
| LLM 流式响应 (SSE) | 📋 待办 | 当前为一次性回复 |

## 技术细节

### 云平台 Provider

| 云平台 | 认证方式 | 列出资源 |
|--------|----------|----------|
| **Azure** | OAuth2 (client_credentials) | Virtual Machines |
| **腾讯云** | TC3-HMAC-SHA256 | CVM Instances |
| **Oracle Cloud** | OCI RSA-SHA256 (API Key 签名) | Compute Instances |
| **Render** | Bearer Token | Web Services + PostgreSQL + Key Value |

所有 Provider 实现 `types.Provider` 接口，统一返回 `[]types.Instance`。

### 同步引擎

- **定时同步**: goroutine 每 60s 遍历所有活跃账户，调用各 Provider 的 `ListInstances` API
- **缓存优先**: `GET /resources/` 直接读 `resources_cache` 表（毫秒级），不调用云 API
- **手动同步**: `POST /resources/sync` 触发即时同步，返回最新资源列表
- **外删检测**: 同步时比较云 API 返回 vs 缓存，缺失资源自动记入 `resource_deletions` 表（deletion_type = 'external'）
- **容错**: 单个 Provider 失败不影响其他 Provider 同步

### AI 云助手

- **配置优先**: 在 DB `ai_config` 表读取 API 端点/模型/Key/Reasoning 配置
- **真实 LLM 调用**: OpenAI 兼容 API (`POST {endpoint}/chat/completions`)，支持 reasoning_effort 参数
- **兜底策略**: LLM 调用失败或未配置 Key 时，使用内置关键词匹配规则引擎回复
- **前端 5 秒超时**: 所有 API 调用 5 秒无响应自动 fallback 到 mock 数据

### Render 部署

- **服务类型**: Web Service（Go binary）
- **区域**: Singapore（`singapore`）
- **套餐**: Free（自动休眠）
- **冷启动**: 首次请求触发启动（约 15-30s），DB 连接重试 10 次
- **环境变量**: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `ENCRYPTION_KEY` 等
- **数据库**: Render PostgreSQL 16 + Redis 8（均为 Singapore 区域）

### 数据库表结构

| 表 | 用途 |
|----|------|
| `users` | 微信用户信息 |
| `teams` | 团队管理 |
| `cloud_accounts` | 云账户（加密凭证存储） |
| `ai_agent_sessions` | AI 对话会话 |
| `ai_agent_messages` | AI 对话消息 |
| `ai_agent_plans` | AI 执行计划 |
| `resources_cache` | 资源缓存（来源: 云 API 定时同步） |
| `resource_deletions` | 资源删除审计日志 |
| `ai_config` | AI 模型配置（单行） |

### 本地开发

```bash
# 后端（默认端口 8080）
cd backend
$env:DATABASE_URL = "postgres://..."
$env:REDIS_URL = "redis://..."
go run main.go

# Web 前端
open web/index.html     # 纯静态，直接打开
# 或
open backend/static/index.html  # 通过 Go serve

# 微信小程序
# 使用微信开发者工具导入 miniprogram/
```

默认配置: 无 DB/Redis 时以降级模式运行，所有数据使用前端 mock。

## 许可证

MIT License
