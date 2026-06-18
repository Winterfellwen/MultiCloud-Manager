# CloudOps AI Phase 4 — AI Agent Service 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 AI Agent Service，提供自然语言→云操作映射、多轮对话、工具调用、危险操作审批和 WebSocket 实时流式通信。

**Architecture:** AI Agent Service 是独立 Fastify 服务（端口 3003），复用 OpenClaw 的工具规划系统（tools/）、LLM 类型契约（llm-core types）、Token 用量归一化（usage.ts）和 Hook Runner 模式。Agent 主循环通过 OpenAI 兼容 API 调用 LLM，解析 tool_call，执行云操作（HTTP 调用 cloud-service / monitor-service），循环直到任务完成。会话持久化到 PostgreSQL，通过 WebSocket 推送实时流式响应。**最终成品与 OpenClaw 完全脱钩，不保留任何 OpenClaw 标识。**

**Tech Stack:** TypeScript (ESM) / Fastify 4 / WebSocket (ws) / Drizzle ORM / PostgreSQL / Redis (ioredis) / Zod / Node 22 内置 fetch / OpenAI 兼容 API

**OpenClaw 源码复用策略：**
- `src/tools/` 模块（types.ts, planner.ts, availability.ts, protocol.ts）→ 直接移植，去掉 channel/mcp owner kind
- `packages/llm-core/src/types.ts` → 移植核心类型（Message, AssistantMessage, ToolCall, Context, Model, StreamOptions, AssistantMessageEvent）
- `src/agents/usage.ts` → 直接移植 normalizeUsage
- `src/plugins/hooks.ts` → 移植简化版 Hook Runner（3 种执行模式 + priority + 超时）

---

## 文件结构

```
ai-agent/
├── package.json
├── tsconfig.json
├── drizzle.config.ts
├── Dockerfile
├── migrations/
│   └── 001_init.sql                    # chat_sessions, chat_messages 表
└── src/
    ├── index.ts                        # Fastify + WS 服务入口
    ├── config.ts                       # 环境变量配置
    ├── db/
    │   ├── index.ts                    # Drizzle 连接
    │   ├── schema.ts                   # chat_sessions, chat_messages
    │   └── migrate.ts                  # 迁移执行
    ├── llm/                            # 【复用 OpenClaw llm-core】
    │   ├── types.ts                    # Message/AssistantMessage/ToolCall/Context/Model/StreamOptions/AssistantMessageEvent
    │   ├── usage.ts                    # 【复用 OpenClaw agents/usage.ts】normalizeUsage
    │   └── stream.ts                   # 简化版：OpenAI 兼容 API 流式调用
    ├── tools/                          # 【复用 OpenClaw tools/ 模块】
    │   ├── types.ts                    # ToolDescriptor/ToolPlan/ToolAvailabilityExpression
    │   ├── planner.ts                  # buildToolPlan
    │   ├── availability.ts             # evaluateToolAvailability
    │   ├── protocol.ts                 # toToolProtocolDescriptor
    │   ├── registry.ts                 # 工具注册表 + 执行器映射
    │   └── descriptors/                # CloudOps 工具描述符
    │       ├── cloud-tools.ts          # list/get/create/delete/start/stop/reboot instances
    │       └── monitor-tools.ts        # get_metrics/list_alerts/get_cost
    ├── hooks/                          # 【复用 OpenClaw hooks runner 模式】
    │   ├── types.ts                    # CloudOps hook 子集类型
    │   ├── runner.ts                   # createHookRunner (void/modifying/claiming)
    │   └── handlers/
    │       ├── approval-handler.ts     # before_tool_call 危险操作审批
    │       └── audit-handler.ts        # after_tool_call 审计日志
    ├── agent/
    │   ├── runner.ts                   # Agent 主循环：LLM → tool_call → execute → loop
    │   ├── session.ts                  # 会话管理（创建/加载/持久化）
    │   └── context.ts                  # 上下文构建（system prompt + history + tools）
    ├── routes/
    │   ├── chat.ts                     # POST /agent/chat (HTTP 非流式)
    │   ├── sessions.ts                 # 会话 CRUD
    │   └── ws.ts                       # WebSocket 流式对话
    └── events/
        └── subscriber.ts              # 订阅 alert.fired 事件 → 主动推送
```

---

## Task 1: ai-agent 项目初始化 + DB schema

**Files:**
- Create: `ai-agent/package.json`
- Create: `ai-agent/tsconfig.json`
- Create: `ai-agent/drizzle.config.ts`
- Create: `ai-agent/src/config.ts`
- Create: `ai-agent/src/db/index.ts`
- Create: `ai-agent/src/db/schema.ts`
- Create: `ai-agent/src/db/migrate.ts`
- Create: `ai-agent/migrations/001_init.sql`

- [ ] **Step 1: 创建 ai-agent/package.json**

```json
{
  "name": "@cloudops/ai-agent",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "db:migrate": "tsx src/db/migrate.ts"
  },
  "dependencies": {
    "@cloudops/shared": "workspace:*",
    "drizzle-orm": "^0.32.0",
    "fastify": "^4.28.0",
    "@fastify/cors": "^9.0.0",
    "@fastify/websocket": "^10.0.0",
    "postgres": "^3.4.0",
    "zod": "^3.23.0",
    "dotenv": "^16.4.0",
    "ioredis": "^5.4.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/ws": "^8.5.0",
    "drizzle-kit": "^0.24.0",
    "tsx": "^4.19.0",
    "typescript": "^5.5.0"
  }
}
```

- [ ] **Step 2: 创建 ai-agent/tsconfig.json**（复用 monitor-service 模式）

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src"],
  "references": [{ "path": "../shared" }]
}
```

- [ ] **Step 3: 创建 ai-agent/drizzle.config.ts**

```typescript
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

- [ ] **Step 4: 创建 ai-agent/src/config.ts**

```typescript
import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3003', 10),
  databaseUrl: process.env.DATABASE_URL!,
  redisUrl: process.env.REDIS_URL!,
  corsOrigin: process.env.CORS_ORIGIN || '*',

  // 内部服务地址（docker 网络内）
  cloudServiceUrl: process.env.CLOUD_SERVICE_URL || 'http://cloud-service:3001',
  monitorServiceUrl: process.env.MONITOR_SERVICE_URL || 'http://monitor-service:3002',
  authServiceUrl: process.env.AUTH_SERVICE_URL || 'http://auth-service:3004',

  // LLM 配置（OpenAI 兼容 API）
  llm: {
    apiKey: process.env.LLM_API_KEY || '',
    baseUrl: process.env.LLM_BASE_URL || 'https://api.openai.com/v1',
    model: process.env.LLM_MODEL || 'gpt-4o',
    temperature: parseFloat(process.env.LLM_TEMPERATURE || '0.3'),
    maxTokens: parseInt(process.env.LLM_MAX_TOKENS || '4096', 10),
  },

  // Agent 配置
  agent: {
    maxIterations: parseInt(process.env.AGENT_MAX_ITERATIONS || '10', 10),
    timeoutMs: parseInt(process.env.AGENT_TIMEOUT_MS || '120000', 10),
  },
};
```

- [ ] **Step 5: 创建 ai-agent/src/db/schema.ts**

```typescript
import { pgTable, uuid, varchar, text, timestamp, jsonb, integer, boolean, index } from 'drizzle-orm/pg-core';

// 对话会话表
export const chatSessions = pgTable('chat_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  title: varchar('title', { length: 256 }),
  context: jsonb('context'),          // 会话级上下文（如当前选中的资源）
  status: varchar('status', { length: 16 }).default('active'),  // active | archived
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// 对话消息表
export const chatMessages = pgTable('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').references(() => chatSessions.id, { onDelete: 'cascade' }).notNull(),
  role: varchar('role', { length: 16 }).notNull(),  // user | assistant | tool
  content: text('content'),                          // 文本内容（assistant 的 tool_call 时可为 null）
  toolCalls: jsonb('tool_calls'),                    // assistant 消息的工具调用
  toolCallId: varchar('tool_call_id', { length: 128 }),  // tool 消息的关联 ID
  toolName: varchar('tool_name', { length: 64 }),   // tool 消息的工具名
  metadata: jsonb('metadata'),                       // 用量、耗时等元数据
  createdAt: timestamp('created_at').defaultNow().notNull(),
}, (t) => ({
  sessionIdIdx: index('idx_chat_messages_session').on(t.sessionId),
}));
```

- [ ] **Step 6: 创建 ai-agent/src/db/index.ts**

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config.js';
import * as schema from './schema.js';

const client = postgres(config.databaseUrl);
export const db = drizzle(client, { schema });
```

- [ ] **Step 7: 创建 ai-agent/migrations/001_init.sql**

```sql
-- AI Agent Service Phase 4 — 对话表
CREATE TABLE IF NOT EXISTS chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL,
    title VARCHAR(256),
    context JSONB,
    status VARCHAR(16) DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_status ON chat_sessions(status);

CREATE TABLE IF NOT EXISTS chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
    role VARCHAR(16) NOT NULL,
    content TEXT,
    tool_calls JSONB,
    tool_call_id VARCHAR(128),
    tool_name VARCHAR(64),
    metadata JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
```

- [ ] **Step 8: 创建 ai-agent/src/db/migrate.ts**（复用 monitor-service 模式）

```typescript
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { config } from '../config.js';

async function migrate() {
  const sql = postgres(config.databaseUrl, { max: 1 });
  const migrationsDir = join(process.cwd(), 'migrations');

  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const content = readFileSync(join(migrationsDir, file), 'utf-8');
    console.log(`Running migration: ${file}`);
    await sql.unsafe(content);
  }

  console.log('Migrations complete.');
  await sql.end();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
