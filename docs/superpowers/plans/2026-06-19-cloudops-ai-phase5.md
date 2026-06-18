# CloudOps AI Phase 5 — Web Console 前端实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 CloudOps AI 构建完整 Web 管理控制台，包含 AI 对话（双版本）、云资源管理、监控告警、成本分析、用户管理、审计日志，复用 OpenClaw gateway 流式层实现健壮的 AI 对话体验。

**Architecture:** 新增 ai-gateway 服务（端口 3005，fork OpenClaw gateway 流式层 + 魔改 JWT 认证 + 对接 CloudOps 后端）。前端 React 18 主壳 + shadcn/ui，AI 对话页双版本并行（OpenClaw Lit 嵌入 + React 原生），最终择优。

**Tech Stack:** React 18 / TypeScript / Vite / shadcn/ui / Tailwind / Zustand / TanStack React Query / Recharts / Lit 3（OpenClaw fork）/ Node 22 / Fastify / WebSocket / PostgreSQL / Redis / SQLite（ACP ledger）

**Spec:** `docs/superpowers/specs/2026-06-19-cloudops-ai-phase5-design.md`

---

## 文件结构总览

```
newcloud/
├── ai-gateway/                     # 【新增】Phase 5.1 - fork OpenClaw gateway 流式层
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── src/
│   │   ├── index.ts                # Fastify + WS 服务入口
│   │   ├── config.ts               # 环境变量配置
│   │   ├── auth.ts                 # JWT 认证（魔改，替换 OpenClaw 设备配对）
│   │   ├── gateway/                # 【复用 OpenClaw】流式健壮性核心
│   │   │   ├── chat-abort.ts       # AbortController 管理 + resolveInFlightRunSnapshot
│   │   │   ├── server-broadcast.ts # seq 序号广播
│   │   │   ├── server-chat-state.ts# ChatRunState 内存缓冲
│   │   │   ├── server-chat.ts      # chat 事件处理
│   │   │   └── ws-connection.ts    # WS 连接管理（魔改：移除断连 abort）
│   │   ├── methods/                # RPC 方法（魔改：对接 CloudOps）
│   │   │   ├── chat.ts             # chat.send / chat.history / chat.abort
│   │   │   └── sessions.ts         # sessions.subscribe / sessions.messages.subscribe
│   │   ├── acp/                    # 【复用 OpenClaw】ACP 事件账本
│   │   │   ├── event-ledger.ts     # SQLite 持久化事件账本
│   │   │   └── control-plane/      # 并发管理
│   │   │       ├── manager.ts      # AcpSessionManager
│   │   │       └── queue.ts        # SessionActorQueue
│   │   ├── agent/                  # Agent 运行（复用 ai-agent 逻辑）
│   │   │   ├── runner.ts           # runAgent（调用 LLM + 工具）
│   │   │   └── tools.ts            # 工具执行（对接 cloud/monitor service）
│   │   └── db/
│   │       └── index.ts            # 复用 ai-agent 的 PostgreSQL 连接
│   └── data/                       # SQLite 数据（ACP ledger）
│
├── web-console/                    # 【新增】Phase 5.2-5.7 - React 前端
│   ├── package.json
│   ├── vite.config.ts
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── Dockerfile
│   ├── index.html
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── api/
│   │   ├── stores/
│   │   ├── hooks/
│   │   ├── components/
│   │   ├── pages/
│   │   └── lib/
│   └── openclaw-ui/                # Phase 5.5 - fork OpenClaw Lit
│       └── src/
│
└── docker-compose.yml              # 添加 ai-gateway + web-console 服务
```

---

## 子阶段划分

Phase 5 分为 7 个子阶段，每个子阶段独立可验证：

| 子阶段 | 内容 | 依赖 |
|--------|------|------|
| 5.1 | ai-gateway 服务搭建（fork OpenClaw gateway） | 无 |
| 5.2 | React 前端主壳 + 认证 + 布局 + 路由 | 5.1 |
| 5.3 | 云资源管理页 + 监控告警页 + 成本分析页 | 5.2 |
| 5.4 | AI 对话页 React 版 | 5.1, 5.2 |
| 5.5 | AI 对话页 OpenClaw Lit 版 | 5.1, 5.2 |
| 5.6 | 用户管理 + 审计日志 + 总览 Dashboard | 5.2 |
| 5.7 | Docker 部署 + 端到端验证 | 5.1-5.6 |

---

# Phase 5.1：ai-gateway 服务搭建

**目标**：fork OpenClaw gateway 流式层，魔改为 CloudOps 的 AI 流式对话网关，提供健壮的 generation job + 断线恢复 + 多 session 并发能力。

**验证标准**：
1. ai-gateway 服务启动，监听 3005 端口
2. WebSocket 连接需 JWT 认证
3. `chat.send` 能发起 AI 对话，流式推送 chat 事件
4. 刷新页面后 `chat.history` 能恢复 in-flight run
5. 切换 session 后原 session 的 run 继续执行
6. 多 session 并发正常

---

### Task 1: ai-gateway 项目初始化 + 依赖

**Files:**
- Create: `ai-gateway/package.json`
- Create: `ai-gateway/tsconfig.json`
- Create: `ai-gateway/src/config.ts`

- [ ] **Step 1: 创建 package.json**

```json
{
  "name": "@cloudops/ai-gateway",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "migrate": "tsx src/db/migrate.ts"
  },
  "dependencies": {
    "fastify": "^4.28.1",
    "@fastify/websocket": "^10.0.1",
    "@fastify/cors": "^9.4.1",
    "ioredis": "^5.4.1",
    "drizzle-orm": "^0.33.0",
    "postgres": "^3.4.4",
    "better-sqlite3": "^11.3.0",
    "jsonwebtoken": "^9.0.2",
    "dotenv": "^16.4.5",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "typescript": "^5.6.3",
    "tsx": "^4.19.1",
    "@types/node": "^22.7.4",
    "@types/jsonwebtoken": "^9.0.7",
    "@types/better-sqlite3": "^7.6.11"
  }
}
```

- [ ] **Step 2: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: 创建 config.ts**

```typescript
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.AI_GATEWAY_PORT || '3005', 10),
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // JWT（与 auth-service 共享密钥）
  jwtSecret: process.env.JWT_SECRET || 'cloudops-dev-secret',

  // PostgreSQL（复用 ai-agent 的数据库）
  databaseUrl: process.env.DATABASE_URL || 'postgres://cloudops:changeme@postgres:5432/cloudops',

  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://redis:6379',

  // SQLite（ACP event ledger 本地存储）
  sqlitePath: process.env.SQLITE_PATH || './data/acp-ledger.db',

  // LLM 配置（与 ai-agent 共享）
  llm: {
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.LLM_MODEL || 'gpt-4o',
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4096', 10),
  },

  // 内部服务地址
  cloudServiceUrl: process.env.CLOUD_SERVICE_URL || 'http://cloud-service:3001',
  monitorServiceUrl: process.env.MONITOR_SERVICE_URL || 'http://monitor-service:3002',

  // Agent 配置
  agent: {
    maxIterations: parseInt(process.env.AGENT_MAX_ITERATIONS || '10', 10),
    timeoutMs: parseInt(process.env.AGENT_TIMEOUT_MS || '120000', 10),
    maxConcurrentSessions: parseInt(process.env.ACP_MAX_CONCURRENT_SESSIONS || '10', 10),
  },
};
```

