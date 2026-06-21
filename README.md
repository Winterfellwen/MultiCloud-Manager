# CloudOps AI

多云管理控制台 + AI 助手

## 快速开始

### Docker 部署（推荐）

```bash
# 首次构建并启动
docker compose -f docker-compose.simple.yml up -d --build

# 注册管理员（首次启动后执行）
curl -s http://localhost:3004/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"admin12345"}'

# 访问 http://localhost
```

### 常用操作

```bash
# 重新构建并重启（保留数据库） ✅ 日常部署用这个
docker compose -f docker-compose.simple.yml up -d --build

# 仅重启（不重新构建）
docker compose -f docker-compose.simple.yml up -d

# 停止服务（保留数据库）
docker compose -f docker-compose.simple.yml down

# 查看日志
docker compose -f docker-compose.simple.yml logs -f

# 查看服务状态
docker compose -f docker-compose.simple.yml ps
```

或者用 Makefile：

```bash
make build    # 重新构建并重启（保留数据）
make up       # 仅重启
make down     # 停止
make logs     # 查看日志
make status   # 查看状态
```

### ⚠️ 重置数据库

```bash
# 这会删除所有数据！
make reset
```

## 架构

3 个 Docker 容器：

| 容器 | 说明 |
|------|------|
| `server` | 所有后端服务（PM2 管理）+ nginx |
| `postgres` | PostgreSQL 数据库 |
| `redis` | Redis 缓存 |

server 内部运行 6 个服务：

| 服务 | 端口 | 说明 |
|------|------|------|
| api-gateway | 3000 | API 网关 |
| cloud-service | 3001 | 云厂商管理 |
| monitor-service | 3002 | 监控告警 |
| ai-agent | 3003 | AI Agent |
| auth-service | 3004 | 认证服务 |
| ai-gateway | 3005 | AI 网关（WebSocket） |

## 数据持久化

所有配置和数据存储在 PostgreSQL 的 `pgdata` volume 中：

- 云厂商账号（`cloud_accounts`）
- LLM Provider 配置（`llm_providers`）
- 用户账号（`users`）
- 监控告警规则（`alert_rules`）

**重新部署时不要使用 `docker compose down -v`**，否则会删除 volume 导致数据丢失。

```bash
# ✅ 正确：保留数据
docker compose up -d --build

# ❌ 错误：会丢失数据
docker compose down -v
```

## 环境变量

在 `.env.simple` 或 shell 中设置：

```bash
# 数据库
POSTGRES_DB=cloudops
POSTGRES_USER=cloudops
POSTGRES_PASSWORD=cloudops123

# JWT（生产环境务必修改）
JWT_SECRET=your-secret-key

# LLM（可选）
LLM_API_KEY=sk-xxx
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o
```

## 开发

```bash
# 前端开发
cd web-console && npm install && npm run dev

# 后端服务（Docker 内）
docker compose -f docker-compose.simple.yml exec server sh
```