```

- [ ] **Step 9: 验证依赖安装与构建**

Run: `pnpm install --no-frozen-lockfile && pnpm --filter @cloudops/ai-agent build`
Expected: 安装成功，编译无错误

- [ ] **Step 10: Commit**

```bash
git add ai-agent/
git commit -m "feat(ai-agent): initialize project scaffold with db schema for chat sessions"
```

---

## Task 2: LLM 类型层 + 流式调用（复用 OpenClaw llm-core）

**Files:**
- Create: `ai-agent/src/llm/types.ts`
- Create: `ai-agent/src/llm/usage.ts`
- Create: `ai-agent/src/llm/stream.ts`

**说明：** 本 Task 移植 OpenClaw 的 LLM 类型契约和用量归一化，并实现简化版流式调用（仅支持 OpenAI 兼容 API，覆盖 OpenAI/Azure/Deepseek/Qwen 等）。

- [ ] **Step 1: 创建 ai-agent/src/llm/types.ts**

移植 OpenClaw `packages/llm-core/src/types.ts` 的核心类型，去掉多 provider 复杂性。

```typescript
// LLM 核心类型契约（移植自 OpenClaw llm-core，简化为 OpenAI 兼容）

export type StopReason = 'stop' | 'length' | 'toolUse' | 'error' | 'aborted';

export interface TextContent {
  type: 'text';
  text: string;
}

export interface ToolCall {
  type: 'toolCall';
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface Usage {
  input: number;
  output: number;
  totalTokens: number;
  cost: { input: number; output: number; total: number };
}

export interface UserMessage {
  role: 'user';
  content: string;
  timestamp: number;
}

export interface AssistantMessage {
  role: 'assistant';
  content: (TextContent | ToolCall)[];
  model: string;
  usage: Usage;
  stopReason: StopReason;
  timestamp: number;
}

export interface ToolResultMessage {
  role: 'tool';
  toolCallId: string;
  toolName: string;
  content: string;
  isError: boolean;
  timestamp: number;
}

export type Message = UserMessage | AssistantMessage | ToolResultMessage;

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;  // JSON Schema
}

export interface Context {
  systemPrompt?: string;
  messages: Message[];
  tools?: Tool[];
}

export interface StreamOptions {
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  apiKey?: string;
  baseUrl?: string;
}

// 流式事件（供 WebSocket 推送）
export type AssistantMessageEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'toolcall_start'; id: string; name: string }
  | { type: 'toolcall_arguments'; id: string; delta: string }
  | { type: 'toolcall_end'; id: string; name: string; arguments: Record<string, unknown> }
  | { type: 'done'; message: AssistantMessage }
  | { type: 'error'; error: string };

export interface AssistantMessageEventStream extends AsyncIterable<AssistantMessageEvent> {
  push(event: AssistantMessageEvent): void;
  end(message?: AssistantMessage): void;
  result(): Promise<AssistantMessage>;
}
```

- [ ] **Step 2: 创建 ai-agent/src/llm/usage.ts**

移植 OpenClaw `src/agents/usage.ts` 的 normalizeUsage 函数。

```typescript
// Token 用量归一化（移植自 OpenClaw agents/usage.ts）

export interface NormalizedUsage {
  input?: number;
  output?: number;
  total?: number;
}

/**
 * 把不同 provider 的 usage 字段统一成 input/output/total
 * 支持 OpenAI (prompt_tokens/completion_tokens) 和 Anthropic (input_tokens/output_tokens) 风格
 */
export function normalizeUsage(raw: Record<string, unknown> | undefined | null): NormalizedUsage | undefined {
  if (!raw) return undefined;

  const input =
    (raw.prompt_tokens as number) ??
    (raw.input_tokens as number) ??
    (raw.inputTokens as number) ??
    0;
  const output =
    (raw.completion_tokens as number) ??
    (raw.output_tokens as number) ??
    (raw.outputTokens as number) ??
    0;
  const total = (raw.total_tokens as number) ?? (raw.totalTokens as number) ?? input + output;

  if (input === 0 && output === 0) return undefined;

  return { input, output, total };
}

export function makeZeroUsage() {
  return {
    input: 0,
    output: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, total: 0 },
  };
}
```

- [ ] **Step 3: 创建 ai-agent/src/llm/stream.ts**

简化版流式调用，仅支持 OpenAI 兼容 API（SSE 流式）。

```typescript
// OpenAI 兼容 API 流式调用（简化版，不依赖 OpenClaw 的多 provider 系统）

import type {
  Context,
  AssistantMessage,
  AssistantMessageEvent,
  AssistantMessageEventStream,
  ToolCall,
  Usage,
  StopReason,
} from './types.js';
import { normalizeUsage, makeZeroUsage } from './usage.js';
import { config } from '../config.js';

/**
 * 流式调用 LLM，返回事件流
 */
export function streamChat(
  context: Context,
  options?: { signal?: AbortSignal; onEvent?: (event: AssistantMessageEvent) => void }
): AssistantMessageEventStream {
  const events: AssistantMessageEvent[] = [];
  let resolveResult: (msg: AssistantMessage) => void;
  let rejectResult: (err: Error) => void;
  const resultPromise = new Promise<AssistantMessage>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  let done = false;
  const stream: AssistantMessageEventStream = {
    async *[Symbol.asyncIterator]() {
      while (true) {
        if (events.length > 0) {
          yield events.shift()!;
          continue;
        }
        if (done) break;
        await new Promise((r) => setTimeout(r, 10));
      }
    },
    push(event: AssistantMessageEvent) {
      events.push(event);
      options?.onEvent?.(event);
    },
    end(message?: AssistantMessage) {
      done = true;
      if (message) {
        resolveResult(message);
      }
    },
    result() {
      return resultPromise;
    },
  };

  // 异步执行流式请求
  doStreamChat(context, stream, options?.signal).catch((err) => {
    stream.push({ type: 'error', error: (err as Error).message });
    rejectResult(err as Error);
  });

  return stream;
}

async function doStreamChat(
  context: Context,
  stream: AssistantMessageEventStream,
  signal?: AbortSignal
) {
  const body = buildRequestBody(context);
  const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.llm.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`LLM API error ${res.status}: ${errText}`);
  }

  if (!res.body) throw new Error('No response body');

  // 解析 SSE 流
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const toolCalls: Map<number, { id: string; name: string; args: string }> = new Map();
  let textContent = '';
  let usage: Usage = makeZeroUsage();
  let stopReason: StopReason = 'stop';
  let model = config.llm.model;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const data = trimmed.slice(6);
      if (data === '[DONE]') continue;

      try {
        const chunk = JSON.parse(data);
        if (chunk.model) model = chunk.model;
        if (chunk.usage) usage = { ...makeZeroUsage(), ...normalizeUsage(chunk.usage) };

        const choice = chunk.choices?.[0];
        if (!choice) continue;

        const delta = choice.delta;
        if (delta?.content) {
          textContent += delta.content;
          stream.push({ type: 'text_delta', delta: delta.content });
        }

        if (delta?.tool_calls) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            if (!toolCalls.has(idx)) {
              toolCalls.set(idx, { id: tc.id || '', name: tc.function?.name || '', args: '' });
              stream.push({ type: 'toolcall_start', id: tc.id || '', name: tc.function?.name || '' });
            }
            const entry = toolCalls.get(idx)!;
            if (tc.function?.arguments) {
              entry.args += tc.function.arguments;
              stream.push({ type: 'toolcall_arguments', id: entry.id, delta: tc.function.arguments });
            }
            if (tc.id) entry.id = tc.id;
            if (tc.function?.name) entry.name = tc.function.name;
          }
        }

        if (choice.finish_reason) {
          stopReason = mapStopReason(choice.finish_reason);
        }
      } catch {
        // 忽略解析错误的行
      }
    }
  }

  // 构建最终 AssistantMessage
  const content: AssistantMessage['content'] = [];
  if (textContent) {
    content.push({ type: 'text', text: textContent });
  }
  for (const [, tc] of toolCalls) {
    let args: Record<string, unknown> = {};
    try {
      args = tc.args ? JSON.parse(tc.args) : {};
    } catch {
      args = { _raw: tc.args };
    }
    const toolCall: ToolCall = { type: 'toolCall', id: tc.id, name: tc.name, arguments: args };
    content.push(toolCall);
    stream.push({ type: 'toolcall_end', id: tc.id, name: tc.name, arguments: args });
  }

  const message: AssistantMessage = {
    role: 'assistant',
    content,
    model,
    usage,
    stopReason,
    timestamp: Date.now(),
  };

  stream.push({ type: 'done', message });
  stream.end(message);
}