- [ ] **Step 4: 安装依赖**

Run: `cd ai-gateway && pnpm install`
Expected: 依赖安装成功

- [ ] **Step 5: Commit**

```bash
git add ai-gateway/package.json ai-gateway/tsconfig.json ai-gateway/src/config.ts
git commit -m "feat(ai-gateway): 项目初始化 + 配置"
```

---

### Task 2: JWT 认证模块（魔改替换 OpenClaw 设备配对）

**Files:**
- Create: `ai-gateway/src/auth.ts`

**说明**：OpenClaw 用设备配对 + ed25519 签名认证，CloudOps 改为 JWT 验证（与 auth-service 一致）。

- [ ] **Step 1: 创建 JWT 认证模块**

```typescript
// JWT 认证（魔改：替换 OpenClaw 的设备配对 + ed25519 签名）
// CloudOps 使用标准 JWT，与 auth-service 共享密钥

import jwt from 'jsonwebtoken';
import { config } from './config.js';

export interface AuthUser {
  userId: string;
  username: string;
  role: string;
}

/**
 * 从 WebSocket 升级请求中解析 JWT
 * 支持两种方式：query 参数 ?token=xxx 或 Authorization header
 */
export function parseTokenFromRequest(
  query: Record<string, unknown>,
  headers: Record<string, string | string[] | undefined>
): string | null {
  // query 参数优先
  const queryToken = query.token;
  if (typeof queryToken === 'string' && queryToken.length > 0) {
    return queryToken;
  }
  // Authorization header
  const authHeader = headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }
  return null;
}

/**
 * 验证 JWT，返回用户信息
 */
export function verifyToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as {
      sub: string;
      username: string;
      role: string;
    };
    return {
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add ai-gateway/src/auth.ts
git commit -m "feat(ai-gateway): JWT 认证模块（替换 OpenClaw 设备配对）"
```

---

### Task 3: ChatRunState 内存缓冲（复用 OpenClaw）

**Files:**
- Create: `ai-gateway/src/gateway/server-chat-state.ts`

**说明**：复用 OpenClaw 的 `ChatRunState`，用于实时缓冲流式 chunks。

- [ ] **Step 1: 创建 ChatRunState**

```typescript
// ChatRunState - 实时缓冲流式 chunks（复用 OpenClaw server-chat-state.ts）
// 每个 run 的流式内容缓冲在内存中，供 chat.history 恢复 in-flight run

export interface ChatRunState {
  /** runId → 原始缓冲文本 */
  rawBuffers: Map<string, string>;
  /** runId → 处理后缓冲文本 */
  buffers: Map<string, string>;
  /** runId → 最后更新时间 */
  bufferUpdatedAt: Map<string, number>;
  /** runId → 最后 delta 发送时间 */
  deltaSentAt: Map<string, number>;
  /** runId → 最后广播长度 */
  deltaLastBroadcastLen: Map<string, number>;
  /** runId → 最后广播文本 */
  deltaLastBroadcastText: Map<string, string>;
}

export function createChatRunState(): ChatRunState {
  return {
    rawBuffers: new Map(),
    buffers: new Map(),
    bufferUpdatedAt: new Map(),
    deltaSentAt: new Map(),
    deltaLastBroadcastLen: new Map(),
    deltaLastBroadcastText: new Map(),
  };
}

/**
 * 追加文本到 run 缓冲
 */
export function appendToBuffer(
  state: ChatRunState,
  runId: string,
  text: string
): string {
  const current = state.buffers.get(runId) || '';
  const merged = current + text;
  state.buffers.set(runId, merged);
  state.rawBuffers.set(runId, (state.rawBuffers.get(runId) || '') + text);
  state.bufferUpdatedAt.set(runId, Date.now());
  return merged;
}

/**
 * 获取 run 的当前缓冲文本
 */
export function getBuffer(state: ChatRunState, runId: string): string {
  return state.buffers.get(runId) || '';
}

/**
 * 清理已完成的 run 缓冲
 */
export function cleanupRun(state: ChatRunState, runId: string): void {
  state.buffers.delete(runId);
  state.rawBuffers.delete(runId);
  state.bufferUpdatedAt.delete(runId);
  state.deltaSentAt.delete(runId);
  state.deltaLastBroadcastLen.delete(runId);
  state.deltaLastBroadcastText.delete(runId);
}
```

- [ ] **Step 2: Commit**

```bash
git add ai-gateway/src/gateway/server-chat-state.ts
git commit -m "feat(ai-gateway): ChatRunState 内存缓冲"
```

---

### Task 4: AbortController 管理 + in-flight snapshot（复用 OpenClaw）

**Files:**
- Create: `ai-gateway/src/gateway/chat-abort.ts`

**说明**：复用 OpenClaw 的 AbortController 管理和 `resolveInFlightRunSnapshot`，用于中止任务和恢复正在运行的 run。

- [ ] **Step 1: 创建 chat-abort 模块**

```typescript
// AbortController 管理 + in-flight run 快照（复用 OpenClaw chat-abort.ts）
// 关键：AbortController 存在共享 Map 中，与 WebSocket 连接解耦
// WebSocket 断开不 abort 任何任务

import type { ChatRunState } from './server-chat-state.js';
import { getBuffer } from './server-chat-state.js';

export interface ChatAbortControllerEntry {
  runId: string;
  sessionKey: string;
  controller: AbortController;
  /** 拥有者连接 ID（仅用于授权检查，不用于断连 abort） */
  ownerConnId?: string;
  /** 创建时间 */
  createdAt: number;
}

export interface InFlightRunSnapshot {
  runId: string;
  sessionKey: string;
  /** 已缓冲的文本 */
  bufferedText: string;
  /** 是否仍在运行 */
  isRunning: boolean;
  /** 开始时间 */
  startedAt: number;
}

/**
 * 注册 AbortController
 */
export function registerChatAbortController(params: {
  controllers: Map<string, ChatAbortControllerEntry>;
  runId: string;
  sessionKey: string;
  ownerConnId?: string;
}): AbortController {
  const controller = new AbortController();
  params.controllers.set(params.runId, {
    runId: params.runId,
    sessionKey: params.sessionKey,
    controller,
    ownerConnId: params.ownerConnId,
    createdAt: Date.now(),
  });
  return controller;
}

/**
 * 中止指定 run
 */
export function abortChatRun(
  controllers: Map<string, ChatAbortControllerEntry>,
  runId: string
): boolean {
  const entry = controllers.get(runId);
  if (!entry) return false;
  entry.controller.abort();
  controllers.delete(runId);
  return true;
}

/**
 * 清理已完成的 run
 */
export function completeChatRun(
  controllers: Map<string, ChatAbortControllerEntry>,
  runId: string
): void {
  controllers.delete(runId);
}

/**
 * 解析正在运行的 run 快照（核心健壮性机制）
 * 用于 chat.history 恢复客户端切换走后继续 streaming 的 run
 */
export function resolveInFlightRunSnapshot(params: {
  controllers: Map<string, ChatAbortControllerEntry>;
  chatRunState: ChatRunState;
  requestedSessionKey: string;
}): InFlightRunSnapshot | null {
  const { controllers, chatRunState, requestedSessionKey } = params;

  for (const [runId, entry] of controllers) {
    if (entry.sessionKey !== requestedSessionKey) continue;

    const bufferedText = getBuffer(chatRunState, runId);
    return {
      runId,
      sessionKey: entry.sessionKey,
      bufferedText,
      isRunning: true,
      startedAt: entry.createdAt,
    };
  }
  return null;
}
```

