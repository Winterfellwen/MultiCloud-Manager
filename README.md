# CloudOps AI

多云管理控制台 + AI 助手

---

## ✨ 功能

- 🔐 **统一认证** — 用户、角色、权限管理
- ☁️ **多云管理** — AWS / 阿里云 / Azure / Render 资源统一管理
- 📊 **监控告警** — 实时指标 + 告警 + 成本分析
- 🤖 **AI 助手** — 自然语言查询、操作、诊断（支持 OpenAI 兼容的所有模型
- 💬 **实时对话** — WebSocket 流式响应

---

## 🚀 快速开始

支持三种部署方式：**Docker Compose** / **Render** / **Kubernetes**

### 方式一：Docker Compose（推荐，本地或自建服务器

```bash
# 1. 复制环境变量模板
cp .env.example .env

# 2. 修改 .env（JWT_SECRET 建议用随机字符串
#    其他留空即可首次启动

# 3. 一键启动（构建 + 启动
make compose-up
# 或：docker compose up -d --build

# 4. 查看日志获取 admin 密码（首次启动会随机生成
make compose-admin
# 或：docker compose logs app 2>&1 | grep -A 5 "🔑\|密码\|========================================
```

**访问**：http://localhost

---

### 方式二：Render（PaaS，零运维

```bash
# 1. 登录 https://dashboard.render.com

# 2. New → "Deploy a Blueprint" → 选择本仓库
#    Render 会自动创建 Postgres + Redis + Web 服务

# 3. 部署完成后在服务日志中查找 admin 密码：
#    在 Render 面板 → 服务 → Logs 中查找 "🔑" / "密码"
```

**推送代码触发自动部署**：

```bash
make render-deploy   # git push origin HEAD
```

---

### 方式三：Kubernetes（生产环境

```bash
# 1. 配置镜像（修改 k8s/05-app.yaml 中的 image 字段
#    需要先构建并推送到镜像仓库
docker build -t your-registry/cloudops-app:latest .
docker push your-registry/cloudops-app:latest

# 2. 修改 secret（k8s/02-secret.yaml 中的 JWT_SECRET
#    建议用：openssl rand -hex 32 生成随机密钥

# 3. 修改 Ingress 域名（k8s/06-ingress.yaml 中的 host

# 4. 一键部署
make k8s-apply

# 5. 查看状态
kubectl get pods -n cloudops

# 6. 本地端口转发测试
make k8s-port-forward

# 7. 查看 admin 登录凭据
make k8s-admin
```

---

## 👤 管理员账号

### 首次部署（无用户时）

- **用户名**：`admin`（来自 `ADMIN_USERNAME` 环境变量
- **密码**：**首次部署时随机生成**（在容器日志中打印，带有 🔑 图标
- **如何获取密码**：
  - Docker Compose → `make compose-admin`
  - Render → 在面板 Logs 中搜索 "🔑"
  - K8s → `make k8s-admin`

### 更新密码（部署完成后

在对应平台的环境变量面板中设置：

```
ADMIN_PASSWORD=your-new-strong-password
```

修改后重新部署，密码会自动同步。

### ⚠️ 注意事项

- **所有部署方式共用同一套代码** — 无需修改任何代码即可切换平台
- **WebSockets** 前端会根据当前页面 URL 自动选择 `wss://` / `ws://`
- **HTTPS 页面** 必须用 `wss://` 协议
- **Render** 等 PaaS 平台提供 HTTPS，前端会自动识别

---

## 🏗️ 架构

3 个容器（Docker Compose）或 3 个 Service（K8s）或 1 个 Web 服务（Render）

```
┌───────────────────────────────────────────────────────────┐
│                        浏览器                                 │
│  HTTP(S) 请求（相对路径        WebSocket（/ws      │
└────────────┬─────────────────────────────┬───────────┘
              │                              │
              ▼                              ▼
┌───────────────────────────────────────────────────────────┐
│                    Nginx（反向代理）                          │
│   /api/*        → api-gateway (3000                           │
│   /cloud/*      → cloud-service (3001                          │
│   /monitor/*    → monitor-service (3002                         │
│   /agent/*      → ai-agent (3003                           │
│   /auth/*       → auth-service (3004                          │
│   /ws           → ai-gateway (3005                           │
│   /             → 前端静态资源                                      │
└───────────────────────────────────────────────────────────┘
```