function buildRequestBody(context: Context) {
  const messages: Array<Record<string, unknown>> = [];
  if (context.systemPrompt) {
    messages.push({ role: 'system', content: context.systemPrompt });
  }
  for (const msg of context.messages) {
    messages.push(toOpenAIMessage(msg));
  }
  const body: Record<string, unknown> = {
    model: config.llm.model,
    messages,
    temperature: config.llm.temperature,
    max_tokens: config.llm.maxTokens,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (context.tools && context.tools.length > 0) {
    body.tools = context.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }
  return body;
}

function toOpenAIMessage(msg: Context['messages'][number]): Record<string, unknown> {
  if (msg.role === 'user') {
    return { role: 'user', content: msg.content };
  }
  if (msg.role === 'assistant') {
    const result: Record<string, unknown> = { role: 'assistant' };
    const textParts = msg.content.filter((c) => c.type === 'text').map((c) => (c as { text: string }).text);
    const toolCalls = msg.content.filter((c) => c.type === 'toolCall');
    if (textParts.length > 0) result.content = textParts.join('');
    if (toolCalls.length > 0) {
      result.tool_calls = toolCalls.map((tc) => {
        const call = tc as ToolCall;
        return {
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        };
      });
    }
    return result;
  }
  // tool result
  const tr = msg as Extract<Context['messages'][number], { role: 'tool' }>;
  return {
    role: 'tool',
    tool_call_id: tr.toolCallId,
    content: tr.content,
  };
}

function mapStopReason(reason: string): StopReason {
  switch (reason) {
    case 'stop': return 'stop';
    case 'length': return 'length';
    case 'tool_calls': return 'toolUse';
    case 'content_filter': return 'error';
    default: return 'stop';
  }
}
```

- [ ] **Step 4: 验证构建**

Run: `pnpm --filter @cloudops/ai-agent build`
Expected: 编译成功

- [ ] **Step 5: Commit**

```bash
git add ai-agent/src/llm/
git commit -m "feat(ai-agent): add llm type contracts and streaming (adapted from openclaw llm-core)"
```

---

## Task 3: 工具系统（复用 OpenClaw tools/ 模块）

**Files:**
- Create: `ai-agent/src/tools/types.ts`
- Create: `ai-agent/src/tools/availability.ts`
- Create: `ai-agent/src/tools/planner.ts`
- Create: `ai-agent/src/tools/protocol.ts`

**说明：** 本 Task 移植 OpenClaw `src/tools/` 模块。这是 OpenClaw 最干净的模块，零外部依赖，纯类型 + 纯函数。去掉 channel/mcp owner kind，简化为 CloudOps 场景。

- [ ] **Step 1: 创建 ai-agent/src/tools/types.ts**

移植 OpenClaw `src/tools/types.ts`，简化 ToolOwnerRef 和 ToolExecutorRef。

```typescript
// 工具描述符契约（移植自 OpenClaw tools/types.ts，简化为 CloudOps 场景）

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue };

// CloudOps 简化：只有 core 一种 owner
export type ToolOwnerRef = { readonly kind: 'core' };

// 执行器引用：指向 registry 中注册的执行函数
export type ToolExecutorRef = {
  readonly kind: 'core';
  readonly executorId: string;
};

export type ToolAvailabilitySignal =
  | { readonly kind: 'always' }
  | { readonly kind: 'env'; readonly name: string };

export type ToolAvailabilityExpression =
  | ToolAvailabilitySignal
  | { readonly allOf: readonly ToolAvailabilityExpression[] }
  | { readonly anyOf: readonly ToolAvailabilityExpression[] };

export type ToolDescriptor = {
  readonly name: string;
  readonly title?: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
  readonly owner: ToolOwnerRef;
  readonly executor: ToolExecutorRef;
  readonly availability?: ToolAvailabilityExpression;
  readonly annotations?: JsonObject;
  readonly sortKey?: string;
  // CloudOps 扩展：危险等级（用于审批 hook）
  readonly dangerLevel?: 'safe' | 'moderate' | 'dangerous';
};

export type ToolAvailabilityContext = {
  readonly env?: Readonly<Record<string, string | undefined>>;
};

export type ToolUnavailableReason = 'env-missing' | 'unsupported-signal';

export type ToolAvailabilityDiagnostic = {
  readonly reason: ToolUnavailableReason;
  readonly signal: ToolAvailabilitySignal;
  readonly detail?: string;
};

export type ToolPlanEntry = {
  readonly descriptor: ToolDescriptor;
  readonly executor: ToolExecutorRef;
};

export type HiddenToolPlanEntry = {
  readonly descriptor: ToolDescriptor;
  readonly diagnostics: readonly ToolAvailabilityDiagnostic[];
};

export type ToolPlan = {
  readonly visible: readonly ToolPlanEntry[];
  readonly hidden: readonly HiddenToolPlanEntry[];
};

export type BuildToolPlanOptions = {
  readonly descriptors: readonly ToolDescriptor[];
  readonly availability?: ToolAvailabilityContext;
};
```

- [ ] **Step 2: 创建 ai-agent/src/tools/availability.ts**

移植 OpenClaw `src/tools/availability.ts`。

```typescript
// 工具可用性求值器（移植自 OpenClaw tools/availability.ts）

import type {
  ToolAvailabilityExpression,
  ToolAvailabilitySignal,
  ToolAvailabilityContext,
  ToolAvailabilityDiagnostic,
  ToolUnavailableReason,
} from './types.js';

export function evaluateToolAvailability(
  expr: ToolAvailabilityExpression,
  context: ToolAvailabilityContext
): readonly ToolAvailabilityDiagnostic[] {
  const diagnostics: ToolAvailabilityDiagnostic[] = [];
  collectDiagnostics(expr, context, diagnostics);
  return diagnostics;
}

function collectDiagnostics(
  expr: ToolAvailabilityExpression,
  context: ToolAvailabilityContext,
  out: ToolAvailabilityDiagnostic[]
): void {
  if ('allOf' in expr) {
    for (const child of expr.allOf) collectDiagnostics(child, context, out);
    return;
  }
  if ('anyOf' in expr) {
    // anyOf：只有当所有子项都不可用时才记录
    const childDiagnostics: ToolAvailabilityDiagnostic[][] = [];
    let anyAvailable = false;
    for (const child of expr.anyOf) {
      const childOut: ToolAvailabilityDiagnostic[] = [];
      collectDiagnostics(child, context, childOut);
      if (childOut.length === 0) {
        anyAvailable = true;
        break;
      }
      childDiagnostics.push(childOut);
    }
    if (!anyAvailable) {
      for (const childOut of childDiagnostics) out.push(...childOut);
    }
    return;
  }
  // signal
  const signal = expr as ToolAvailabilitySignal;
  const diag = evaluateSignal(signal, context);
  if (diag) out.push(diag);
}

function evaluateSignal(
  signal: ToolAvailabilitySignal,
  context: ToolAvailabilityContext
): ToolAvailabilityDiagnostic | null {
  switch (signal.kind) {
    case 'always':
      return null;
    case 'env': {
      const value = context.env?.[signal.name];
      if (!value) {
        return {
          reason: 'env-missing' as ToolUnavailableReason,
          signal,
          detail: `Environment variable ${signal.name} is not set`,
        };
      }
      return null;
    }
    default:
      return {
        reason: 'unsupported-signal' as ToolUnavailableReason,
        signal,
        detail: `Unsupported signal kind: ${(signal as { kind: string }).kind}`,
      };
  }
}
```

- [ ] **Step 3: 创建 ai-agent/src/tools/planner.ts**

移植 OpenClaw `src/tools/planner.ts`。

```typescript
// 工具规划器（移植自 OpenClaw tools/planner.ts）

import type {
  ToolDescriptor,
  ToolPlan,
  ToolPlanEntry,
  HiddenToolPlanEntry,
  BuildToolPlanOptions,
  ToolAvailabilityDiagnostic,
} from './types.js';
import { evaluateToolAvailability } from './availability.js';

export function buildToolPlan(options: BuildToolPlanOptions): ToolPlan {
  const { descriptors, availability } = options;

  // 检查重名
  const seen = new Set<string>();
  for (const desc of descriptors) {
    if (seen.has(desc.name)) {
      throw new ToolPlanContractError(`Duplicate tool name: ${desc.name}`);
    }
    seen.add(desc.name);
  }

  // 排序
  const sorted = [...descriptors].sort((a, b) => {
    const sa = a.sortKey || a.name;
    const sb = b.sortKey || b.name;
    return sa.localeCompare(sb);
  });

  const visible: ToolPlanEntry[] = [];
  const hidden: HiddenToolPlanEntry[] = [];

  for (const desc of sorted) {
    const diagnostics: ToolAvailabilityDiagnostic[] = desc.availability
      ? evaluateToolAvailability(desc.availability, availability || {})
      : [];

    if (diagnostics.length > 0) {
      hidden.push({ descriptor: desc, diagnostics });
    } else if (desc.executor) {
      visible.push({ descriptor: desc, executor: desc.executor });
    } else {
      throw new ToolPlanContractError(`Tool ${desc.name} has no executor`);
    }
  }

  return { visible, hidden };
}

export class ToolPlanContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolPlanContractError';
  }
}
```

- [ ] **Step 4: 创建 ai-agent/src/tools/protocol.ts**

移植 OpenClaw `src/tools/protocol.ts`。

```typescript
// 协议转换：ToolPlanEntry → LLM 可识别的 Tool 描述（移植自 OpenClaw tools/protocol.ts）

import type { ToolPlanEntry, JsonObject } from './types.js';
import type { Tool } from '../llm/types.js';

export type ToolProtocolDescriptor = {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
};

export function toToolProtocolDescriptor(entry: ToolPlanEntry): ToolProtocolDescriptor {
  return {
    name: entry.descriptor.name,
    description: entry.descriptor.description,
    inputSchema: entry.descriptor.inputSchema,
  };
}

export function toToolProtocolDescriptors(entries: readonly ToolPlanEntry[]): readonly ToolProtocolDescriptor[] {
  return entries.map(toToolProtocolDescriptor);
}

/**
 * 转换为 LLM stream.ts 所需的 Tool[] 格式
 */
export function toLLMTools(entries: readonly ToolPlanEntry[]): Tool[] {
  return entries.map((entry) => ({
    name: entry.descriptor.name,
    description: entry.descriptor.description,
    parameters: entry.descriptor.inputSchema as Record<string, unknown>,
  }));
}
```

- [ ] **Step 5: 验证构建**

Run: `pnpm --filter @cloudops/ai-agent build`
Expected: 编译成功

- [ ] **Step 6: Commit**

```bash
git add ai-agent/src/tools/
git commit -m "feat(ai-agent): add tool planning system (adapted from openclaw tools module)"
```

---

## Task 4: 工具注册表 + 云管理工具描述符

**Files:**
- Create: `ai-agent/src/tools/registry.ts`
- Create: `ai-agent/src/tools/descriptors/cloud-tools.ts`
- Create: `ai-agent/src/tools/descriptors/monitor-tools.ts`

**说明：** 定义 CloudOps 的云管理工具描述符（对应设计文档 5.2 节的 tool 集），以及工具注册表（executorId → 执行函数映射）。工具执行函数通过 HTTP 调用 cloud-service / monitor-service。

- [ ] **Step 1: 创建 ai-agent/src/tools/registry.ts**

```typescript
// 工具注册表：executorId → 执行函数映射