- [ ] **Step 2: Commit**

```bash
git add ai-gateway/src/gateway/chat-abort.ts
git commit -m "feat(ai-gateway): AbortController 管理 + in-flight snapshot"
```

---

### Task 5: seq 序号广播（复用 OpenClaw）

**Files:**
- Create: `ai-gateway/src/gateway/server-broadcast.ts`

**说明**：复用 OpenClaw 的 seq 序号机制，客户端通过 gap 检测触发重连。

- [ ] **Step 1: 创建 server-broadcast 模块**

```typescript
// seq 序号广播（复用 OpenClaw server-broadcast.ts）
// 每个客户端维护递增 seq，客户端检测 gap 触发重连

import type { WebSocket } from 'ws';

export interface ClientConnection {
  connId: string;
  socket: WebSocket;
  userId: string;
  /** 该客户端的 seq 计数器 */
  seq: number;
  /** 订阅的 sessionKey 集合 */
  subscribedSessions: Set<string>;
}

export interface BroadcastEvent {
  event: string;
  payload: unknown;
  /** 目标 sessionKey（undefined 表示广播给所有） */
  targetSessionKey?: string;
  /** 目标 userId（undefined 表示广播给所有） */
  targetUserId?: string;
}

/**
 * 向客户端发送事件帧
 */
export function sendEventToClient(
  client: ClientConnection,
  event: string,
  payload: unknown,
  isTargeted: boolean = false
): void {
  if (client.socket.readyState !== client.socket.OPEN) return;

  const nextSeq = client.seq + 1;
  client.seq = nextSeq;

  const eventSeq = isTargeted ? undefined : nextSeq;
  const seqFragment = eventSeq === undefined ? '' : `,"seq":${eventSeq}`;

  const frame = `{"type":"event","event":"${event}"${seqFragment},"payload":${JSON.stringify(payload)}}`;
  client.socket.send(frame);
}

/**
 * 广播事件给符合条件的客户端
 */
export function broadcastEvent(
  clients: Map<string, ClientConnection>,
  broadcast: BroadcastEvent
): void {
  for (const client of clients.values()) {
    // userId 过滤
    if (broadcast.targetUserId && client.userId !== broadcast.targetUserId) continue;

    // sessionKey 过滤
    if (broadcast.targetSessionKey) {
      if (!client.subscribedSessions.has(broadcast.targetSessionKey)) continue;
    }

    sendEventToClient(
      client,
      broadcast.event,
      broadcast.payload,
      Boolean(broadcast.targetUserId)
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add ai-gateway/src/gateway/server-broadcast.ts
git commit -m "feat(ai-gateway): seq 序号广播"
```

---

### Task 6: ACP 事件账本（复用 OpenClaw，SQLite 持久化）

**Files:**
- Create: `ai-gateway/src/acp/event-ledger.ts`

**说明**：复用 OpenClaw 的 ACP 事件账本，SQLite 持久化记录每个 session update，支持重放。

- [ ] **Step 1: 创建 ACP 事件账本**

```typescript
// ACP 事件账本（复用 OpenClaw event-ledger.ts，SQLite 持久化）
// 记录每个 session update 事件，支持断线重连后重放

import Database from 'better-sqlite3';
import { config } from '../config.js';
import { mkdirSync } from 'fs';
import { dirname } from 'path';

export interface AcpEvent {
  seq: number;
  sessionKey: string;
  eventType: string;
  payload: unknown;
  timestamp: number;
}

let db: Database.Database | null = null;

/**
 * 初始化 SQLite 数据库
 */
export function initEventLedger(): void {
  mkdirSync(dirname(config.sqlitePath), { recursive: true });
  db = new Database(config.sqlitePath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS acp_replay_sessions (
      session_key TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      last_seq INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS acp_replay_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_key TEXT NOT NULL,
      seq INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      FOREIGN KEY (session_key) REFERENCES acp_replay_sessions(session_key)
    );

    CREATE INDEX IF NOT EXISTS idx_acp_events_session_seq
      ON acp_replay_events(session_key, seq);
  `);
}

/**
 * 记录事件
 */
export function recordEvent(
  sessionKey: string,
  eventType: string,
  payload: unknown
): number {
  if (!db) throw new Error('Event ledger not initialized');

  const now = Date.now();
  const session = db.prepare(
    'SELECT last_seq FROM acp_replay_sessions WHERE session_key = ?'
  ).get(sessionKey) as { last_seq: number } | undefined;

  let seq: number;
  if (session) {
    seq = session.last_seq + 1;
    db.prepare(
      'UPDATE acp_replay_sessions SET last_seq = ? WHERE session_key = ?'
    ).run(seq, sessionKey);
  } else {
    seq = 1;
    db.prepare(
      'INSERT INTO acp_replay_sessions (session_key, created_at, last_seq) VALUES (?, ?, ?)'
    ).run(sessionKey, now, seq);
  }

  db.prepare(
    'INSERT INTO acp_replay_events (session_key, seq, event_type, payload, timestamp) VALUES (?, ?, ?, ?, ?)'
  ).run(sessionKey, seq, eventType, JSON.stringify(payload), now);

  return seq;
}

/**
 * 读取 session 的事件重放
 */
export function readReplay(sessionKey: string, fromSeq: number = 0): AcpEvent[] {
  if (!db) throw new Error('Event ledger not initialized');

  const rows = db.prepare(
    'SELECT seq, session_key, event_type, payload, timestamp FROM acp_replay_events WHERE session_key = ? AND seq > ? ORDER BY seq'
  ).all(sessionKey, fromSeq) as Array<{
    seq: number;
    session_key: string;
    event_type: string;
    payload: string;
    timestamp: number;
  }>;

  return rows.map(row => ({
    seq: row.seq,
    sessionKey: row.session_key,
    eventType: row.event_type,
    payload: JSON.parse(row.payload),
    timestamp: row.timestamp,
  }));
}

/**
 * 清理 session 的事件（生成完成后调用）
 */
