# CloudOps AI Phase 5 — Web Console 前端设计文档

**日期：** 2026-06-19
**项目：** CloudOps AI 多云管理系统
**阶段：** Phase 5 — Web Console 前端

---

## 1. 目标与背景

### 1.1 目标

为 CloudOps AI 多云管理系统构建 Web 管理控制台，整合 auth/cloud/monitor/ai-agent 四个后端服务，提供：

- **AI 对话页**：自然语言操作云资源，流式输出，健壮的断线/刷新/切换恢复
- **云资源管理**：实例列表、详情、创建、启停、删除
- **监控告警**：告警规则、事件、通知渠道管理
- **成本分析**：多云费用汇总、趋势、分解
- **用户管理**：RBAC 角色分配
- **审计日志**：操作记录查询

### 1.2 核心需求

AI 流式对话的健壮性是硬需求：

- **刷新页面不丢 AI 任务**：AI 生成在服务端独立运行，与客户端连接解耦
- **切换 session 后台继续**：原 session 的 AI 任务不中断
- **回到运行中 session 看完整流**：已生成内容 + 流式状态完整恢复，格式不乱
- **断线重连恢复**：自动重连 + seq gap 检测 + 缺失事件补发
- **多 AI 对话并发**：不同 session 并发执行，每 session 内串行

### 1.3 技术决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| AI 对话健壮性 | fork OpenClaw gateway 流式层 | OpenClaw 已实现完整的 generation job + in-flight snapshot + seq+gap + ACP ledger 机制，MIT 许可证，可直接复用 |
| AI 对话页前端 | 双版本并行（OpenClaw Lit + React） | OpenClaw Lit 直接复用健壮性代码；React 版参考 LibreChat 设计；最终择优 |
| 其他页面前端 | React 18 + shadcn/ui + Tailwind | 主流生态，组件丰富，适合管理后台 |
| 状态管理 | Zustand + TanStack React Query | 轻量 + 服务端状态专用 |
| 图表 | Recharts | React 生态主流图表库 |
| 后端流式协议 | OpenClaw WebSocket JSON-RPC | 复用 OpenClaw gateway 协议，支持健壮性 |

### 1.4 OpenClaw 源码复用策略

OpenClaw 前端是 Lit Web Components，后端 gateway 实现了完善的流式健壮性机制。复用策略：

**后端复用（ai-gateway 服务）**：
- `src/gateway/chat-abort.ts` → AbortController 管理 + `resolveInFlightRunSnapshot`
- `src/gateway/server-broadcast.ts` → seq 序号广播
- `src/gateway/server-chat-state.ts` → `ChatRunState` 内存缓冲
- `src/gateway/server-methods/chat.ts` → `chat.send` / `chat.history` / `chat.abort`
- `src/gateway/server-methods/sessions.ts` → `sessions.subscribe` / `sessions.messages.subscribe`
- `src/acp/event-ledger.ts` → ACP 事件账本（SQLite 持久化）
- `src/acp/control-plane/manager.core.ts` → `AcpSessionManager` 并发管理
- `src/acp/control-plane/session-actor-queue.ts` → 每 session 串行队列

**前端复用（OpenClaw Lit 版本）**：
- `ui/src/ui/gateway.ts` → `GatewayBrowserClient` WebSocket 客户端
- `ui/src/ui/app-gateway.ts` → 事件分发 + seq gap 检测
- `ui/src/ui/controllers/chat.ts` → 聊天业务逻辑
- `ui/src/ui/chat/` → 流式渲染、工具卡片、分组渲染
- `ui/src/ui/views/chat.ts` → 聊天页面
- `ui/src/i18n/` → 国际化体系
- `ui/src/styles/` → CSS 主题系统

**魔改点**：
1. 认证：移除设备配对 + ed25519，改为 JWT 验证
2. 工具执行：对接 cloud-service/monitor-service HTTP API
3. LLM 调用：复用 ai-agent 现有的 OpenAI 兼容 stream.ts
4. 消息持久化：复用 ai-agent 现有的 PostgreSQL chat_sessions/chat_messages 表
5. 移除 OpenClaw 专有功能：channels/skills/cron/dreaming/realtime-talk 等
6. 最终成品与 OpenClaw 完全脱钩，不保留任何 OpenClaw 标识