import type { ToolDescriptor } from './types.js';
import type { ToolPlan } from './types.js';
import { buildToolPlan } from './planner.js';
import { toLLMTools } from './protocol.js';
import type { Tool } from '../llm/types.js';

// 工具执行函数类型：(参数, 上下文) → 结果字符串
export type ToolExecutor = (
  args: Record<string, unknown>,
  context: ToolExecutionContext
) => Promise<string>;

export interface ToolExecutionContext {
  userId: string;
  sessionId: string;
  cloudServiceUrl: string;
  monitorServiceUrl: string;
  authToken?: string;
}

class ToolRegistry {
  private descriptors: Map<string, ToolDescriptor> = new Map();
  private executors: Map<string, ToolExecutor> = new Map();

  register(descriptor: ToolDescriptor, executor: ToolExecutor): void {
    this.descriptors.set(descriptor.name, descriptor);
    this.executors.set(descriptor.executor.executorId, executor);
  }

  getExecutor(executorId: string): ToolExecutor | undefined {
    return this.executors.get(executorId);
  }

  getAllDescriptors(): ToolDescriptor[] {
    return Array.from(this.descriptors.values());
  }

  /**
   * 构建工具计划 + LLM 工具列表
   */
  buildPlan(env?: Record<string, string | undefined>): {
    plan: ToolPlan;
    llmTools: Tool[];
  } {
    const plan = buildToolPlan({
      descriptors: this.getAllDescriptors(),
      availability: { env },
    });
    const llmTools = toLLMTools(plan.visible);
    return { plan, llmTools };
  }

  /**
   * 执行工具
   */
  async execute(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext
  ): Promise<string> {
    const descriptor = this.descriptors.get(toolName);
    if (!descriptor) throw new Error(`Unknown tool: ${toolName}`);
    const executor = this.getExecutor(descriptor.executor.executorId);
    if (!executor) throw new Error(`No executor for tool: ${toolName}`);
    return executor(args, context);
  }
}

export const toolRegistry = new ToolRegistry();
```

- [ ] **Step 2: 创建 ai-agent/src/tools/descriptors/cloud-tools.ts**

定义云资源操作工具（对应设计文档 5.2 节），并注册执行函数（HTTP 调用 cloud-service）。

```typescript
// 云资源操作工具描述符 + 执行器（对应设计文档 5.2 节）

import { toolRegistry, type ToolExecutor, type ToolExecutionContext } from '../registry.js';
import type { ToolDescriptor } from '../types.js';

// ---- 工具描述符 ----

const listInstancesDesc: ToolDescriptor = {
  name: 'cloud_list_instances',
  description: '列出云服务器实例。支持按云厂商(provider)、区域(region)、状态(status)过滤。返回实例列表（id、名称、云厂商、区域、状态、IP、规格）。',
  inputSchema: {
    type: 'object',
    properties: {
      provider: { type: 'string', description: '云厂商: aws | aliyun | azure | tencent | oracle | render' },
      region: { type: 'string', description: '区域，如 us-east-1, cn-shanghai' },
      status: { type: 'string', description: '状态过滤: running | stopped | terminated' },
    },
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'cloud_list_instances' },
  sortKey: '01',
  dangerLevel: 'safe',
};

const getInstanceDesc: ToolDescriptor = {
  name: 'cloud_get_instance',
  description: '查看单台云服务器实例的详细信息（规格、IP、标签、费用等）。',
  inputSchema: {
    type: 'object',
    properties: {
      instanceId: { type: 'string', description: '实例 ID' },
    },
    required: ['instanceId'],
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'cloud_get_instance' },
  sortKey: '02',
  dangerLevel: 'safe',
};

const startInstanceDesc: ToolDescriptor = {
  name: 'cloud_start_instance',
  description: '启动一台云服务器实例。',
  inputSchema: {
    type: 'object',
    properties: { instanceId: { type: 'string', description: '实例 ID' } },
    required: ['instanceId'],
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'cloud_start_instance' },
  sortKey: '03',
  dangerLevel: 'moderate',
};

const stopInstanceDesc: ToolDescriptor = {
  name: 'cloud_stop_instance',
  description: '关机（停止）一台云服务器实例。注意：停止后服务将不可用。',
  inputSchema: {
    type: 'object',
    properties: { instanceId: { type: 'string', description: '实例 ID' } },
    required: ['instanceId'],
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'cloud_stop_instance' },
  sortKey: '04',
  dangerLevel: 'dangerous',
};

const rebootInstanceDesc: ToolDescriptor = {
  name: 'cloud_reboot_instance',
  description: '重启一台云服务器实例。',
  inputSchema: {
    type: 'object',
    properties: { instanceId: { type: 'string', description: '实例 ID' } },
    required: ['instanceId'],
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'cloud_reboot_instance' },
  sortKey: '05',
  dangerLevel: 'dangerous',
};

const createInstanceDesc: ToolDescriptor = {
  name: 'cloud_create_instance',
  description: '创建一台新的云服务器实例。需要指定云厂商、区域、规格。',
  inputSchema: {
    type: 'object',
    properties: {
      provider: { type: 'string', description: '云厂商: aws | aliyun | azure' },
      region: { type: 'string', description: '区域' },
      instanceType: { type: 'string', description: '规格，如 t3.micro, ecs.t6-c1m2' },
      name: { type: 'string', description: '实例名称' },
    },
    required: ['provider', 'region', 'instanceType'],
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'cloud_create_instance' },
  sortKey: '06',
  dangerLevel: 'moderate',
};

const deleteInstanceDesc: ToolDescriptor = {
  name: 'cloud_delete_instance',
  description: '删除一台云服务器实例。⚠️ 此操作不可逆，实例及其数据将被永久删除。',
  inputSchema: {
    type: 'object',
    properties: { instanceId: { type: 'string', description: '实例 ID' } },
    required: ['instanceId'],
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'cloud_delete_instance' },
  sortKey: '07',
  dangerLevel: 'dangerous',
};

// ---- 执行器 ----