export function clearSessionEvents(sessionKey: string): void {
  if (!db) return;
  db.prepare('DELETE FROM acp_replay_events WHERE session_key = ?').run(sessionKey);
  db.prepare('DELETE FROM acp_replay_sessions WHERE session_key = ?').run(sessionKey);
}
```

- [ ] **Step 2: Commit**

```bash
git add ai-gateway/src/acp/event-ledger.ts
git commit -m "feat(ai-gateway): ACP 事件账本（SQLite 持久化）"
```

---

### Task 7: SessionActorQueue + AcpSessionManager（复用 OpenClaw 并发管理）

**Files:**
- Create: `ai-gateway/src/acp/control-plane/queue.ts`
- Create: `ai-gateway/src/acp/control-plane/manager.ts`

**说明**：复用 OpenClaw 的并发管理。不同 session 并发执行，同一 session 内串行。

- [ ] **Step 1: 创建 SessionActorQueue**

```typescript
// SessionActorQueue（复用 OpenClaw session-actor-queue.ts）
// 按 sessionKey 串行化操作，不同 session 之间并发

type QueueItem<T> = {
  op: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: Error) => void;
};

export class SessionActorQueue {
  private readonly queues = new Map<string, Promise<void>>();
  private readonly pending = new Map<string, QueueItem<unknown>[]>();

  async run<T>(sessionKey: string, op: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const item: QueueItem<T> = { op, resolve, reject };

      const queue = this.pending.get(sessionKey) || [];
      queue.push(item as QueueItem<unknown>);
      this.pending.set(sessionKey, queue);

      if (!this.queues.has(sessionKey)) {
        this.queues.set(sessionKey, this.processQueue(sessionKey));
      }
    });
  }

  private async processQueue(sessionKey: string): Promise<void> {
    while (true) {
      const queue = this.pending.get(sessionKey);
      if (!queue || queue.length === 0) {
        this.pending.delete(sessionKey);
        this.queues.delete(sessionKey);
        return;
      }

      const item = queue.shift()!;
      try {
        const result = await item.op();
        item.resolve(result);
      } catch (error) {
        item.reject(error as Error);
      }
    }
  }
}
```

- [ ] **Step 2: 创建 AcpSessionManager**

```typescript
// AcpSessionManager（复用 OpenClaw manager.core.ts）
// 按 session 跟踪活跃 turn，不同 session 并发执行
// 可配置 maxConcurrentSessions 上限

import { config } from '../../config.js';
import { SessionActorQueue } from './queue.js';

interface ActiveTurnState {
  sessionKey: string;
  runId: string;
  startedAt: number;
}

export class AcpSessionManager {
  private readonly actorQueue = new SessionActorQueue();
  private readonly activeTurnBySession = new Map<string, ActiveTurnState>();

  /**
   * 执行 session 操作（同一 session 串行，不同 session 并发）
   */
  async runSessionTurn<T>(params: {
    sessionKey: string;
    runId: string;
    op: () => Promise<T>;
  }): Promise<T> {
    this.enforceConcurrentSessionLimit(params.sessionKey);

    return this.actorQueue.run(params.sessionKey, async () => {
      this.activeTurnBySession.set(params.sessionKey, {
        sessionKey: params.sessionKey,
        runId: params.runId,
        startedAt: Date.now(),
      });

      try {
        return await params.op();
      } finally {
        this.activeTurnBySession.delete(params.sessionKey);
      }
    });
  }

  /**
   * 并发 session 上限检查
   */
  private enforceConcurrentSessionLimit(sessionKey: string): void {
    const limit = config.agent.maxConcurrentSessions;
    if (this.activeTurnBySession.has(sessionKey)) return;

    if (this.activeTurnBySession.size >= limit) {
      throw new Error(`ACP_MAX_CONCURRENT_SESSIONS: ${limit}`);
    }
  }

  /**
   * 获取正在运行的 session 数量
   */
  getActiveSessionCount(): number {
    return this.activeTurnBySession.size;
  }

  /**
   * 获取指定 session 的活跃 turn
   */
  getActiveTurn(sessionKey: string): ActiveTurnState | undefined {
    return this.activeTurnBySession.get(sessionKey);
  }
}

export const sessionManager = new AcpSessionManager();
```

- [ ] **Step 3: Commit**

```bash
git add ai-gateway/src/acp/control-plane/
git commit -m "feat(ai-gateway): SessionActorQueue + AcpSessionManager 并发管理"
```

---

### Task 8: WebSocket 连接管理（魔改：移除断连 abort）

**Files:**
- Create: `ai-gateway/src/gateway/ws-connection.ts`

**说明**：复用 OpenClaw 的 WS 连接管理，**关键魔改**：close 处理器不 abort 任何 AI 任务。

- [ ] **Step 1: 创建 WS 连接管理**

```typescript
// WebSocket 连接管理（复用 OpenClaw ws-connection.ts，魔改：断连不 abort）
// 关键：close 处理器只取消订阅事件，不 abort 任何 AI 任务

import type { WebSocket } from 'ws';
import type { ClientConnection } from './server-broadcast.js';
import { verifyToken, parseTokenFromRequest } from '../auth.js';

export interface ConnectionContext {
  clients: Map<string, ClientConnection>;
  chatAbortControllers: Map<string, import('./chat-abort.js').ChatAbortControllerEntry>;
}

/**
 * 处理新的 WebSocket 连接
 */