**服务列表**

| 服务 | 端口 | 说明 |
|------|------|------|
| api-gateway | 3000 | API 网关 + 健康检查 |
| cloud-service | 3001 | 云厂商管理（AWS / 阿里云 / Azure / Render |
| monitor-service | 3002 | 监控告警 |
| ai-agent | 3003 | AI Agent |
| auth-service | 3004 | 认证服务 |
| ai-gateway | 3005 | AI 网关（WebSocket） |

所有后端服务由 **PM2** 管理，通过 **Dockerfile** 构建到单个镜像中运行，再由 **Nginx** 统一暴露。

---

## 📦 文件结构

```
├── Dockerfile              # 多阶段构建：前端 + 后端 + 运行时
├── docker-compose.yml      # Docker Compose 部署（make compose-up
├── render.yaml            # Render Blueprint（make render-deploy
├── k8s/                   # Kubernetes 部署（make k8s-apply
│   ├── 00-namespace.yaml  # 命名空间
│   ├── 01-configmap.yaml  # 配置
│   ├── 02-secret.yaml     # 密钥（JWT / 云凭据 / LLM API Key
│   ├── 03-postgres.yaml   # PostgreSQL
│   ├── 04-redis.yaml      # Redis
│   ├── 05-app.yaml        # 主应用
│   └── 06-ingress.yaml    # Ingress（对外暴露
├── nginx.conf             # Nginx 配置（反向代理 + WebSocket
├── start.sh               # 启动脚本（pm2 start + nginx
├── ecosystem.config.js    # PM2 进程管理配置
├── Makefile               # 统一命令行工具
├── .env.example           # 环境变量模板（复制为 .env 使用
├── shared/                # 共享 TypeScript 类型
├── auth-service/          # 认证服务
├── api-gateway/           # API 网关
├── cloud-service/         # 云服务
├── monitor-service/       # 监控服务
├── ai-agent/              # AI Agent
├── ai-gateway/            # AI 网关（WebSocket
└── web-console/           # 前端（React + Tailwind
    ├── nginx.conf          # 开发用 Nginx 配置
    ├── package.json         # 依赖
    ├── tailwind.config.js   # Tailwind 配置
    └── src/                # 源代码
        ├── api/            # API 客户端
        ├── stores/         # Zustand 状态管理（包含 chat.ts
        ├── components/     # UI 组件
        ├── lib/            # 工具库（包含 config.ts — 自动检测部署平台
        └── App.tsx         # 应用入口
```

---

## 🔧 环境变量

所有平台的核心环境变量一致，只需修改对应平台的配置文件即可：

| 变量 | 必选 | 说明 |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL 连接字符串 |
| `REDIS_URL` | ✅ | Redis 连接字符串 |
| `JWT_SECRET` | ✅ | JWT 签名密钥（建议 64+ 字符随机字符串 |
| `JWT_EXPIRES_IN` | ⬜ | 默认 `24h` |
| `ADMIN_USERNAME` | ⬜ | 默认 `admin` |
| `ADMIN_PASSWORD` | ⬜ | 留空时首次启动随机生成 |
| `AWS_ACCESS_KEY_ID` | ⬜ | AWS 凭据（可选 |
| `AWS_SECRET_ACCESS_KEY` | ⬜ | AWS 凭据（可选 |
| `ALIYUN_ACCESS_KEY_ID` | ⬜ | 阿里云凭据（可选 |
| `AZURE_TENANT_ID` | ⬜ | Azure 凭据（可选 |
| `RENDER_API_KEY` | ⬜ | Render API Key（可选 |
| `LLM_API_KEY` | ⬜ | LLM API Key（可选 |
| `LLM_BASE_URL` | ⬜ | 默认 `https://api.openai.com/v1` |
| `LLM_MODEL` | ⬜ | 默认 `gpt-4o` |
| `AGENT_MAX_ITERATIONS` | ⬜ | 默认 `10` |
| `AGENT_TIMEOUT_MS` | ⬜ | 默认 `120000` |
| `APP_PORT` | ⬜ | Docker Compose 专用，Web 端口映射（默认 80 |