---

## 2. 系统架构

### 2.1 服务拓扑

```
┌─────────────────────────────────────────────────────────┐
│  Web Console (端口 80)                                   │
│  ├── React 主壳                                          │
│  │   ├── /dashboard   总览                               │
│  │   ├── /instances   云资源管理                         │
│  │   ├── /monitor     监控告警                           │
│  │   ├── /costs       成本分析                           │
│  │   ├── /users       用户管理                           │
│  │   ├── /audit       审计日志                           │
│  │   └── /chat/react  AI 对话（React 版）                │
│  └── OpenClaw Lit（嵌入 Web Component）                  │
│      └── /chat/lit    AI 对话（Lit 版）                  │
├─────────────────────────────────────────────────────────┤
│  api-gateway:3000 ── REST 代理                           │
│    /auth/*    → auth-service:3004                       │
│    /cloud/*   → cloud-service:3001                      │
│    /monitor/* → monitor-service:3002                    │
│    /agent/*   → ai-agent:3003（sessions CRUD）          │
│                                                          │
│  ai-gateway:3005 ── OpenClaw WS 协议（流式对话）         │
│    fork OpenClaw gateway 流式层                          │
│    chat.send / chat.history / sessions.subscribe        │
└─────────────────────────────────────────────────────────┘
```

### 2.2 新增服务：ai-gateway（端口 3005）

**职责**：提供 OpenClaw WebSocket JSON-RPC 协议，承载 AI 流式对话的健壮性机制。

**复用 OpenClaw 代码**：
- `src/gateway/chat-abort.ts` → AbortController 管理 + `resolveInFlightRunSnapshot`
- `src/gateway/server-broadcast.ts` → seq 序号广播
- `src/gateway/server-chat-state.ts` → `ChatRunState` 内存缓冲
- `src/gateway/server-methods/chat.ts` → `chat.send` / `chat.history` / `chat.abort`
- `src/gateway/server-methods/sessions.ts` → `sessions.subscribe` / `sessions.messages.subscribe`
- `src/acp/event-ledger.ts` → ACP 事件账本（SQLite 持久化）
- `src/acp/control-plane/manager.core.ts` → `AcpSessionManager` 并发管理
- `src/acp/control-plane/session-actor-queue.ts` → 每 session 串行队列

**魔改点**：
1. **认证**：移除 OpenClaw 设备配对 + ed25519，改为 JWT 验证（复用 ai-agent 的 auth middleware）
2. **工具执行**：`chat.send` 中的 agent 运行，工具调用对接现有 cloud-service/monitor-service HTTP API
3. **LLM 调用**：复用 ai-agent 现有的 `llm/stream.ts`（OpenAI 兼容）
4. **消息持久化**：复用 ai-agent 现有的 PostgreSQL chat_sessions/chat_messages 表
5. **移除 OpenClaw 专有功能**：channels/skills/cron/dreaming/realtime-talk 等

**与现有服务关系**：
- `api-gateway:3000` → REST 代理（auth/cloud/monitor）+ ai-agent REST 路由（sessions CRUD）
- `ai-gateway:3005` → WebSocket 流式对话（OpenClaw 协议）
- `ai-agent:3003` → 保留 REST 路由，流式逻辑迁移到 ai-gateway

### 2.3 通信协议

**REST（经 api-gateway:3000）**：
- 所有 REST 请求携带 `Authorization: Bearer <accessToken>`
- 401 时自动刷新 token 并重试

**WebSocket（ai-gateway:3005，OpenClaw JSON-RPC）**：
- 连接：`ws://ai-gateway:3005?token=<accessToken>`
- 请求帧：`{type: "req", id, method, params}`
- 响应帧：`{type: "res", id, ok, payload, error}`
- 事件帧：`{type: "event", event, payload, seq, stateVersion}`