export function handleConnection(
  socket: WebSocket,
  request: {
    query: Record<string, unknown>;
    headers: Record<string, string | string[] | undefined>;
  },
  context: ConnectionContext
): ClientConnection | null {
  // JWT 认证
  const token = parseTokenFromRequest(request.query, request.headers);
  if (!token) {
    socket.send(JSON.stringify({ type: 'error', error: 'AUTH_TOKEN_MISSING' }));
    socket.close(4001, 'Authentication required');
    return null;
  }

  const user = verifyToken(token);
  if (!user) {
    socket.send(JSON.stringify({ type: 'error', error: 'AUTH_TOKEN_INVALID' }));
    socket.close(4001, 'Invalid token');
    return null;
  }

  const connId = `conn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const client: ClientConnection = {
    connId,
    socket,
    userId: user.userId,
    seq: 0,
    subscribedSessions: new Set(),
  };

  context.clients.set(connId, client);

  // 发送 hello-ok
  socket.send(JSON.stringify({
    type: 'event',
    event: 'hello-ok',
    payload: { connId, userId: user.userId },
  }));

  // close 处理器（魔改：不 abort 任何 AI 任务）
  socket.once('close', () => {
    context.clients.delete(connId);
    // 仅清理订阅，不 abort 任何正在运行的 AI 任务
    client.subscribedSessions.clear();
  });

  return client;
}
```

- [ ] **Step 2: Commit**

```bash
git add ai-gateway/src/gateway/ws-connection.ts
git commit -m "feat(ai-gateway): WebSocket 连接管理（断连不 abort）"
```

---

### Task 9: RPC 方法 - chat.send / chat.history / chat.abort

**Files:**
- Create: `ai-gateway/src/methods/chat.ts`

**说明**：实现核心 RPC 方法。`chat.send` 以 fire-and-forget 方式启动 AI 生成，立即返回 runId。

- [ ] **Step 1: 创建 chat RPC 方法**

```typescript
// chat RPC 方法（复用 OpenClaw server-methods/chat.ts，魔改对接 CloudOps）
// chat.send: fire-and-forget 启动 AI 生成，立即返回 runId
// chat.history: 返回历史消息 + in-flight run 快照
// chat.abort: 中止指定 run

import type { ClientConnection } from '../gateway/server-broadcast.js';
import type { ChatRunState } from '../gateway/server-chat-state.js';
import {
  registerChatAbortController,
  abortChatRun,
  completeChatRun,
  resolveInFlightRunSnapshot,
  type ChatAbortControllerEntry,
} from '../gateway/chat-abort.js';
import { appendToBuffer, getBuffer, cleanupRun } from '../gateway/server-chat-state.js';
import { broadcastEvent, sendEventToClient } from '../gateway/server-broadcast.js';
import { sessionManager } from '../acp/control-plane/manager.js';
import { recordEvent, readReplay } from '../acp/event-ledger.js';
import { runAgentTurn } from '../agent/runner.js';

export interface ChatMethodContext {
  clients: Map<string, ClientConnection>;
  chatRunState: ChatRunState;
  chatAbortControllers: Map<string, ChatAbortControllerEntry>;
}

export interface ChatSendParams {
  sessionKey: string;
  message: string;
  clientRunId?: string;
}

export interface ChatHistoryParams {
  sessionKey: string;
  fromSeq?: number;
}

/**
 * chat.send - 发送消息，启动 AI 生成
 */
export async function handleChatSend(
  client: ClientConnection,
  params: ChatSendParams,
  context: ChatMethodContext,
  respond: (ok: boolean, payload: unknown) => void
): Promise<void> {
  const runId = params.clientRunId || `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sessionKey = params.sessionKey;

  // 幂等性检查
  const existing = context.chatAbortControllers.get(runId);
  if (existing) {
    respond(true, { runId, status: 'in_flight' });
    return;
  }

  // 注册 AbortController
  const controller = registerChatAbortController({
    controllers: context.chatAbortControllers,
    runId,
    sessionKey,
    ownerConnId: client.connId,
  });

  // 立即返回 ack（fire-and-forget）
  respond(true, { runId, status: 'started' });

  // 订阅该 session
  client.subscribedSessions.add(sessionKey);

  // 记录用户消息到 ACP ledger
  recordEvent(sessionKey, 'user_message', { runId, message: params.message });

  // fire-and-forget 启动 AI 生成（与连接解耦）
  sessionManager.runSessionTurn({
    sessionKey,
    runId,
    op: async () => {
      try {
        await runAgentTurn({
          sessionKey,
          runId,
          userMessage: params.message,
          signal: controller.signal,
          onDelta: (delta) => {
            // 缓冲到内存
            appendToBuffer(context.chatRunState, runId, delta);
            // 记录到 ACP ledger
            recordEvent(sessionKey, 'assistant_delta', { runId, delta });
            // 广播 chat 事件
            broadcastEvent(context.clients, {
              event: 'chat',
              targetSessionKey: sessionKey,
              payload: { runId, type: 'text_delta', delta },
            });
          },
          onToolCall: (toolCall) => {
            recordEvent(sessionKey, 'tool_call', { runId, toolCall });
            broadcastEvent(context.clients, {
              event: 'chat',
              targetSessionKey: sessionKey,
              payload: { runId, type: 'tool_call', toolCall },
            });
          },
          onToolResult: (result) => {
            recordEvent(sessionKey, 'tool_result', { runId, result });
            broadcastEvent(context.clients, {
              event: 'chat',
              targetSessionKey: sessionKey,
              payload: { runId, type: 'tool_result', result },
            });
          },
          onComplete: (finalText) => {
            recordEvent(sessionKey, 'assistant_complete', { runId, finalText });
            broadcastEvent(context.clients, {
              event: 'chat',
              targetSessionKey: sessionKey,
              payload: { runId, type: 'done', finalText },
            });
          },
        });
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        recordEvent(sessionKey, 'error', { runId, error: errorMsg });
        broadcastEvent(context.clients, {
          event: 'chat',
          targetSessionKey: sessionKey,
          payload: { runId, type: 'error', error: errorMsg },
        });
      } finally {
        completeChatRun(context.chatAbortControllers, runId);
        // 延迟清理缓冲（供短暂断线重连恢复）
        setTimeout(() => cleanupRun(context.chatRunState, runId), 30000);
      }
    },
  }).catch(() => {
    // 并发限制错误已在 runAgentTurn 中处理
  });
}

/**
 * chat.history - 获取历史消息 + in-flight run 快照
 */
export function handleChatHistory(
  client: ClientConnection,
  params: ChatHistoryParams,
  context: ChatMethodContext,
  respond: (ok: boolean, payload: unknown) => void
): void {
  const sessionKey = params.sessionKey;
  const fromSeq = params.fromSeq || 0;

  // 订阅该 session
  client.subscribedSessions.add(sessionKey);

  // 获取 ACP 事件重放
  const events = readReplay(sessionKey, fromSeq);

  // 获取 in-flight run 快照（核心健壮性机制）
  const inFlightRun = resolveInFlightRunSnapshot({
    controllers: context.chatAbortControllers,
    chatRunState: context.chatRunState,
    requestedSessionKey: sessionKey,
  });

  respond(true, {
    sessionKey,
    events,
    inFlightRun: inFlightRun ? {
      runId: inFlightRun.runId,
      bufferedText: inFlightRun.bufferedText,
      isRunning: inFlightRun.isRunning,
      startedAt: inFlightRun.startedAt,
    } : null,
  });
}

/**
 * chat.abort - 中止指定 run
 */
export function handleChatAbort(
  client: ClientConnection,
  params: { runId: string },
  context: ChatMethodContext,
  respond: (ok: boolean, payload: unknown) => void
): void {
  const entry = context.chatAbortControllers.get(params.runId);
  if (!entry) {
    respond(false, { error: 'RUN_NOT_FOUND' });
    return;
  }

  // 授权检查
  if (entry.ownerConnId && entry.ownerConnId !== client.connId) {
    respond(false, { error: 'NOT_AUTHORIZED' });
    return;
  }

  abortChatRun(context.chatAbortControllers, params.runId);
  respond(true, { runId: params.runId, status: 'aborted' });
}
```

- [ ] **Step 2: Commit**

```bash
git add ai-gateway/src/methods/chat.ts
git commit -m "feat(ai-gateway): chat.send/chat.history/chat.abort RPC 方法"
```

---

### Task 10: RPC 方法 - sessions.subscribe / sessions.messages.subscribe

**Files:**
- Create: `ai-gateway/src/methods/sessions.ts`

- [ ] **Step 1: 创建 sessions RPC 方法**

```typescript
// sessions RPC 方法（复用 OpenClaw server-methods/sessions.ts）
// sessions.subscribe: 订阅 session 事件
// sessions.messages.subscribe: 订阅消息事件
// sessions.unsubscribe: 取消订阅