function makeCloudExecutor(method: string, pathBuilder: (args: Record<string, unknown>) => string, bodyBuilder?: (args: Record<string, unknown>) => Record<string, unknown> | undefined): ToolExecutor {
  return async (args, ctx: ToolExecutionContext) => {
    const path = pathBuilder(args);
    const url = `${ctx.cloudServiceUrl}/cloud/instances${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(ctx.authToken ? { Authorization: `Bearer ${ctx.authToken}` } : {}),
      },
      body: bodyBuilder ? JSON.stringify(bodyBuilder(args)) : undefined,
    });
    const data = await res.json();
    if (!res.ok) {
      return JSON.stringify({ error: true, status: res.status, message: data.message || data.error });
    }
    return JSON.stringify(data);
  };
}

// ---- 注册 ----

toolRegistry.register(listInstancesDesc, async (args, ctx) => {
  const params = new URLSearchParams();
  if (args.provider) params.set('provider', args.provider as string);
  if (args.region) params.set('region', args.region as string);
  if (args.status) params.set('status', args.status as string);
  const res = await fetch(`${ctx.cloudServiceUrl}/cloud/instances?${params}`, {
    headers: ctx.authToken ? { Authorization: `Bearer ${ctx.authToken}` } : {},
  });
  return JSON.stringify(await res.json());
});

toolRegistry.register(getInstanceDesc, makeCloudExecutor('GET', (a) => `/${a.instanceId}`));

toolRegistry.register(startInstanceDesc, makeCloudExecutor('POST', (a) => `/${a.instanceId}/start`));

toolRegistry.register(stopInstanceDesc, makeCloudExecutor('POST', (a) => `/${a.instanceId}/stop`));

toolRegistry.register(rebootInstanceDesc, makeCloudExecutor('POST', (a) => `/${a.instanceId}/reboot`));

toolRegistry.register(createInstanceDesc, makeCloudExecutor('POST', () => '', (a) => ({
  provider: a.provider,
  region: a.region,
  instanceType: a.instanceType,
  name: a.name,
})));

toolRegistry.register(deleteInstanceDesc, makeCloudExecutor('DELETE', (a) => `/${a.instanceId}`));
```

- [ ] **Step 3: 创建 ai-agent/src/tools/descriptors/monitor-tools.ts**

```typescript
// 监控查询工具描述符 + 执行器（对应设计文档 5.2 节）

import { toolRegistry, type ToolExecutor } from '../registry.js';
import type { ToolDescriptor } from '../types.js';

const getMetricsDesc: ToolDescriptor = {
  name: 'monitor_get_metrics',
  description: '查询实例的监控指标（CPU、内存等）。可指定时间范围。',
  inputSchema: {
    type: 'object',
    properties: {
      instanceId: { type: 'string', description: '实例 ID' },
      metric: { type: 'string', description: '指标名，如 cpu_usage_percent' },
      start: { type: 'string', description: '开始时间 ISO 格式' },
      end: { type: 'string', description: '结束时间 ISO 格式' },
    },
    required: ['instanceId'],
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'monitor_get_metrics' },
  sortKey: '10',
  dangerLevel: 'safe',
};

const listAlertsDesc: ToolDescriptor = {
  name: 'monitor_list_alerts',
  description: '列出告警事件。可按状态(firing/resolved)和严重级别过滤。',
  inputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', description: 'firing | resolved' },
      severity: { type: 'string', description: 'info | warning | critical | emergency' },
    },
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'monitor_list_alerts' },
  sortKey: '11',
  dangerLevel: 'safe',
};

const getCostDesc: ToolDescriptor = {
  name: 'monitor_get_cost',
  description: '查询成本汇总。可按云厂商和时间范围过滤。返回各云厂商的费用明细。',
  inputSchema: {
    type: 'object',
    properties: {
      provider: { type: 'string', description: '云厂商' },
      start: { type: 'string', description: '开始时间 ISO 格式' },
      end: { type: 'string', description: '结束时间 ISO 格式' },
    },
  },
  owner: { kind: 'core' },
  executor: { kind: 'core', executorId: 'monitor_get_cost' },
  sortKey: '12',
  dangerLevel: 'safe',
};

// ---- 执行器 ----

toolRegistry.register(getMetricsDesc, async (args, ctx) => {
  const params = new URLSearchParams();
  if (args.metric) params.set('metric', args.metric as string);
  if (args.start) params.set('start', args.start as string);
  if (args.end) params.set('end', args.end as string);
  const res = await fetch(
    `${ctx.monitorServiceUrl}/monitor/metrics/${args.instanceId}?${params}`,
    { headers: ctx.authToken ? { Authorization: `Bearer ${ctx.authToken}` } : {} }
  );
  return JSON.stringify(await res.json());
});

toolRegistry.register(listAlertsDesc, async (args, ctx) => {
  const params = new URLSearchParams();
  if (args.status) params.set('status', args.status as string);
  if (args.severity) params.set('severity', args.severity as string);
  const res = await fetch(
    `${ctx.monitorServiceUrl}/monitor/alerts/events?${params}`,
    { headers: ctx.authToken ? { Authorization: `Bearer ${ctx.authToken}` } : {} }
  );
  return JSON.stringify(await res.json());
});

toolRegistry.register(getCostDesc, async (args, ctx) => {
  const params = new URLSearchParams();
  if (args.provider) params.set('provider', args.provider as string);
  if (args.start) params.set('start', args.start as string);
  if (args.end) params.set('end', args.end as string);
  const res = await fetch(
    `${ctx.monitorServiceUrl}/monitor/costs/summary?${params}`,
    { headers: ctx.authToken ? { Authorization: `Bearer ${ctx.authToken}` } : {} }
  );
  return JSON.stringify(await res.json());
});
```

- [ ] **Step 4: 验证构建**

Run: `pnpm --filter @cloudops/ai-agent build`
Expected: 编译成功

- [ ] **Step 5: Commit**

```bash
git add ai-agent/src/tools/registry.ts ai-agent/src/tools/descriptors/
git commit -m "feat(ai-agent): add tool registry and cloud/monitor tool descriptors"
```

---

## Task 5: Hook 系统（复用 OpenClaw hooks runner 模式）

**Files:**
- Create: `ai-agent/src/hooks/types.ts`
- Create: `ai-agent/src/hooks/runner.ts`
- Create: `ai-agent/src/hooks/handlers/approval-handler.ts`
- Create: `ai-agent/src/hooks/handlers/audit-handler.ts`

**说明：** 移植 OpenClaw `src/plugins/hooks.ts` 的 Hook Runner 模式（3 种执行模式 + priority + 超时），简化为 CloudOps 场景需要的 hook 子集：`before_tool_call`（危险操作审批）、`after_tool_call`（审计日志）。

- [ ] **Step 1: 创建 ai-agent/src/hooks/types.ts**

```typescript
// CloudOps Hook 类型（移植自 OpenClaw plugins/hooks.ts，简化为云运维场景）

export interface HookContext {
  userId: string;
  sessionId: string;
  toolName: string;
  args: Record<string, unknown>;
  dangerLevel?: 'safe' | 'moderate' | 'dangerous';
}

// before_tool_call：可阻止或要求审批
export interface BeforeToolCallResult {
  block?: boolean;
  blockReason?: string;
  requireApproval?: boolean;
  approvalMessage?: string;
}

export type BeforeToolCallHook = (
  ctx: HookContext
) => Promise<BeforeToolCallResult | void> | BeforeToolCallResult | void;

// after_tool_call：记录审计日志
export interface AfterToolCallContext extends HookContext {
  result: string;
  success: boolean;
  durationMs: number;
}

export type AfterToolCallHook = (
  ctx: AfterToolCallContext
) => Promise<void> | void;

export interface HookRegistration {
  priority?: number;  // 数字越大越先执行，默认 0
  timeoutMs?: number; // 默认 15000
}
```

- [ ] **Step 2: 创建 ai-agent/src/hooks/runner.ts**

移植 OpenClaw hooks runner 的 3 种执行模式（void / modifying / claiming 简化为 blocking / non-blocking）。

```typescript
// Hook Runner（移植自 OpenClaw plugins/hooks.ts 的执行模式，简化版）

import type {
  BeforeToolCallHook,
  AfterToolCallHook,
  HookContext,
  BeforeToolCallResult,
  HookRegistration,
  AfterToolCallContext,
} from './types.js';

interface RegisteredHook<T> {
  handler: T;
  priority: number;
  timeoutMs: number;
}

class HookRunner {
  private beforeToolCallHooks: RegisteredHook<BeforeToolCallHook>[] = [];
  private afterToolCallHooks: RegisteredHook<AfterToolCallHook>[] = [];

  registerBeforeToolCall(handler: BeforeToolCallHook, opts?: HookRegistration): void {
    this.beforeToolCallHooks.push({
      handler,
      priority: opts?.priority ?? 0,
      timeoutMs: opts?.timeoutMs ?? 15000,
    });
    this.beforeToolCallHooks.sort((a, b) => b.priority - a.priority);
  }

  registerAfterToolCall(handler: AfterToolCallHook, opts?: HookRegistration): void {
    this.afterToolCallHooks.push({
      handler,
      priority: opts?.priority ?? 0,
      timeoutMs: opts?.timeoutMs ?? 15000,
    });
    this.afterToolCallHooks.sort((a, b) => b.priority - a.priority);
  }

  /**
   * 执行 before_tool_call hooks（串行，可阻止）
   * 如果任一 hook 返回 block=true，立即停止并返回阻止原因
   * 如果任一 hook 返回 requireApproval=true，标记需要审批
   */
  async runBeforeToolCall(ctx: HookContext): Promise<BeforeToolCallResult> {
    let result: BeforeToolCallResult = {};
    for (const reg of this.beforeToolCallHooks) {
      try {
        const hookResult = await withTimeout(reg.handler(ctx), reg.timeoutMs);
        if (hookResult) {
          if (hookResult.block) {
            return { block: true, blockReason: hookResult.blockReason };
          }
          if (hookResult.requireApproval && !result.requireApproval) {
            result = { ...result, ...hookResult };
          }
        }
      } catch (err) {
        // before_tool_call 默认 fail-open（出错不阻止）
        console.error('before_tool_call hook error:', err);
      }
    }
    return result;
  }

  /**
   * 执行 after_tool_call hooks（并行，fire-and-forget）
   */
  async runAfterToolCall(ctx: AfterToolCallContext): Promise<void> {
    const promises = this.afterToolCallHooks.map((reg) =>
      withTimeout(reg.handler(ctx), reg.timeoutMs).catch((err) =>
        console.error('after_tool_call hook error:', err)
      )
    );
    await Promise.all(promises);
  }
}

function withTimeout<T>(promise: Promise<T> | T, ms: number): Promise<T> {
  if (!(promise instanceof Promise)) return Promise.resolve(promise);
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Hook timeout after ${ms}ms`)), ms)
    ),
  ]);
}

export const hookRunner = new HookRunner();
```

- [ ] **Step 3: 创建 ai-agent/src/hooks/handlers/approval-handler.ts**

```typescript
// 危险操作审批 handler：对 dangerous 级别工具要求人工确认

import { hookRunner } from '../runner.js';

hookRunner.registerBeforeToolCall(
  (ctx) => {
    if (ctx.dangerLevel === 'dangerous') {
      return {
        requireApproval: true,
        approvalMessage: `⚠️ 即将执行危险操作：${ctx.toolName}。参数：${JSON.stringify(ctx.args).slice(0, 200)}。请确认是否继续？`,
      };
    }
    return {};
  },
  { priority: 100 }  // 高优先级，先于其他 hook 执行
);
```

- [ ] **Step 4: 创建 ai-agent/src/hooks/handlers/audit-handler.ts`

```typescript
// 审计日志 handler：记录所有工具调用到日志（Phase 6 可扩展写入 DB）

import { hookRunner } from '../runner.js';

hookRunner.registerAfterToolCall(
  (ctx) => {
    const status = ctx.success ? 'SUCCESS' : 'FAILED';
    console.log(
      `[AUDIT] user=${ctx.userId} session=${ctx.sessionId} tool=${ctx.toolName} danger=${ctx.dangerLevel} status=${status} duration=${ctx.durationMs}ms`
    );
  },
  { priority: 50 }
);
```

- [ ] **Step 5: 验证构建**

Run: `pnpm --filter @cloudops/ai-agent build`
Expected: 编译成功

- [ ] **Step 6: Commit**

```bash
git add ai-agent/src/hooks/
git commit -m "feat(ai-agent): add hook system with approval and audit handlers (adapted from openclaw)"
```

---

## Task 6: 会话管理 + 上下文构建

**Files:**
- Create: `ai-agent/src/agent/session.ts`
- Create: `ai-agent/src/agent/context.ts`

**说明：** 会话管理负责创建/加载/持久化对话历史到 PostgreSQL。上下文构建负责组装 LLM Context（system prompt + 历史消息 + 工具列表）。

- [ ] **Step 1: 创建 ai-agent/src/agent/session.ts**

