# OpenCode Go 重写计划

## 概述

将 OpenCode 的 TypeScript 后端逻辑转换为 Go，完全参照源码逻辑，保持 API 兼容。

## 核心架构（参照 OpenCode 源码）

### 数据流（与 OpenCode 一致）
```
HTTP Request → Router → Handler → Session Service → LLM Service → Provider (Anthropic/OpenAI API)
                                          ↓
                                     Tool Registry → Tool Execute
                                          ↓
                                     EventV2 Bridge → SSE Stream → Client
```

## 需要实现的模块

### 1. HTTP Server + Router
- 参照: `packages/opencode/src/server/server.ts`, `packages/opencode/src/server/routes/instance/httpapi/api.ts`
- 使用 `chi` router
- CORS, compression, authorization 中间件

### 2. 需要实现的 API 端点（核心子集）

#### 全局端点
| Method | Path | 说明 | 参照源码 |
|--------|------|------|----------|
| GET | `/global/health` | 健康检查 | `handlers/health.ts` |
| GET | `/global/event` | 全局 SSE 事件流 | `handlers/event.ts` |
| GET | `/global/config` | 获取配置 | `handlers/config.ts` |
| PATCH | `/global/config` | 更新配置 | `handlers/config.ts` |

#### Session 端点
| Method | Path | 说明 | 参照源码 |
|--------|------|------|----------|
| GET | `/session` | 列出会话 | `groups/session.ts` |
| GET | `/session/:id` | 获取单个会话 | `groups/session.ts` |
| POST | `/session` | 创建会话 | `groups/session.ts` |
| DELETE | `/session/:id` | 删除会话 | `groups/session.ts` |
| PATCH | `/session/:id` | 更新会话 | `groups/session.ts` |
| POST | `/session/:id/message` | 发送消息（同步） | `groups/session.ts` |
| POST | `/session/:id/prompt_async` | 发送消息（异步） | `groups/session.ts` |
| GET | `/session/:id/message` | 获取消息列表 | `groups/message.ts` |
| POST | `/session/:id/abort` | 中止会话 | `groups/session.ts` |

#### Provider 端点
| Method | Path | 说明 | 参照源码 |
|--------|------|------|----------|
| GET | `/provider` | 列出 Provider | `groups/provider.ts` |
| GET | `/provider/:id` | 获取 Provider | `groups/provider.ts` |

#### Config 端点
| Method | Path | 说明 | 参照源码 |
|--------|------|------|----------|
| GET | `/config` | 获取实例配置 | `groups/config.ts` |
| PATCH | `/config` | 更新实例配置 | `groups/config.ts` |

#### Event 端点
| Method | Path | 说明 | 参照源码 |
|--------|------|------|----------|
| GET | `/event` | SSE 事件流 | `groups/event.ts` |

### 3. Session 管理
- 参照: `packages/opencode/src/session/session.ts`, `packages/core/src/session/sql.ts`
- SQLite 存储（session, message, part 表）
- Session CRUD
- Message CRUD
- Session 状态管理（busy/idle/completed）

### 4. LLM Provider 系统
- 参照: `packages/opencode/src/provider/provider.ts`, `packages/opencode/src/session/llm.ts`
- 直接调用 Anthropic/OpenAI HTTP API（不依赖 AI SDK）
- Streaming SSE 响应解析
- 支持的 Provider:
  - Anthropic (Claude)
  - OpenAI (GPT)
  - 可扩展其他 Provider

### 5. Agent Loop（核心循环）
- 参照: `packages/opencode/src/session/prompt.ts` (runLoop)
- 流程:
  1. 创建用户消息
  2. 解析模型和 Agent
  3. 构建系统提示词
  4. 调用 LLM streaming
  5. 解析 LLM 响应（text/tool_call）
  6. 执行 Tool calls
  7. 将 Tool 结果加入消息历史
  8. 重复直到 LLM 不再调用工具
- 最大 25 步（参照 OpenCode MAX_STEPS）

### 6. Tool 系统
- 参照: `packages/opencode/src/tool/` 目录
- Tool 定义: id, description, jsonSchema, execute
- 内置工具:

| Tool ID | 功能 | 参照源码 |
|---------|------|----------|
| `bash` | Shell 命令执行 | `tool/shell.ts` |
| `read` | 文件/目录读取 | `tool/read.ts` |
| `write` | 文件写入 | `tool/write.ts` |
| `edit` | 文件编辑（字符串替换） | `tool/edit.ts` |
| `glob` | 文件模式匹配 | `tool/glob.ts` |
| `grep` | 内容搜索 | `tool/grep.ts` |
| `webfetch` | URL 获取 | `tool/webfetch.ts` |

### 7. SSE 事件系统
- 参照: `packages/opencode/src/event-v2-bridge.ts`, `packages/opencode/src/server/routes/instance/httpapi/handlers/event.ts`
- 事件类型:
  - `server.connected` - 连接建立
  - `server.heartbeat` - 心跳（10秒）
  - `session.updated` - 会话更新
  - `message.updated` - 消息更新
  - `part.updated` - 消息部分更新
  - `part.delta` - 流式增量
  - `session.next.text.delta` - 文本增量
  - `session.next.tool.called` - 工具调用
  - `session.next.tool.success` - 工具成功
  - `session.next.tool.failed` - 工具失败
  - `session.next.step.started` - 步骤开始
  - `session.next.step.ended` - 步骤结束