### 配置文件来源

| 平台 | 配置位置 |
|---|---|
| Docker Compose | `.env` 文件（从 `.env.example` 复制 |
| Render | Render 面板 → Environment → Environment Variables |
| Kubernetes | `k8s/01-configmap.yaml`（普通配置） + `k8s/02-secret.yaml`（密钥 |

---

## 💾 数据持久化

### Docker Compose

```bash
# ✅ 推荐：保留数据
docker compose up -d --build

# ❌ 危险：会丢失数据
docker compose down -v
```

数据存储在 `pgdata` 和 `redisdata` 两个 Docker volume 中。

### Render

Render 会自动管理数据库和 Redis 的持久化，无需手动操作。

### Kubernetes

数据存储在 PVC（Persistent Volume Claim）中，`k8s/03-postgres.yaml` 和 `k8s/04-redis.yaml` 定义。

```bash
# 查看 PVC
kubectl get pvc -n cloudops

# 删除 PVC 会永久丢失数据（谨慎
kubectl delete pvc -n cloudops --all
```

---

## 🛠️ Makefile 常用命令

```bash
# ============= Docker Compose =============
make compose-up          # 启动 + 构建
make compose-down        # 停止 + 删除
make compose-restart      # 重启应用（保留数据
make compose-logs        # 查看日志
make compose-admin       # 打印 admin 登录凭据

# ============= Render =============
make render-deploy       # 推送代码 → 自动部署
make render-clean       # 提示如何删除服务

# ============= Kubernetes =============
make k8s-apply          # 部署到 K8s
make k8s-delete         # 从 K8s 删除部署
make k8s-logs          # 查看 pod 日志
make k8s-admin         # 打印 admin 登录凭据
make k8s-port-forward   # 本地端口转发测试

# ============= 测试 =============
make test-health        # 健康检查
```

---

## 🔍 健康检查

```
GET /health            # 整体健康检查（JSON 响应
GET /health/all        # 所有服务状态（较详细
```

---

## 👷 开发

```bash
# 前端开发（热更新
cd web-console
npm install
npm run dev
# 访问：http://localhost:5173

# 后端服务开发（Docker 内运行
docker compose -f docker-compose.simple.yml up -d --build
docker compose -f docker-compose.simple.yml exec server sh
```

---

## ❓ 常见问题

**Q: 忘记 admin 密码怎么办？**
A: 在 Render 面板设置 `ADMIN_PASSWORD` 环境变量后重新部署，密码会自动同步。
Docker Compose 用户：重新启动容器时会在日志中打印密码（如果还没设置过的话。

**Q: WebSocket 无法连接怎么办？**
A: 检查是否通过 HTTPS 访问（HTTPS 必须用 `wss://`，前端已自动处理。
如果使用自建 Nginx，确保 `proxy_http_version 1.1` 和 `upgrade` 头已正确设置（nginx.conf 中已有）。

**Q: LLM 模型不工作？**
A: 检查 `LLM_API_KEY`、`LLM_BASE_URL`、`LLM_MODEL` 环境变量是否正确设置。
也可在前端的 "AI 设置" 中添加多个 Provider（支持多模型切换。

**Q: Render 部署失败？**
A: 检查构建日志，常见原因：
- Git 仓库未连接（需要先在 Render 中添加
- 环境变量中含有特殊字符（建议用 Render 生成的自动生成值
- Docker build 超时（可在 Render 面板延长超时

**Q: Kubernetes 中的 Pod 无法启动？**
A:
```bash
kubectl get pods -n cloudops
kubectl describe pod <pod-name> -n cloudops
kubectl logs <pod-name> -n cloudops
```
常见问题：镜像拉取不到、Secret 不存在、PVC 未绑定。

---

## 📜 License

MIT