import type { ClientConnection } from '../gateway/server-broadcast.js';

export interface SessionsMethodContext {
  clients: Map<string, ClientConnection>;
}

export function handleSessionsSubscribe(
  client: ClientConnection,
  params: { sessionKey: string },
  respond: (ok: boolean, payload: unknown) => void
): void {
  client.subscribedSessions.add(params.sessionKey);
  respond(true, { sessionKey: params.sessionKey, subscribed: true });
}

export function handleSessionsUnsubscribe(
  client: ClientConnection,
  params: { sessionKey: string },
  respond: (ok: boolean, payload: unknown) => void
): void {
  client.subscribedSessions.delete(params.sessionKey);
  respond(true, { sessionKey: params.sessionKey, subscribed: false });
}

export function handleSessionsMessagesSubscribe(
  client: ClientConnection,
  params: { sessionKey: string },
  respond: (ok: boolean, payload: unknown) => void
): void {
  // messages.subscribe 等价于 sessions.subscribe（简化实现）
  client.subscribedSessions.add(params.sessionKey);
  respond(true, { sessionKey: params.sessionKey, subscribed: true });
}
```

- [ ] **Step 2: Commit**

```bash
git add ai-gateway/src/methods/sessions.ts
git commit -m "feat(ai-gateway): sessions.subscribe/unsubscribe RPC 方法"
```

---

### Task 11: Agent Runner（复用 ai-agent 逻辑，对接 CloudOps 后端）

**Files:**
- Create: `ai-gateway/src/agent/runner.ts`
- Create: `ai-gateway/src/agent/tools.ts`

**说明**：复用 ai-agent 的 LLM 调用和工具执行逻辑，适配 ai-gateway 的事件回调接口。

- [ ] **Step 1: 创建工具执行模块**

```typescript
// 工具执行（复用 ai-agent 的工具系统，对接 cloud/monitor service）
// 简化版：直接 HTTP 调用后端服务

import { config } from '../config.js';

export interface ToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  name: string;
  success: boolean;
  data: unknown;
  error?: string;
}

/**
 * 执行工具调用
 */
