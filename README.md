# MultiCloud Manager

统一管理 Azure、腾讯云、Oracle Cloud、Render 资源的 Web 平台，内置 AI 云助手，支持自然语言操作云资源。

**生产地址**: https://multicloud-backend-58m7.onrender.com/

## 功能

| 模块 | 说明 |
|------|------|
| **AI 云助手** | 自然语言对话，AI 自动调用云 API 执行操作（创建/查询/删除资源） |
| **cloud_api_request** | AI Agent 服务端代理调用云 API，凭证不暴露给前端 |
| **多云资源管理** | 统一视图查看 Azure / 腾讯云 / Oracle / Render 资源，支持筛选、搜索、操作 |
| **云账户管理** | 凭证加密存储（Vault），支持多账户 |
| **Session 隔离** | 每个用户只能看到自己的对话，管理员可查看全部 |
| **对话过滤/分页** | 按标题搜索、时间范围、排序、分页 |
| **Terraform 模板** | 模板管理 + Plan/Apply（开发中） |
| **团队管理** | 成员邀请、角色管理 |
| **仪表盘** | 账户/资源/成员/Terraform 统计概览 |
| **暗色/浅色主题** | CSS 变量 + localStorage 持久化 |

## 技术栈

- **后端**: Go 1.25 + Gin + PostgreSQL + Redis
- **前端**: 单文件 SPA（`web/index.html`），无构建步骤
- **部署**: Docker + Render（Singapore 区域）
- **认证**: JWT + bcrypt

## 快速开始

### 本地开发（Docker）

```bash
# 1. 克隆仓库
git clone https://github.com/Winterfellwen/MultiCloud-Manager.git
cd MultiCloud-Manager

# 2. （可选）自定义密钥
cp .env.example .env
# 编辑 .env 修改密码，不改也能跑（用默认开发密码）

# 3. 启动
docker compose up --build -d

# 4. 访问
open http://localhost:8099
```

默认管理员账号：`admin` / `test123`（可在 `.env` 中通过 `ADMIN_PASSWORD` 自定义）。

### Render 部署

Push 到 `main` 分支自动部署。Render 通过 `render.yaml` 配置：

- `JWT_SECRET` / `ADMIN_PASSWORD`：自动生成（`generateValue: true`）
- `DATABASE_URL`：从 Render PostgreSQL 注入
- `REDIS_URL`：从 Render Redis 注入
- 无需手动配置环境变量

## 环境变量

| 变量 | 说明 | 本地默认 | 生产 |
|------|------|----------|------|
| `DATABASE_URL` | PostgreSQL 连接串 | docker-compose 自动生成 | Render 注入 |
| `REDIS_URL` | Redis 连接串 | `redis://redis:6379/0` | Render 注入 |
| `JWT_SECRET` | JWT 签名密钥 | `dev-secret-change-in-production` | 自动生成 |
| `ADMIN_PASSWORD` | 管理员密码 | `test123` | 自动生成 |
| `ENVIRONMENT` | 运行环境 | `development` | `production` |
| `PORT` | 监听端口 | `8099` | `8099` |
| `ENCRYPTION_KEY` | Vault 加密密钥（64 位 hex） | 未设置 | 未设置 |

> 生产环境如果 `JWT_SECRET` 为默认值，服务会启动失败（安全保护）。

## 项目结构

```
MultiCloud-Manager/
├── main.go                          # 入口
├── internal/
│   ├── api/                         # HTTP 路由 & 处理器
│   │   ├── router.go               # 路由注册
│   │   ├── auth.go                 # 登录 / JWT
│   │   ├── sessions.go            # Session CRUD + 过滤/分页
│   │   ├── chat_async.go          # AI 聊天 SSE 流
│   │   ├── accounts.go            # 云账户管理
│   │   ├── resources.go           # 资源缓存 + 同步
│   │   └── middleware.go          # JWT 认证中间件
│   ├── agent/                       # AI Agent 编排
│   │   ├── executor.go             # 工具执行（含 cloud_api_request）
│   │   ├── tools.go               # 工具注册
│   │   └── prompt.go              # 系统提示词
│   ├── cloud/                       # 多云适配
│   │   ├── providers/
│   │   │   ├── azure.go           # Azure (OAuth2 + DoRawRequest)
│   │   │   ├── tencent.go         # 腾讯云 (TC3-HMAC + DoRawRequest)
│   │   │   ├── oracle.go          # Oracle (RSA-SHA256 + DoRawRequest)
│   │   │   └── render.go          # Render (Bearer + DoRawRequest)
│   │   ├── syncer.go              # 后台定时同步引擎
│   │   └── types/types.go         # 统一资源模型 + Provider 接口
│   ├── config/config.go             # 环境变量加载
│   ├── db/db.go                     # 数据库连接 + 自动迁移
│   └── vault/                       # 凭证加密存储
├── web/index.html                   # Web SPA 前端
├── docker-compose.yml               # 本地开发（读取 .env）
├── render.yaml                      # Render 部署配置
├── Dockerfile                       # 多阶段构建
└── .env.example                     # 环境变量模板
```

## API 概览

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录，返回 JWT |
| GET | `/api/agent/sessions` | 会话列表（支持 `?q=` `?sort=` `?page=` 等） |
| POST | `/api/agent/sessions` | 创建会话 |
| GET | `/api/agent/sessions/:sid` | 获取会话详情 + 消息 |
| DELETE | `/api/agent/sessions/:sid` | 删除会话 |
| POST | `/api/agent/sessions/:sid/stream` | AI 聊天（SSE） |
| GET/POST | `/api/accounts` | 云账户 CRUD |
| GET | `/api/resources/` | 资源列表（缓存） |
| POST | `/api/resources/sync` | 触发资源同步 |
| GET | `/api/health` | 健康检查 |

## 云 Provider

| 云平台 | 认证方式 | 支持操作 |
|--------|----------|----------|
| Azure | OAuth2 (client_credentials) | 资源列表 + 任意 REST API (`DoRawRequest`) |
| 腾讯云 | TC3-HMAC-SHA256 | 资源列表 + 任意 API (`DoRawRequest`) |
| Oracle Cloud | OCI RSA-SHA256 | 资源列表 + 任意 API (`DoRawRequest`) |
| Render | Bearer Token | 资源列表 + 任意 API (`DoRawRequest`) |

所有 Provider 实现 `types.Provider` 接口。`DoRawRequest` 方法允许 AI Agent 通过 `cloud_api_request` 工具调用任意云 API，凭证在服务端注入，不会暴露给前端。

## 许可证

MIT License