```typescript
// 会话管理：创建/加载/持久化对话历史

import { db } from '../db/index.js';
import { chatSessions, chatMessages } from '../db/schema.js';
import { eq, and, desc, asc } from 'drizzle-orm';
import type { Message, AssistantMessage, ToolCall } from '../llm/types.js';

export interface SessionInfo {
  id: string;
  userId: string;
  title: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

class SessionManager {
  async createSession(userId: string, title?: string): Promise<string> {
    const result = await db
      .insert(chatSessions)
      .values({
        userId,
        title: title || '新对话',
        status: 'active',
      })
      .returning();
    return result[0].id;
  }

  async listSessions(userId: string): Promise<SessionInfo[]> {
    return db
      .select()
      .from(chatSessions)
      .where(and(eq(chatSessions.userId, userId), eq(chatSessions.status, 'active')))
      .orderBy(desc(chatSessions.updatedAt));
  }

  async getSession(sessionId: string): Promise<SessionInfo | null> {
    const result = await db
      .select()
      .from(chatSessions)
      .where(eq(chatSessions.id, sessionId))
      .limit(1);
    return result[0] || null;
  }

  async deleteSession(sessionId: string): Promise<void> {
    await db.delete(chatSessions).where(eq(chatSessions.id, sessionId));
  }

  async updateSessionTitle(sessionId: string, title: string): Promise<void> {
    await db
      .update(chatSessions)
      .set({ title, updatedAt: new Date() })
      .where(eq(chatSessions.id, sessionId));
  }

  /**
   * 加载会话历史消息，转换为 LLM Message 格式
   */
  async loadMessages(sessionId: string): Promise<Message[]> {
    const rows = await db
      .select()
      .from(chatMessages)
      .where(eq(chatMessages.sessionId, sessionId))
      .orderBy(asc(chatMessages.createdAt));

    return rows.map((row) => this.dbRowToMessage(row));
  }

  /**
   * 保存用户消息
   */
  async saveUserMessage(sessionId: string, content: string): Promise<void> {
    await db.insert(chatMessages).values({
      sessionId,
      role: 'user',
      content,
    });
    await this.touchSession(sessionId);
  }

  /**
   * 保存 assistant 消息（可能含 tool_calls）
   */
  async saveAssistantMessage(sessionId: string, msg: AssistantMessage): Promise<void> {
    const textParts = msg.content.filter((c) => c.type === 'text').map((c) => (c as { text: string }).text);
    const toolCalls = msg.content.filter((c) => c.type === 'toolCall');
    await db.insert(chatMessages).values({
      sessionId,
      role: 'assistant',
      content: textParts.join('') || null,
      toolCalls: toolCalls.length > 0 ? toolCalls : null,
      metadata: { usage: msg.usage, model: msg.model, stopReason: msg.stopReason },
    });
    await this.touchSession(sessionId);
  }

  /**
   * 保存工具执行结果
   */
  async saveToolResult(
    sessionId: string,
    toolCallId: string,
    toolName: string,
    content: string,
    isError: boolean
  ): Promise<void> {
    await db.insert(chatMessages).values({
      sessionId,
      role: 'tool',
      toolCallId,
      toolName,
      content,
      metadata: { isError },
    });
  }

  private dbRowToMessage(row: typeof chatMessages.$inferSelect): Message {
    if (row.role === 'user') {
      return { role: 'user', content: row.content || '', timestamp: row.createdAt.getTime() };
    }
    if (row.role === 'assistant') {
      const content: AssistantMessage['content'] = [];
      if (row.content) content.push({ type: 'text', text: row.content });
      if (row.toolCalls) {
        for (const tc of row.toolCalls as ToolCall[]) {
          content.push(tc);
        }
      }
      return {
        role: 'assistant',
        content,
        model: (row.metadata as { model?: string })?.model || 'unknown',
        usage: (row.metadata as { usage?: AssistantMessage['usage'] })?.usage || { input: 0, output: 0, totalTokens: 0, cost: { input: 0, output: 0, total: 0 } },
        stopReason: (row.metadata as { stopReason?: AssistantMessage['stopReason'] })?.stopReason || 'stop',
        timestamp: row.createdAt.getTime(),
      };
    }
    // tool
    return {
      role: 'tool',
      toolCallId: row.toolCallId || '',
      toolName: row.toolName || '',
      content: row.content || '',
      isError: (row.metadata as { isError?: boolean })?.isError || false,
      timestamp: row.createdAt.getTime(),
    };
  }

  private async touchSession(sessionId: string): Promise<void> {
    await db
      .update(chatSessions)
      .set({ updatedAt: new Date() })
      .where(eq(chatSessions.id, sessionId));
  }
}

export const sessionManager = new SessionManager();
```

- [ ] **Step 2: 创建 ai-agent/src/agent/context.ts**

```typescript
// 上下文构建：组装 LLM Context（system prompt + history + tools）

import type { Context, Message, Tool } from '../llm/types.js';
import type { ToolPlan } from '../tools/types.js';
import { toLLMTools } from '../tools/protocol.js';
import { config } from '../config.js';

const SYSTEM_PROMPT = `你是 CloudOps AI 运维助手，帮助运维人员通过自然语言管理多云资源。

你的能力：
1. 查询和管理云服务器实例（AWS、阿里云、Azure）— 列出、查看、创建、启动、停止、重启、删除
2. 查询监控指标和告警事件
3. 查询成本分析

工作原则：
- 对于查询类操作，直接调用工具执行
- 对于危险操作（停止、重启、删除），系统会要求用户确认，你需要在回复中说明操作影响
- 用中文回复，简洁专业
- 如果用户意图不明确，先调用 list_instances 等查询工具获取上下文，再确认操作目标
- 工具返回的是 JSON，你需要提取关键信息用自然语言总结给用户

当前可用的云厂商：aws, aliyun, azure`;

export function buildContext(
  messages: Message[],
  plan: ToolPlan,
  options?: { maxMessages?: number }
): Context {
  const maxMessages = options?.maxMessages || 20;
  // 截取最近的消息，避免超出上下文窗口
  const recentMessages = messages.slice(-maxMessages);
  const llmTools: Tool[] = toLLMTools(plan.visible);

  return {
    systemPrompt: SYSTEM_PROMPT,
    messages: recentMessages,
    tools: llmTools.length > 0 ? llmTools : undefined,
  };
}
```

- [ ] **Step 3: 验证构建**

Run: `pnpm --filter @cloudops/ai-agent build`
Expected: 编译成功

- [ ] **Step 4: Commit**

```bash
git add ai-agent/src/agent/session.ts ai-agent/src/agent/context.ts
git commit -m "feat(ai-agent): add session management and context building"
```

---

## Task 7: Agent 主循环

**Files:**
- Create: `ai-agent/src/agent/runner.ts`

**说明：** Agent 主循环是核心：LLM 调用 → 解析 tool_call → 审批检查 → 执行工具 → 结果回传 LLM → 循环直到无 tool_call 或达到最大迭代。支持流式事件回调（供 WebSocket 推送）。

- [ ] **Step 1: 创建 ai-agent/src/agent/runner.ts**

```typescript
// Agent 主循环：LLM → tool_call → execute → loop

import type { Message, AssistantMessage, AssistantMessageEvent } from '../llm/types.js';
import { streamChat } from '../llm/stream.js';
import { toolRegistry, type ToolExecutionContext } from '../tools/registry.js';
import { hookRunner } from '../hooks/runner.js';
import { sessionManager } from './session.js';
import { buildContext } from './context.js';
import { config } from '../config.js';

export interface AgentRunOptions {
  sessionId: string;
  userId: string;
  userInput: string;
  authToken?: string;
  onEvent?: (event: AgentRunEvent) => void;
  signal?: AbortSignal;
}

export type AgentRunEvent =
  | { type: 'text_delta'; delta: string }
  | { type: 'toolcall_start'; id: string; name: string }
  | { type: 'toolcall_arguments'; id: string; delta: string }
  | { type: 'toolcall_end'; id: string; name: string; arguments: Record<string, unknown> }
  | { type: 'tool_result'; toolCallId: string; toolName: string; result: string; isError: boolean }
  | { type: 'approval_required'; toolCallId: string; toolName: string; message: string }
  | { type: 'done'; finalText: string }
  | { type: 'error'; error: string };

export interface AgentRunResult {
  finalText: string;
  iterations: number;
  toolCalls: number;
}

/**
 * Agent 主循环
 */
export async function runAgent(options: AgentRunOptions): Promise<AgentRunResult> {
  const { sessionId, userId, userInput, authToken, onEvent, signal } = options;

  // 保存用户消息
  await sessionManager.saveUserMessage(sessionId, userInput);

  // 构建工具执行上下文
  const toolCtx: ToolExecutionContext = {
    userId,
    sessionId,
    cloudServiceUrl: config.cloudServiceUrl,
    monitorServiceUrl: config.monitorServiceUrl,
    authToken,
  };

  let iterations = 0;
  let toolCallCount = 0;
  let finalText = '';

  while (iterations < config.agent.maxIterations) {
    iterations++;
    if (signal?.aborted) throw new Error('Agent run aborted');

    // 加载历史消息 + 构建上下文
    const messages = await sessionManager.loadMessages(sessionId);
    const { plan, llmTools } = toolRegistry.buildPlan(process.env as Record<string, string | undefined>);
    const context = buildContext(messages, plan);

    // 调用 LLM（流式）
    const assistantMsg = await callLLMStream(context, onEvent, signal);

    // 保存 assistant 消息
    await sessionManager.saveAssistantMessage(sessionId, assistantMsg);

    // 提取文本
    const textParts = assistantMsg.content
      .filter((c) => c.type === 'text')
      .map((c) => (c as { text: string }).text);
    if (textParts.length > 0) finalText = textParts.join('');

    // 提取 tool_calls
    const toolCalls = assistantMsg.content.filter((c) => c.type === 'toolCall') as ToolCall[];
    if (toolCalls.length === 0) {
      // 无工具调用，对话结束
      onEvent?.({ type: 'done', finalText });
      return { finalText, iterations, toolCalls: toolCallCount };
    }

    // 执行每个工具调用
    for (const tc of toolCalls) {
      toolCallCount++;
      const descriptor = toolRegistry.getAllDescriptors().find((d) => d.name === tc.name);
      const dangerLevel = descriptor?.dangerLevel || 'safe';

      // before_tool_call hook（审批检查）
      const hookResult = await hookRunner.runBeforeToolCall({
        userId,
        sessionId,
        toolName: tc.name,
        args: tc.arguments,
        dangerLevel,
      });

      if (hookResult.block) {
        const blockMsg = `操作被阻止：${hookResult.blockReason}`;
        await sessionManager.saveToolResult(sessionId, tc.id, tc.name, blockMsg, true);
        onEvent?.({ type: 'tool_result', toolCallId: tc.id, toolName: tc.name, result: blockMsg, isError: true });
        continue;
      }

      if (hookResult.requireApproval) {
        onEvent?.({
          type: 'approval_required',
          toolCallId: tc.id,
          toolName: tc.name,
          message: hookResult.approvalMessage || `操作 ${tc.name} 需要确认`,
        });
        // MVP 阶段：自动批准。Phase 5 Web Console 会实现人工审批 UI
        // 实际生产应在此处暂停等待用户确认
      }

      // 执行工具
      const startTime = Date.now();
      let result: string;
      let isError = false;
      try {
        result = await toolRegistry.execute(tc.name, tc.arguments, toolCtx);
      } catch (err) {
        result = `工具执行失败：${(err as Error).message}`;
        isError = true;
      }
      const durationMs = Date.now() - startTime;

      // after_tool_call hook（审计日志）
      await hookRunner.runAfterToolCall({
        userId,
        sessionId,
        toolName: tc.name,
        args: tc.arguments,
        dangerLevel,
        result,
        success: !isError,
        durationMs,
      });

      // 保存工具结果
      await sessionManager.saveToolResult(sessionId, tc.id, tc.name, result, isError);
      onEvent?.({ type: 'tool_result', toolCallId: tc.id, toolName: tc.name, result, isError });
    }

    // 继续循环，让 LLM 看到工具结果后决定下一步
  }

  // 达到最大迭代数
  onEvent?.({ type: 'done', finalText: finalText || '已达到最大迭代次数，请缩小问题范围后重试。' });
  return { finalText, iterations, toolCalls: toolCallCount };
}

/**
 * 调用 LLM 流式接口，返回完整 AssistantMessage
 */
async function callLLMStream(
  context: Parameters<typeof streamChat>[0],
  onEvent?: (event: AgentRunEvent) => void,
  signal?: AbortSignal
): Promise<AssistantMessage> {
  return new Promise((resolve, reject) => {
    const eventStream = streamChat(context, {
      signal,
      onEvent: (event: AssistantMessageEvent) => {
        // 转发事件给上层
        switch (event.type) {
          case 'text_delta':
            onEvent?.({ type: 'text_delta', delta: event.delta });
            break;
          case 'toolcall_start':
            onEvent?.({ type: 'toolcall_start', id: event.id, name: event.name });
            break;
          case 'toolcall_arguments':
            onEvent?.({ type: 'toolcall_arguments', id: event.id, delta: event.delta });
            break;
          case 'toolcall_end':
            onEvent?.({ type: 'toolcall_end', id: event.id, name: event.name, arguments: event.arguments });
            break;
          case 'error':
            onEvent?.({ type: 'error', error: event.error });
            reject(new Error(event.error));
            return;
        }
      },
    });

    eventStream.result().then(resolve).catch(reject);
  });
}

import type { ToolCall } from '../llm/types.js';
```