export async function executeTool(
  toolCall: ToolCall,
  authToken: string
): Promise<ToolResult> {
  const { name, arguments: args } = toolCall;

  try {
    switch (name) {
      case 'cloud_list_instances':
        return await callCloudService('/cloud/instances', 'GET', args, authToken);
      case 'cloud_get_instance':
        return await callCloudService(`/cloud/instances/${args.id}`, 'GET', {}, authToken);
      case 'cloud_start_instance':
        return await callCloudService(`/cloud/instances/${args.id}/start`, 'POST', {}, authToken);
      case 'cloud_stop_instance':
        return await callCloudService(`/cloud/instances/${args.id}/stop`, 'POST', {}, authToken);
      case 'cloud_reboot_instance':
        return await callCloudService(`/cloud/instances/${args.id}/reboot`, 'POST', {}, authToken);
      case 'cloud_create_instance':
        return await callCloudService('/cloud/instances', 'POST', args, authToken);
      case 'cloud_delete_instance':
        return await callCloudService(`/cloud/instances/${args.id}`, 'DELETE', {}, authToken);
      case 'monitor_get_metrics':
        return await callMonitorService(`/monitor/metrics/${args.instanceId}`, 'GET', args, authToken);
      case 'monitor_list_alerts':
        return await callMonitorService('/monitor/alerts/events', 'GET', args, authToken);
      case 'monitor_get_cost':
        return await callMonitorService('/monitor/costs/summary', 'GET', args, authToken);
      default:
        return { name, success: false, data: null, error: `Unknown tool: ${name}` };
    }
  } catch (error) {
    return {
      name,
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function callCloudService(
  path: string,
  method: string,
  args: Record<string, unknown>,
  authToken: string
): Promise<ToolResult> {
  const url = new URL(`${config.cloudServiceUrl}${path}`);
  if (method === 'GET') {
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: method !== 'GET' ? JSON.stringify(args) : undefined,
  });

  const data = await res.json();
  return { name: path, success: res.ok, data };
}

async function callMonitorService(
  path: string,
  method: string,
  args: Record<string, unknown>,
  authToken: string
): Promise<ToolResult> {
  const url = new URL(`${config.monitorServiceUrl}${path}`);
  if (method === 'GET') {
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
  }

  const res = await fetch(url.toString(), {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
    },
    body: method !== 'GET' ? JSON.stringify(args) : undefined,
  });

  const data = await res.json();
  return { name: path, success: res.ok, data };
}
```

- [ ] **Step 2: 创建 Agent Runner**

```typescript
// Agent Runner（复用 ai-agent 的 LLM 调用逻辑，适配事件回调）
// 调用 LLM + 执行工具 + 推送事件

import { config } from '../config.js';
import { executeTool, type ToolCall } from './tools.js';

export interface AgentTurnCallbacks {
  onDelta: (delta: string) => void;
  onToolCall: (toolCall: ToolCall) => void;
  onToolResult: (result: { name: string; success: boolean; data: unknown }) => void;
  onComplete: (finalText: string) => void;
}

export interface AgentTurnParams {
  sessionKey: string;
  runId: string;
  userMessage: string;
  signal: AbortSignal;
  authToken?: string;
}

const SYSTEM_PROMPT = `你是 CloudOps AI 运维助手，帮助用户通过自然语言管理多云资源。

你可以：
- 查询、创建、启停、重启、删除云服务器实例
- 查询监控指标和告警事件
- 查询多云成本分析

可用工具：
- cloud_list_instances: 列出云实例
- cloud_get_instance: 查看实例详情
- cloud_start_instance: 启动实例
- cloud_stop_instance: 停止实例
- cloud_reboot_instance: 重启实例
- cloud_create_instance: 创建实例
- cloud_delete_instance: 删除实例
- monitor_get_metrics: 查询监控指标
- monitor_list_alerts: 列出告警事件
- monitor_get_cost: 查询成本

请用中文回复，简洁专业。`;

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'cloud_list_instances',
      description: '列出云服务器实例',
      parameters: {
        type: 'object',
        properties: {
          provider: { type: 'string', description: '云厂商: aws/aliyun/azure' },
          status: { type: 'string', description: '状态: running/stopped' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cloud_get_instance',
      description: '查看实例详情',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: '实例 ID' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cloud_start_instance',
      description: '启动实例',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: '实例 ID' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cloud_stop_instance',
      description: '停止实例',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: '实例 ID' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cloud_reboot_instance',
      description: '重启实例',
      parameters: {
        type: 'object',
        properties: { id: { type: 'string', description: '实例 ID' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'monitor_list_alerts',
      description: '列出告警事件',
      parameters: {
        type: 'object',
        properties: {
          status: { type: 'string', description: '状态: firing/resolved' },
          severity: { type: 'string', description: '严重级别: info/warning/critical/emergency' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'monitor_get_cost',
      description: '查询成本汇总',
      parameters: {
        type: 'object',
        properties: {
          provider: { type: 'string', description: '云厂商' },
        },
      },
    },
  },
];

/**
 * 执行 Agent turn（调用 LLM + 工具循环）
 */
export async function runAgentTurn(
  params: AgentTurnParams,
  callbacks: AgentTurnCallbacks
): Promise<void> {
  const messages: Array<Record<string, unknown>> = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: params.userMessage },
  ];

  let finalText = '';
  let iterations = 0;

  while (iterations < config.agent.maxIterations) {
    iterations++;

    if (params.signal.aborted) {
      throw new Error('Run aborted');
    }

    // 调用 LLM
    const response = await callLLM(messages, params.signal);

    if (response.text) {
      finalText += response.text;
      callbacks.onDelta(response.text);
    }

    if (response.toolCalls.length === 0) {
      break;
    }

    // 添加 assistant 消息
    messages.push({
      role: 'assistant',
      content: response.text || null,
      tool_calls: response.toolCalls.map(tc => ({
        id: tc.id,
        type: 'function',
        function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
      })),
    });

    // 执行工具
    for (const toolCall of response.toolCalls) {
      callbacks.onToolCall(toolCall);

      const result = await executeTool(toolCall, params.authToken || '');
      callbacks.onToolResult(result);

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result.data),
      });
    }
  }

  callbacks.onComplete(finalText);
}

interface LLMResponse {
  text: string;
  toolCalls: ToolCall[];
}

async function callLLM(
  messages: Array<Record<string, unknown>>,
  signal: AbortSignal
): Promise<LLMResponse> {
  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify({
      model: config.llm.model,
      messages,
      temperature: config.llm.temperature,
      max_tokens: config.llm.maxTokens,
      tools: TOOLS,
    }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  const message = choice?.message || {};

  const text = message.content || '';
  const toolCalls: ToolCall[] = (message.tool_calls || []).map((tc: any) => ({
    name: tc.function.name,
    arguments: JSON.parse(tc.function.arguments || '{}'),
  }));

  return { text, toolCalls };
}
```

- [ ] **Step 3: Commit**

```bash
git add ai-gateway/src/agent/
git commit -m "feat(ai-gateway): Agent Runner + 工具执行"
```

---

### Task 12: 服务入口 + RPC 路由分发

**Files:**
- Create: `ai-gateway/src/index.ts`

- [ ] **Step 1: 创建服务入口**

```typescript
// ai-gateway 服务入口

import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { config } from './config.js';
import { initEventLedger } from './acp/event-ledger.js';
import { createChatRunState } from './gateway/server-chat-state.js';
import type { ChatAbortControllerEntry } from './gateway/chat-abort.js';
import type { ClientConnection } from './gateway/server-broadcast.js';
import { handleConnection } from './gateway/ws-connection.js';
import {
  handleChatSend,
  handleChatHistory,
  handleChatAbort,
  type ChatMethodContext,
} from './methods/chat.js';
import {
  handleSessionsSubscribe,
  handleSessionsUnsubscribe,
  handleSessionsMessagesSubscribe,
} from './methods/sessions.js';

// 全局状态
const clients = new Map<string, ClientConnection>();
const chatRunState = createChatRunState();
const chatAbortControllers = new Map<string, ChatAbortControllerEntry>();

const chatContext: ChatMethodContext = { clients, chatRunState, chatAbortControllers };

const app = Fastify({ logger: true });

await app.register(cors, { origin: config.corsOrigin });
await app.register(websocket);

// 健康检查
app.get('/health', async () => ({
  status: 'ok',
  service: 'ai-gateway',
  timestamp: new Date().toISOString(),
  activeSessions: clients.size,
}));

// WebSocket 端点
app.get('/ws', { websocket: true }, (socket, request) => {
  const client = handleConnection(
    socket,
    { query: request.query as Record<string, unknown>, headers: request.headers },
    { clients, chatAbortControllers }
  );

  if (!client) return;

  socket.on('message', async (data: Buffer) => {
    try {
      const frame = JSON.parse(data.toString());

      // 只处理请求帧
      if (frame.type !== 'req') return;

      const { id, method, params } = frame;
      const respond = (ok: boolean, payload: unknown) => {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: 'res', id, ok, payload }));
        }
      };

      switch (method) {
        case 'chat.send':
          await handleChatSend(client, params, chatContext, respond);
          break;
        case 'chat.history':
          handleChatHistory(client, params, chatContext, respond);
          break;
        case 'chat.abort':
          handleChatAbort(client, params, chatContext, respond);
          break;
        case 'sessions.subscribe':
          handleSessionsSubscribe(client, params, respond);
          break;
        case 'sessions.unsubscribe':
          handleSessionsUnsubscribe(client, params, respond);
          break;
        case 'sessions.messages.subscribe':
          handleSessionsMessagesSubscribe(client, params, respond);
          break;
        default:
          respond(false, { error: `Unknown method: ${method}` });
      }
    } catch (error) {
      app.log.error(error);
    }
  });
});

// 初始化 ACP 事件账本
initEventLedger();