### 8. 数据库 Schema
- 参照: `packages/core/src/session/sql.ts`

```sql
-- Session 表
CREATE TABLE session (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  workspace_id TEXT,
  parent_id TEXT,
  slug TEXT,
  directory TEXT,
  path TEXT,
  title TEXT,
  version TEXT,
  agent TEXT,
  model TEXT,  -- JSON: {id, providerID, variant?}
  cost REAL DEFAULT 0,
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  tokens_reasoning INTEGER DEFAULT 0,
  tokens_cache_read INTEGER DEFAULT 0,
  tokens_cache_write INTEGER DEFAULT 0,
  time_created INTEGER,
  time_updated INTEGER,
  time_compacting INTEGER,
  time_archived INTEGER
);

-- Message 表
CREATE TABLE session_message (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES session(id),
  type TEXT,  -- user, assistant, system, shell, compaction, synthetic
  seq INTEGER,
  time_created INTEGER,
  time_updated INTEGER,
  data TEXT  -- JSON payload
);

-- Session Input 表（Durable Prompt Inbox）
CREATE TABLE session_input (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES session(id),
  prompt TEXT,  -- JSON
  delivery TEXT,  -- steer | queue
  admitted_seq INTEGER,
  promoted_seq INTEGER,
  time_created INTEGER
);
```

## 项目结构

```
packages/opencode-go/
├── cmd/
│   └── opencode/
│       └── main.go              # 入口
├── internal/
│   ├── server/
│   │   ├── server.go            # HTTP 服务器
│   │   ├── router.go            # 路由注册
│   │   └── middleware/           # 中间件
│   ├── handler/
│   │   ├── health.go            # 健康检查
│   │   ├── session.go           # Session 处理
│   │   ├── message.go           # Message 处理
│   │   ├── provider.go          # Provider 处理
│   │   ├── config.go            # Config 处理
│   │   └── event.go             # SSE 事件处理
│   ├── session/
│   │   ├── session.go           # Session 服务
│   │   ├── prompt.go            # Agent Loop
│   │   ├── llm.go               # LLM 调用
│   │   └── processor.go         # 事件处理
│   ├── provider/
│   │   ├── provider.go          # Provider 管理
│   │   ├── anthropic.go         # Anthropic 实现
│   │   └── openai.go            # OpenAI 实现
│   ├── tool/
│   │   ├── registry.go          # Tool 注册
│   │   ├── bash.go              # Shell 工具
│   │   ├── read.go              # Read 工具
│   │   ├── write.go             # Write 工具
│   │   ├── edit.go              # Edit 工具
│   │   ├── glob.go              # Glob 工具
│   │   ├── grep.go              # Grep 工具
│   │   └── webfetch.go          # WebFetch 工具
│   ├── event/
│   │   └── event.go             # EventV2 Bridge
│   └── database/
│       ├── database.go          # 数据库连接
│       └── migrations/          # 迁移文件
├── go.mod
└── go.sum
```

## 实现优先级

### Phase 1: 基础框架
1. HTTP Server + Router
2. 数据库 Schema + 迁移
3. Session CRUD
4. Message CRUD
5. 健康检查端点

### Phase 2: LLM 集成
1. Provider 管理
2. Anthropic API 集成（streaming）
3. OpenAI API 集成（streaming）
4. Agent Loop（核心循环）

### Phase 3: Tool 系统
1. Tool Registry
2. bash 工具
3. read 工具
4. write 工具
5. edit 工具
6. glob 工具
7. grep 工具

### Phase 4: 事件系统
1. EventV2 Bridge
2. SSE 事件流
3. 事件过滤（按 directory/workspace）

### Phase 5: 集成测试
1. API 兼容性测试
2. 流式响应测试
3. Tool 执行测试

## 关键设计决策

### 1. 不使用 AI SDK
OpenCode 使用 Vercel AI SDK 调用 LLM。Go 版本直接调用 Anthropic/OpenAI HTTP API，保持相同的请求/响应格式。

### 2. 同步/异步消息
- `POST /session/:id/message` - 同步，等待 Agent Loop 完成
- `POST /session/:id/prompt_async` - 异步，立即返回 204，通过 SSE 推送更新

### 3. 事件推送
所有实时更新通过 SSE 推送，客户端通过 `GET /event` 接收。

### 4. Tool 权限
参照 OpenCode 的权限系统，工具执行前检查权限（简化版）。

## 依赖

```
github.com/go-chi/chi/v5          # Router
github.com/mattn/go-sqlite3       # SQLite (CGO)
github.com/google/uuid            # UUID 生成
github.com/gorilla/websocket      # WebSocket (可选)
```

## 与现有系统的集成

### 在 Docker 中运行
- Go 后端监听端口 4096
- 嵌入 OpenCode Web UI（SolidJS）
- 共享 SQLite 数据库
- 共享 JWT 认证

### API 路由
- `/ai/*` → Go OpenCode 后端
- `/api/*` → 原有 MultiCloud Manager API