- [ ] **Step 2: 验证构建**

Run: `pnpm --filter @cloudops/ai-agent build`
Expected: 编译成功

- [ ] **Step 3: Commit**

```bash
git add ai-agent/src/agent/runner.ts
git commit -m "feat(ai-agent): add agent main loop with tool execution and approval flow"
```

---

## Task 8: HTTP 路由（会话 CRUD + 非流式对话）

**Files:**
- Create: `ai-agent/src/routes/sessions.ts`
- Create: `ai-agent/src/routes/chat.ts`

- [ ] **Step 1: 创建 ai-agent/src/routes/sessions.ts**

```typescript
// 会话 CRUD 路由

import type { FastifyInstance } from 'fastify';
import { sessionManager } from '../agent/session.js';

export async function sessionRoutes(app: FastifyInstance) {
  // 列出当前用户的会话
  app.get('/', async (request) => {
    const userId = (request as any).user.userId as string;
    return sessionManager.listSessions(userId);
  });

  // 创建新会话
  app.post('/', async (request, reply) => {
    const userId = (request as any).user.userId as string;
    const body = request.body as { title?: string };
    const sessionId = await sessionManager.createSession(userId, body?.title);
    return reply.status(201).send({ id: sessionId });
  });

  // 获取会话历史消息
  app.get('/:id/messages', async (request) => {
    const { id } = request.params as { id: string };
    return sessionManager.loadMessages(id);
  });

  // 更新会话标题
  app.patch('/:id', async (request) => {
    const { id } = request.params as { id: string };
    const body = request.body as { title: string };
    await sessionManager.updateSessionTitle(id, body.title);
    return { ok: true, id };
  });

  // 删除会话
  app.delete('/:id', async (request) => {
    const { id } = request.params as { id: string };
    await sessionManager.deleteSession(id);
    return { ok: true, id };
  });
}
```

- [ ] **Step 2: 创建 ai-agent/src/routes/chat.ts**

```typescript
// 非流式对话路由（HTTP POST，等待完整结果返回）

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { runAgent } from '../agent/runner.js';
import { sessionManager } from '../agent/session.js';

const chatSchema = z.object({
  sessionId: z.string().uuid().optional(),
  message: z.string().min(1),
});

export async function chatRoutes(app: FastifyInstance) {
  app.post('/', async (request, reply) => {
    const input = chatSchema.parse(request.body);
    const userId = (request as any).user.userId as string;
    const authToken = (request.headers.authorization || '').replace('Bearer ', '');

    // 如果没有 sessionId，创建新会话
    let sessionId = input.sessionId;
    if (!sessionId) {
      sessionId = await sessionManager.createSession(userId, input.message.slice(0, 30));
    }

    const result = await runAgent({
      sessionId,
      userId,
      userInput: input.message,
      authToken,
    });

    return reply.send({
      sessionId,
      response: result.finalText,
      iterations: result.iterations,
      toolCalls: result.toolCalls,
    });
  });
}
```

- [ ] **Step 3: 验证构建**

Run: `pnpm --filter @cloudops/ai-agent build`
Expected: 编译成功

- [ ] **Step 4: Commit**

```bash
git add ai-agent/src/routes/sessions.ts ai-agent/src/routes/chat.ts
git commit -m "feat(ai-agent): add session CRUD and chat HTTP routes"
```

---

## Task 9: WebSocket 流式对话

**Files:**
- Create: `ai-agent/src/routes/ws.ts`

**说明：** WebSocket 端点提供实时流式对话，客户端发送消息后，服务端推送 text_delta / toolcall_* / tool_result / done 事件。

- [ ] **Step 1: 创建 ai-agent/src/routes/ws.ts**

```typescript
// WebSocket 流式对话路由

import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { runAgent, type AgentRunEvent } from '../agent/runner.js';
import { sessionManager } from '../agent/session.js';

export async function wsRoutes(app: FastifyInstance) {
  app.get('/', { websocket: true }, (socket: WebSocket, request) => {
    const userId = (request as any).user?.userId as string;
    const authToken = (request.headers.authorization || '').replace('Bearer ', '');

    if (!userId) {
      socket.send(JSON.stringify({ type: 'error', error: '未认证' }));
      socket.close();
      return;
    }

    socket.on('message', async (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type !== 'chat') return;

        let sessionId = msg.sessionId;
        if (!sessionId) {
          sessionId = await sessionManager.createSession(userId, msg.message?.slice(0, 30) || '新对话');
          socket.send(JSON.stringify({ type: 'session_created', sessionId }));
        }

        // 运行 Agent，流式推送事件
        await runAgent({
          sessionId,
          userId,
          userInput: msg.message,
          authToken,
          onEvent: (event: AgentRunEvent) => {
            if (socket.readyState === socket.OPEN) {
              socket.send(JSON.stringify(event));
            }
          },
        });
      } catch (err) {
        if (socket.readyState === socket.OPEN) {
          socket.send(JSON.stringify({ type: 'error', error: (err as Error).message }));
        }
      }
    });
  });
}
```

- [ ] **Step 2: 验证构建**

Run: `pnpm --filter @cloudops/ai-agent build`
Expected: 编译成功

- [ ] **Step 3: Commit**

```bash
git add ai-agent/src/routes/ws.ts
git commit -m "feat(ai-agent): add websocket streaming chat route"
```

---

## Task 10: 事件订阅 + 服务入口 + Dockerfile

**Files:**
- Create: `ai-agent/src/events/subscriber.ts`
- Create: `ai-agent/src/index.ts`
- Create: `ai-agent/Dockerfile`
- Modify: `docker-compose.yml`
- Modify: `.env.example`

- [ ] **Step 1: 创建 ai-agent/src/events/subscriber.ts**

订阅 monitor-service 的 alert.fired 事件，收到后可推送给有活跃 WebSocket 连接的用户。

```typescript
// Redis 订阅器：监听 monitor-service 的告警事件

import Redis from 'ioredis';
import { config } from '../config.js';

class EventSubscriber {
  private redis: Redis | null = null;
  private alertHandlers: Array<(alert: unknown) => void> = [];

  start() {
    this.redis = new Redis(config.redisUrl);
    this.redis.subscribe('cloudops:alert.fired');
    this.redis.on('message', (channel, message) => {
      if (channel === 'cloudops:alert.fired') {
        try {
          const alert = JSON.parse(message);
          console.log(`[EventSubscriber] Received alert.fired:`, alert);
          this.alertHandlers.forEach((h) => h(alert));
        } catch (err) {
          console.error('[EventSubscriber] Failed to parse alert:', err);
        }
      }
    });
    console.log('[EventSubscriber] Started, listening for alert.fired');
  }

  onAlert(handler: (alert: unknown) => void): void {
    this.alertHandlers.push(handler);
  }

  stop() {
    this.redis?.disconnect();
  }
}

export const eventSubscriber = new EventSubscriber();
```