// 优雅关闭
const shutdown = () => {
  app.log.info('Shutting down ai-gateway...');
  app.close();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`AI Gateway service running on port ${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
```

- [ ] **Step 2: Commit**

```bash
git add ai-gateway/src/index.ts
git commit -m "feat(ai-gateway): 服务入口 + RPC 路由分发"
```

---

### Task 13: Dockerfile + docker-compose 集成

**Files:**
- Create: `ai-gateway/Dockerfile`
- Modify: `docker-compose.yml`

- [ ] **Step 1: 创建 Dockerfile**

```dockerfile
FROM node:22-alpine AS builder
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app

# 复制 workspace 配置
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY ai-gateway/package.json ./ai-gateway/

# 安装依赖
RUN pnpm install --config.minimumReleaseAge=0 --filter @cloudops/ai-gateway

# 复制源码
COPY ai-gateway/ ./ai-gateway/

# 构建
WORKDIR /app/ai-gateway
RUN pnpm run build

# 运行阶段
FROM node:22-alpine
RUN corepack enable && corepack prepare pnpm@latest --activate
WORKDIR /app/ai-gateway

COPY --from=builder /app/ai-gateway/dist ./dist
COPY --from=builder /app/ai-gateway/package.json ./
COPY --from=builder /app/ai-gateway/node_modules ./node_modules

RUN mkdir -p data

ENV NODE_ENV=production
ENV PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false

EXPOSE 3005
CMD ["node", "dist/index.js"]
```

- [ ] **Step 2: 修改 docker-compose.yml 添加 ai-gateway 服务**

在 `docker-compose.yml` 的 services 部分添加：

```yaml
  ai-gateway:
    build:
      context: .
      dockerfile: ai-gateway/Dockerfile
    ports:
      - "3005:3005"
    environment:
      AI_GATEWAY_PORT: "3005"
      JWT_SECRET: ${JWT_SECRET}
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      LLM_API_KEY: ${LLM_API_KEY:-}
      LLM_BASE_URL: ${LLM_BASE_URL:-https://api.openai.com/v1}
      LLM_MODEL: ${LLM_MODEL:-gpt-4o}
      LLM_TEMPERATURE: ${LLM_TEMPERATURE:-0.3}
      LLM_MAX_TOKENS: ${LLM_MAX_TOKENS:-4096}
      CLOUD_SERVICE_URL: http://cloud-service:3001
      MONITOR_SERVICE_URL: http://monitor-service:3002
      ACP_MAX_CONCURRENT_SESSIONS: "10"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    volumes:
      - ai-gateway-data:/app/ai-gateway/data
    restart: unless-stopped
```

在 volumes 部分添加：

```yaml
  ai-gateway-data:
```

- [ ] **Step 3: 更新 .env.example**

```bash
# AI Gateway
AI_GATEWAY_PORT=3005
ACP_MAX_CONCURRENT_SESSIONS=10
SQLITE_PATH=./data/acp-ledger.db
```

- [ ] **Step 4: 构建并启动**

Run: `docker compose up -d --build ai-gateway`
Expected: 容器构建并启动成功

- [ ] **Step 5: 验证健康检查**

Run: `curl http://localhost:3005/health`
Expected: `{"status":"ok","service":"ai-gateway",...}`

- [ ] **Step 6: Commit**

```bash
git add ai-gateway/Dockerfile docker-compose.yml .env.example
git commit -m "feat(ai-gateway): Dockerfile + docker-compose 集成"
```

---

### Task 14: 端到端验证 - 流式对话 + 健壮性测试

**Files:**
- 无新文件，验证脚本

- [ ] **Step 1: 获取 JWT Token**

Run:
```bash
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin12345"}' | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
echo "Token: ${TOKEN:0:30}..."
```
Expected: Token 获取成功

- [ ] **Step 2: WebSocket 连接 + chat.send 测试**

Run:
```bash
node -e "
const WebSocket = require('ws');
const token = process.argv[1];
const ws = new WebSocket('ws://localhost:3005/ws?token=' + token);
let runId = null;
ws.on('open', () => {
  console.log('[connected]');
  ws.send(JSON.stringify({
    type: 'req', id: '1', method: 'chat.send',
    params: { sessionKey: 'test-session-1', message: '你好' }
  }));
});
ws.on('message', (data) => {
  const evt = JSON.parse(data.toString());
  if (evt.type === 'event' && evt.event === 'hello-ok') console.log('[hello-ok]', evt.payload.connId);
  else if (evt.type === 'res' && evt.id === '1') { runId = evt.payload.runId; console.log('[ack] runId=' + runId); }
  else if (evt.type === 'event' && evt.event === 'chat') {
    if (evt.payload.type === 'text_delta') process.stdout.write(evt.payload.delta);
    else if (evt.payload.type === 'done') { console.log('\n[done]'); ws.close(); }
    else if (evt.payload.type === 'error') { console.log('[error]', evt.payload.error); ws.close(); }
    else console.log('[' + evt.payload.type + ']');
  }
});
ws.on('error', (e) => { console.log('[ws error]', e.message); process.exit(1); });
setTimeout(() => { console.log('\n[timeout]'); process.exit(0); }, 30000);
" "$TOKEN" 2>&1
```
Expected: 收到 hello-ok → ack → text_delta 流式输出 → done

- [ ] **Step 3: 刷新恢复测试 - chat.history**

Run:
```bash
node -e "
const WebSocket = require('ws');
const token = process.argv[1];
const ws = new WebSocket('ws://localhost:3005/ws?token=' + token);
ws.on('open', () => {
  console.log('[reconnected]');
  ws.send(JSON.stringify({
    type: 'req', id: '1', method: 'chat.history',
    params: { sessionKey: 'test-session-1' }
  }));
});
ws.on('message', (data) => {
  const evt = JSON.parse(data.toString());
  if (evt.type === 'res' && evt.id === '1') {
    console.log('[history] events=' + evt.payload.events.length);
    if (evt.payload.inFlightRun) {
      console.log('[inFlightRun] runId=' + evt.payload.inFlightRun.runId);
      console.log('[inFlightRun] bufferedText=' + evt.payload.inFlightRun.bufferedText.slice(0, 50));
    } else {
      console.log('[inFlightRun] null');
    }
    ws.close();
  }
});
ws.on('error', (e) => { console.log('[ws error]', e.message); process.exit(1); });
setTimeout(() => { process.exit(0); }, 10000);
" "$TOKEN" 2>&1
```
Expected: 如果有正在运行的 run，能看到 inFlightRun 和 bufferedText

- [ ] **Step 4: 多 session 并发测试**

Run:
```bash
node -e "
const WebSocket = require('ws');
const token = process.argv[1];
const ws = new WebSocket('ws://localhost:3005/ws?token=' + token);
ws.on('open', () => {
  console.log('[connected]');
  // 同时发送两个 session
  ws.send(JSON.stringify({ type: 'req', id: '1', method: 'chat.send', params: { sessionKey: 'session-A', message: '你好' } }));
  ws.send(JSON.stringify({ type: 'req', id: '2', method: 'chat.send', params: { sessionKey: 'session-B', message: '列出实例' } }));
});
let doneCount = 0;
ws.on('message', (data) => {
  const evt = JSON.parse(data.toString());
  if (evt.type === 'event' && evt.event === 'chat') {
    if (evt.payload.type === 'done') {
      doneCount++;
      console.log('[done] session=' + evt.payload.runId + ' count=' + doneCount);
      if (doneCount >= 2) { ws.close(); process.exit(0); }
    }
  }
});
setTimeout(() => { console.log('[timeout]'); process.exit(0); }, 60000);
" "$TOKEN" 2>&1
```
Expected: 两个 session 并发执行，都收到 done

- [ ] **Step 5: 验证日志**

Run: `docker compose logs ai-gateway 2>&1 | tail -20`
Expected: 看到 WebSocket 连接、chat.send、事件广播日志

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "test(ai-gateway): 端到端验证通过"
```

---

## Phase 5.1 完成标准

- [ ] ai-gateway 服务启动，监听 3005 端口
- [ ] WebSocket 连接需 JWT 认证
- [ ] `chat.send` 能发起 AI 对话，流式推送 chat 事件
- [ ] `chat.history` 能返回历史事件 + in-flight run 快照
- [ ] 刷新页面后能恢复正在运行的 run
- [ ] 多 session 并发正常
- [ ] Docker 容器正常运行

---

## 后续子阶段（待细化）

Phase 5.2-5.7 将在 Phase 5.1 完成后细化：

- **Phase 5.2**: React 前端主壳 + 认证 + 布局 + 路由
- **Phase 5.3**: 云资源管理页 + 监控告警页 + 成本分析页
- **Phase 5.4**: AI 对话页 React 版
- **Phase 5.5**: AI 对话页 OpenClaw Lit 版
- **Phase 5.6**: 用户管理 + 审计日志 + 总览 Dashboard
- **Phase 5.7**: Docker 部署 + 端到端验证