**核心 RPC 方法**：
- `chat.send` — 发送消息，返回 runId
- `chat.history` — 获取历史消息 + in-flight run 快照
- `chat.abort` — 中止运行
- `sessions.subscribe` — 订阅 session 事件
- `sessions.messages.subscribe` — 订阅消息事件

**核心事件**：
- `chat` — 流式 delta（text_delta/tool_call/tool_result等）
- `session.message` — 新消息
- `session.operation` — session 状态变更

---

## 3. 前端架构

### 3.1 技术栈

| 维度 | 选择 |
|------|------|
| 框架 | React 18 + TypeScript + Vite |
| UI 库 | shadcn/ui + Tailwind CSS |
| 状态管理 | Zustand（全局状态）+ TanStack React Query（服务端状态） |
| 路由 | react-router-dom v6 |
| 图表 | Recharts |
| 表格 | TanStack Table |
| Markdown | react-markdown + remark/rehype + highlight.js |
| OpenClaw 集成 | Web Component 嵌入（`<openclaw-chat>`） |

### 3.2 目录结构

```
web-console/
├── package.json
├── vite.config.ts
├── index.html
├── Dockerfile
├── src/
│   ├── main.tsx                    # React 入口
│   ├── App.tsx                     # 路由 + 布局
│   ├── api/                        # API 调用层
│   │   ├── client.ts               # fetch 封装 + JWT 拦截
│   │   ├── auth.ts                 # /auth/* 接口
│   │   ├── cloud.ts                # /cloud/* 接口
│   │   ├── monitor.ts              # /monitor/* 接口
│   │   └── agent.ts                # /agent/* 接口
│   ├── stores/                     # Zustand 状态
│   │   ├── auth.ts                 # 认证状态
│   │   └── ui.ts                   # UI 状态（侧边栏等）
│   ├── hooks/                      # React Query hooks
│   │   ├── useInstances.ts
│   │   ├── useAlerts.ts
│   │   └── useCosts.ts
│   ├── components/                 # 通用组件
│   │   ├── Layout.tsx              # 主布局（侧边栏+顶栏）
│   │   ├── Sidebar.tsx
│   │   └── ui/                     # shadcn/ui 组件
│   ├── pages/
│   │   ├── Login.tsx
│   │   ├── Dashboard.tsx           # 总览
│   │   ├── Instances.tsx           # 云资源管理
│   │   ├── InstanceDetail.tsx
│   │   ├── Monitor.tsx             # 监控告警
│   │   ├── Costs.tsx               # 成本分析
│   │   ├── Users.tsx               # 用户管理
│   │   ├── Audit.tsx               # 审计日志
│   │   └── chat/
│   │       ├── ChatLit.tsx         # OpenClaw Lit 版本
│   │       ├── ChatReact.tsx       # React 版本
│   │       └── ChatReact/          # React 对话组件
│   │           ├── MessageList.tsx
│   │           ├── MessageInput.tsx
│   │           ├── ToolCard.tsx
│   │           └── StreamRenderer.tsx
│   └── lib/
│       ├── openclaw-adapter.ts     # OpenClaw Lit Web Component 适配
│       └── ws-client.ts            # React 版 WebSocket 客户端
├── openclaw-ui/                    # fork 的 OpenClaw Lit 前端
│   ├── package.json
│   └── src/                        # 魔改后的 OpenClaw UI
└── public/
```

### 3.3 OpenClaw Lit 集成方式

1. `openclaw-ui/` 作为独立子项目，魔改后构建为 Web Component bundle
2. React 中通过 `<openclaw-chat gateway-url="ws://localhost:3005" token="...">` 嵌入
3. 两个版本通过路由切换：`/chat/lit` 和 `/chat/react`

### 3.4 React 对话页（参考 LibreChat）

- 复用 LibreChat 的 SSE 客户端重连逻辑思路
- 对接 CloudOps 的 ai-gateway WebSocket 协议
- 实现 generation job 跟踪 + 断线恢复（借鉴 OpenClaw 设计模式）