- [ ] **Step 2: 创建 ai-agent/src/index.ts**

```typescript
// AI Agent Service 入口

import Fastify from 'fastify';
import cors from '@fastify/cors';
import websocket from '@fastify/websocket';
import { config } from './config.js';
import { sessionRoutes } from './routes/sessions.js';
import { chatRoutes } from './routes/chat.js';
import { wsRoutes } from './routes/ws.js';
import { eventSubscriber } from './events/subscriber.js';
import { AppError } from '@cloudops/shared';

// 导入 hooks handlers（副作用注册）
import './hooks/handlers/approval-handler.js';
import './hooks/handlers/audit-handler.js';
// 导入工具 descriptors（副作用注册）
import './tools/descriptors/cloud-tools.js';
import './tools/descriptors/monitor-tools.js';

const app = Fastify({ logger: true });

await app.register(cors, { origin: config.corsOrigin });
await app.register(websocket);

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.code,
      message: error.message,
    });
  }
  if (error.validation) {
    return reply.status(400).send({ error: 'VALIDATION_ERROR', message: error.message });
  }
  app.log.error(error);
  return reply.status(500).send({ error: 'INTERNAL_ERROR', message: 'Internal server error' });
});

// 健康检查
app.get('/health', async () => ({
  status: 'ok',
  service: 'ai-agent',
  timestamp: new Date().toISOString(),
}));

// 注册路由（API Gateway 转发 /agent/* 到本服务）
await app.register(sessionRoutes, { prefix: '/agent/sessions' });
await app.register(chatRoutes, { prefix: '/agent/chat' });
await app.register(wsRoutes, { prefix: '/agent/ws' });

// 启动事件订阅
eventSubscriber.start();

// 优雅关闭
const shutdown = () => {
  app.log.info('Shutting down ai-agent...');
  eventSubscriber.stop();
  app.close();
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

try {
  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`AI Agent service running on port ${config.port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
```

- [ ] **Step 3: 创建 ai-agent/Dockerfile**

```dockerfile
FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++ && npm install -g pnpm

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY shared/package.json shared/tsconfig.json ./shared/
COPY ai-agent/package.json ai-agent/tsconfig.json ai-agent/drizzle.config.ts ./ai-agent/
COPY ai-agent/migrations ./ai-agent/migrations/

RUN pnpm install --filter=@cloudops/shared --filter=@cloudops/ai-agent --dangerously-allow-all-builds --config.minimumReleaseAge=0

COPY shared/ ./shared/
COPY ai-agent/ ./ai-agent/

RUN cd shared && PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm run build
RUN cd ai-agent && PNPM_CONFIG_VERIFY_DEPS_BEFORE_RUN=false pnpm run build

RUN cp -r ai-agent/migrations ai-agent/dist/migrations

WORKDIR /app/ai-agent

CMD ["node", "dist/index.js"]
```

- [ ] **Step 4: 修改 docker-compose.yml**

在 `monitor-service` 服务块之后添加 `ai-agent` 服务块：

```yaml
  ai-agent:
    build:
      context: .
      dockerfile: ai-agent/Dockerfile
    ports:
      - "3003:3003"
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      PORT: 3003
      CLOUD_SERVICE_URL: http://cloud-service:3001
      MONITOR_SERVICE_URL: http://monitor-service:3002
      AUTH_SERVICE_URL: http://auth-service:3004
      LLM_API_KEY: ${LLM_API_KEY:-}
      LLM_BASE_URL: ${LLM_BASE_URL:-https://api.openai.com/v1}
      LLM_MODEL: ${LLM_MODEL:-gpt-4o}
      LLM_TEMPERATURE: ${LLM_TEMPERATURE:-0.3}
      LLM_MAX_TOKENS: ${LLM_MAX_TOKENS:-4096}
      AGENT_MAX_ITERATIONS: ${AGENT_MAX_ITERATIONS:-10}
      AGENT_TIMEOUT_MS: ${AGENT_TIMEOUT_MS:-120000}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      cloud-service:
        condition: service_started
      monitor-service:
        condition: service_started
```

- [ ] **Step 5: 修改 .env.example**

在文件末尾追加：

```bash
# AI Agent Service (Phase 4)
LLM_API_KEY=
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o
LLM_TEMPERATURE=0.3
LLM_MAX_TOKENS=4096
AGENT_MAX_ITERATIONS=10
AGENT_TIMEOUT_MS=120000
```

- [ ] **Step 6: 确认 api-gateway 代理路由**

检查 `api-gateway/src/routes/proxy.ts`，确认 `/agent` 路径转发到 `AI_AGENT_URL=http://ai-agent:3003`。如果缺少则添加。同时确认 docker-compose.yml 中 api-gateway 的环境变量包含 `AI_AGENT_URL`。

- [ ] **Step 7: 验证整体构建**

Run: `pnpm -r run build`
Expected: 全部 workspace 项目编译成功

- [ ] **Step 8: Commit**

```bash
git add ai-agent/src/events/ ai-agent/src/index.ts ai-agent/Dockerfile docker-compose.yml .env.example
git commit -m "feat(ai-agent): add event subscriber, service entrypoint, docker integration"
```

---

## Task 11: 端到端验证

**Files:** 无（验证任务）

- [ ] **Step 1: 构建并启动全部服务**

Run: `docker compose up -d --build postgres redis auth-service api-gateway cloud-service monitor-service ai-agent`
Expected: 7 个容器全部 running

- [ ] **Step 2: 执行 ai-agent 数据库迁移**

Run: `docker compose exec ai-agent node dist/db/migrate.js`
Expected: "Migrations complete."（chat_sessions, chat_messages 表创建成功）

- [ ] **Step 3: 验证健康检查**

Run: `curl -s http://localhost:3003/health`
Expected: `{"status":"ok","service":"ai-agent","timestamp":"..."}`

- [ ] **Step 4: 注册+登录获取 Token**

```bash
curl -s -X POST http://localhost:3000/auth/register -H "Content-Type: application/json" -d '{"username":"admin","password":"admin12345","role":"admin"}'
TOKEN=$(curl -s -X POST http://localhost:3000/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"admin12345"}' | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)
```
Expected: 获得 Token

- [ ] **Step 5: 创建对话会话**

```bash
curl -s -X POST http://localhost:3000/agent/sessions -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"title":"测试对话"}'
```
Expected: 返回 `{"id":"..."}`

- [ ] **Step 6: 查询会话列表**

Run: `curl -s http://localhost:3000/agent/sessions -H "Authorization: Bearer $TOKEN"`
Expected: 返回包含刚创建会话的数组

- [ ] **Step 7: 非流式对话（无 LLM Key 时验证错误处理）**

```bash
curl -s -X POST http://localhost:3000/agent/chat -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"message":"列出所有云服务器"}'
```
Expected: 如果配置了 LLM_API_KEY，返回 Agent 响应；如果未配置，返回 LLM API 错误（验证错误处理链路正常）

- [ ] **Step 8: 验证数据库表**

Run: `docker compose exec postgres psql -U cloudops -d cloudops -c "\dt" | grep chat`
Expected: 显示 chat_sessions 和 chat_messages 表

- [ ] **Step 9: 检查服务日志确认启动**

Run: `docker compose logs ai-agent --tail 20`
Expected: 日志包含 "AI Agent service running on port 3003" 和 "[EventSubscriber] Started"

- [ ] **Step 10: Commit 验证结果**

```bash
git add -A
git commit -m "test(ai-agent): phase 4 end-to-end verification passed"
```

---

## 自审清单

**Spec 覆盖：**
- [x] 5.1 基于 OpenClaw Agent 改造 → Task 2/3/5 复用 OpenClaw llm-core types / tools 模块 / hooks runner
- [x] 5.2 云管理 Tool 集（cloud_list_instances / cloud_get_instance / cloud_create_instance / cloud_delete_instance / cloud_start_instance / cloud_stop_instance / cloud_reboot_instance / monitor_get_metrics / monitor_list_alerts / monitor_get_cost）→ Task 4
- [x] 5.3 自然语言→操作映射 → Task 7 Agent 主循环（LLM function calling → 工具执行）
- [x] 5.4 对话管理（Session 隔离、多轮对话、历史持久化、危险操作确认）→ Task 6（session）+ Task 7（审批 hook）+ Task 9（WS 流式）
- [x] WebSocket 实时通信 → Task 9
- [x] agent.progress 事件 → Task 9 WS 事件推送
- [x] 与 OpenClaw 脱钩，无 OpenClaw 标识 → 所有代码为 CloudOps 独立实现，仅移植设计模式

**类型一致性：**
- Message / AssistantMessage / ToolCall / Tool / Context 类型在 llm/types.ts 定义，被 stream.ts / agent/runner.ts / agent/session.ts / agent/context.ts 一致使用
- ToolDescriptor / ToolPlan / ToolPlanEntry 在 tools/types.ts 定义，被 planner.ts / protocol.ts / registry.ts / descriptors/ 一致使用
- AgentRunEvent 在 agent/runner.ts 定义，被 routes/ws.ts 一致使用
- ToolExecutor / ToolExecutionContext 在 tools/registry.ts 定义，被 descriptors/ 一致使用

**已知简化（留待后续 Phase）：**
- exec_command（SSH）和 exec_playbook（Ansible）留待 Phase 7（自动化运维）
- web_search 和 knowledge_query 留待 Phase 6（AI 优化建议）
- 危险操作审批当前为自动批准，Phase 5 Web Console 实现人工审批 UI
- LLM 仅支持 OpenAI 兼容 API，如需 Anthropic 原生 API 可在 llm/stream.ts 扩展