---

## 4. 页面设计

### 4.1 页面清单

| 页面 | 路由 | 核心功能 | 数据源 |
|------|------|---------|--------|
| 登录 | `/login` | 用户名密码登录，获取 JWT | POST /auth/login |
| 总览 | `/dashboard` | 实例统计、告警概览、费用趋势、最近操作 | 多接口聚合 |
| 云资源 | `/instances` | 实例列表（筛选/搜索/批量操作）、创建实例 | /cloud/instances |
| 实例详情 | `/instances/:id` | 基本信息、监控图表、操作历史 | /cloud/instances/:id + /monitor/metrics |
| 监控告警 | `/monitor` | 告警规则管理、告警事件、通知渠道 | /monitor/alerts/* |
| 成本分析 | `/costs` | 费用汇总、按云/服务分解、趋势图 | /monitor/costs/* |
| AI 对话(Lit) | `/chat/lit` | OpenClaw Lit 流式对话 | ws://ai-gateway:3005 |
| AI 对话(React) | `/chat/react` | React 流式对话 | ws://ai-gateway:3005 |
| 用户管理 | `/users` | 用户列表、角色分配、删除 | /users |
| 审计日志 | `/audit` | 操作记录查询、筛选、导出 | /audit |

### 4.2 总览 Dashboard

- 顶部卡片：总实例数 / 运行中 / 告警数 / 本月费用
- 实例状态分布图（按云厂商饼图）
- 告警趋势图（近 7 天折线）
- 费用趋势图（近 30 天柱状）
- 最近 AI 操作记录

### 4.3 云资源管理

- 表格列：名称 / 云厂商 / 区域 / 状态 / 规格 / IP / 月费用 / 操作
- 筛选：云厂商、区域、状态
- 批量操作：启动、停止、重启、删除（危险操作二次确认）
- 创建实例：弹窗表单（云厂商、区域、规格、镜像等）

### 4.4 AI 对话页（双版本共同功能）

- 会话列表（左侧侧边栏）
- 消息流（中间主区域）
- 流式输出（逐字显示）
- 工具调用卡片（可展开查看参数和结果）
- 操作确认卡片（危险操作需用户确认）
- 资源卡片（结构化展示实例列表、费用摘要等）
- 输入框 + 发送

### 4.5 监控告警

- Tab 切换：告警规则 / 告警事件 / 通知渠道
- 规则管理：CRUD 表格
- 事件列表：状态/严重级别筛选，可手动恢复
- 渠道管理：webhook/email/slack 配置

---

## 5. 数据流与认证

### 5.1 认证流程

```
用户登录 → POST /auth/login → 获取 { accessToken, refreshToken }
         → 存储到 Zustand + localStorage
         → 后续请求携带 Authorization: Bearer <accessToken>
         → token 过期 → POST /auth/refresh → 续期
         → WebSocket 连接 → query 参数 ?token=<accessToken>
```

JWT 拦截：`api/client.ts` 中统一拦截，401 时自动刷新 token 并重试。

### 5.2 数据流架构

```
┌─────────────────────────────────────────────────┐
│ React 前端                                       │
│  ├── Zustand（全局状态：auth/ui）                │
│  ├── React Query（服务端状态：instances/alerts） │
│  └── WebSocket（AI 对话流式）                    │
├─────────────────────────────────────────────────┤
│  HTTP REST → api-gateway:3000                   │
│    /auth/*    → auth-service:3004               │
│    /cloud/*   → cloud-service:3001              │
│    /monitor/* → monitor-service:3002            │
│    /agent/*   → ai-agent:3003（sessions CRUD）  │
│                                                  │
│  WebSocket → ai-gateway:3005                    │
│    OpenClaw JSON-RPC 协议                        │
│    chat.send / chat.history / sessions.subscribe│
└─────────────────────────────────────────────────┘
```

### 5.3 AI 对话数据流（健壮性核心）

**正常流程**：
```
用户发消息 → WS chat.send → ai-gateway 创建 generation job
           → 返回 runId（ack）
           → 服务端调用 LLM，边生成边缓冲到 ChatRunState
           → 推送 chat 事件（text_delta/tool_call等）带 seq
           → 客户端逐条渲染
           → 生成完成 → 持久化到 chat_messages
```

**刷新页面恢复**：
```
页面加载 → WS 连接 → chat.history(sessionKey)
        → 返回历史消息 + inFlightRun（正在运行的 run 快照）
        → 客户端渲染已有内容 + 恢复流式状态
        → sessions.messages.subscribe 订阅后续事件
        → 继续接收 chat 事件直到 done
```

**切换 session 恢复**：
```
切换到 session A → chat.history(A) → 获取 A 的 inFlightRun
                 → 渲染已缓冲内容 + 订阅后续
原 session B 的 run 继续在服务端执行（不中断）
切回 session B → chat.history(B) → 获取 B 的 inFlightRun → 恢复
```

**断线重连**：
```
WS 断开 → 自动重连（指数退避）
       → 重连后 chat.history 获取当前状态
       → seq gap 检测 → 补发缺失事件
       → 透明恢复流式
```

### 5.4 权限控制

前端基于 `ROLE_PERMISSIONS` 做按钮/菜单级显隐：
- admin：全部功能
- ops_manager：资源管理 + 监控 + 成本
- ops_engineer：资源管理 + 执行命令
- viewer：只读查看

---

## 6. 健壮性机制详解（复用 OpenClaw）

### 6.1 AI 任务与连接解耦

- AI 生成以 fire-and-forget 方式启动，AbortController 存在共享 Map 中（非连接绑定）
- WebSocket close 处理器不 abort 任何 AI 任务
- 客户端断开不影响服务端生成

### 6.2 刷新/断线重连恢复

- **seq + gap 检测**：服务端为每个客户端维护递增 seq，客户端检测 gap 触发重连
- **chat.history 恢复**：返回历史消息 + `inFlightRun` 快照（正在运行的 run 的已缓冲文本）
- **ACP 事件账本**：SQLite 持久化记录每个 session update，支持重放
- **sessions.subscribe**：重连后重新订阅接收后续流式事件

### 6.3 切换 session 恢复

- 切换不触发 abort，原 session 的 run 继续在服务端执行
- 切换回来时 `chat.history` 通过 `resolveInFlightRunSnapshot` 恢复正在 streaming 的 run

### 6.4 多 session 并发

- `AcpSessionManager` 按 session 跟踪活跃 turn，不同 session 并发执行
- `SessionActorQueue` 按 sessionKey 串行化操作（同一 session 内串行）
- 可配置 `maxConcurrentSessions` 上限

### 6.5 消息存储

- **内存缓冲**：`ChatRunState.buffers` 实时缓冲流式 chunks
- **ACP 事件账本**：SQLite 持久化中间存储，支持重放
- **transcript 持久化**：生成完成后完整消息落 PostgreSQL chat_messages

---

## 7. 实施阶段划分

Phase 5 分为以下子阶段：

1. **Phase 5.1**：ai-gateway 服务搭建（fork OpenClaw gateway 流式层 + 魔改）
2. **Phase 5.2**：React 前端主壳 + 认证 + 布局 + 路由
3. **Phase 5.3**：云资源管理页 + 监控告警页 + 成本分析页
4. **Phase 5.4**：AI 对话页 React 版（参考 LibreChat）
5. **Phase 5.5**：AI 对话页 OpenClaw Lit 版（fork + 魔改 + 嵌入）
6. **Phase 5.6**：用户管理 + 审计日志 + 总览 Dashboard
7. **Phase 5.7**：Docker 部署 + 端到端验证

---

## 8. 与 OpenClaw 脱钩策略

- 所有复用的 OpenClaw 代码重命名包名、移除 OpenClaw 标识
- UI 中不出现 "OpenClaw" 字样，统一为 "CloudOps AI"
- 独立 package.json、独立 Dockerfile
- 最终成品与 OpenClaw 完全脱钩，仅保留 MIT 许可证声明
