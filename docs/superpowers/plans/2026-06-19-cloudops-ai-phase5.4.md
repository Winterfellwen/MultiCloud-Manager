# CloudOps AI Phase 5.4 — AI 对话页 React 版（WebSocket 流式 + 断线恢复）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 AI 对话页 React 版，对接 ai-gateway WebSocket 服务，支持流式渲染、工具调用展示、会话管理、断线恢复。

**Architecture:** 在 web-console 项目中新增 WebSocket 客户端类（封装连接/req-res 配对/seq gap 检测/自动重连）、AI 对话 Zustand store（管理会话/消息/runId 映射/断线恢复状态）、流式渲染组件（Markdown + 工具卡片）、对话页 UI（会话列表 + 消息流 + 输入框 + 中止按钮）。

**Tech Stack:** React 18 / TypeScript / Zustand / Tailwind CSS / lucide-react / 原生 WebSocket API / react-markdown（新增依赖）

**Spec:** `docs/superpowers/specs/2026-06-19-cloudops-ai-phase5-design.md`

---

## ai-gateway WebSocket 协议要点（来自调研）

### 连接
- 端点：`ws://host:3005/ws?token=<JWT>`
- 认证成功后服务端发送 `hello-ok` 事件（不带 seq）
- 认证失败发送 error 帧后 close(4001)

### 三种帧格式
```typescript
// 客户端 → 服务端
{ type: 'req', id: string, method: string, params: object }

// 服务端 → 客户端
{ type: 'res', id: string, ok: boolean, payload: object }

// 服务端 → 客户端（推送）
{ type: 'event', event: string, seq?: number, payload: object }
```

### RPC 方法（6 个）
1. `chat.send` — 发送消息，fire-and-forget，立即返回 `{runId, status: 'started'|'in_flight'}`
2. `chat.history` — 获取历史 + in-flight run 快照，返回 `{sessionKey, events, inFlightRun}`
3. `chat.abort` — 中止 run，返回 `{runId, status: 'aborted'}` 或错误
4. `sessions.subscribe` — 订阅 session 事件
5. `sessions.unsubscribe` — 取消订阅
6. `sessions.messages.subscribe` — 订阅消息事件（等价于 sessions.subscribe）

### chat 事件子类型（payload.type）
- `text_delta` — `{runId, type:'text_delta', delta: string}`
- `tool_call` — `{runId, type:'tool_call', toolCall: {id, name, args}}`
- `tool_result` — `{runId, type:'tool_result', result: {name, content}}`
- `done` — `{runId, type:'done', finalText: string}`
- `error` — `{runId, type:'error', error: string}`

### seq 机制
- per-connection 递增，chat 事件帧带 seq
- 客户端检测 gap（seq 跳跃）触发重连 + chat.history 恢复
- ACP seq 是 per-session 持久化，用于历史重放（与连接 seq 独立）

### sessionKey 陷阱
- **sessionKey 不在事件帧中也不在 payload 中**
- 前端必须维护 `runId → sessionKey` 映射
- chat.send 时记录映射，事件回调时通过 runId 反查 sessionKey

### eventType 命名差异
- ACP ledger 用 `assistant_delta` / `assistant_complete`
- 实时事件用 `text_delta` / `done`
- 前端实时渲染用 `text_delta`/`done`，历史重放需映射

### inFlightRun 快照（chat.history 返回）
```typescript
{
  runId: string;
  bufferedText: string;  // 已缓冲但未收到 done 的文本
  isRunning: boolean;    // run 是否仍在进行
  startedAt: number;     // 开始时间戳
} | null
```

### chat.send 参数
```typescript
{
  sessionKey: string;
  message: string;
  clientRunId?: string;  // 可选，客户端生成的 runId
}
```

### chat.history 参数
```typescript
{
  sessionKey: string;
  fromSeq?: number;  // ACP seq，从哪个序号开始重放
}
```

### chat.abort 参数
```typescript
{ runId: string }
```

---

## 文件结构总览

```
web-console/src/
├── types/
│   └── chat.ts                      # WS 协议 + 对话类型定义
├── lib/
│   └── ws-client.ts                 # WebSocket 客户端类
├── stores/
│   └── chat.ts                      # AI 对话 Zustand store
├── components/
│   ├── chat/
│   │   ├── MessageList.tsx          # 消息列表（流式渲染）
│   │   ├── MessageBubble.tsx        # 单条消息气泡（Markdown）
│   │   ├── ToolCallCard.tsx         # 工具调用卡片
│   │   ├── ChatInput.tsx            # 输入框 + 发送 + 中止
│   │   └── SessionList.tsx          # 会话列表侧边栏
│   └── ui/
│       ├── scroll-area.tsx          # 滚动容器（轻量版）
│       └── textarea.tsx             # 多行输入
├── pages/
│   └── ChatReact.tsx                # AI 对话页（替换占位）
```

---

## Task 1: WS 协议类型定义

**Files:**
- `web-console/src/types/chat.ts`

- [ ] **Step 1: 创建 src/types/chat.ts**

定义 WebSocket 协议帧类型、chat 事件子类型、RPC 方法参数/响应类型、前端 store 数据结构。

```typescript
// ===== WebSocket 协议帧 =====

export interface WsReqFrame {
  type: 'req';
  id: string;
  method: string;
  params: unknown;
}

export interface WsResFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload: unknown;
}

export interface WsEventFrame {
  type: 'event';
  event: string;
  seq?: number;
  payload: unknown;
}

export type WsServerFrame = WsResFrame | WsEventFrame;

// ===== RPC 方法参数 =====

export interface ChatSendParams {
  sessionKey: string;
  message: string;
  clientRunId?: string;
}

export interface ChatHistoryParams {
  sessionKey: string;
  fromSeq?: number;
}

export interface ChatAbortParams {
  runId: string;
}

export interface SessionsSubscribeParams {
  sessionKey: string;
}

// ===== RPC 方法响应 =====

export interface ChatSendResponse {
  runId: string;
  status: 'started' | 'in_flight';
}

export interface ChatHistoryResponse {
  sessionKey: string;
  events: AcpEvent[];
  inFlightRun: InFlightRunSnapshot | null;
}

export interface ChatAbortResponse {
  runId: string;
  status: 'aborted';
}

export interface SessionsSubscribeResponse {
  sessionKey: string;
  subscribed: boolean;
}

// ===== chat 事件 payload =====

export interface ChatTextDeltaPayload {
  runId: string;
  type: 'text_delta';
  delta: string;
}

export interface ChatToolCallPayload {
  runId: string;
  type: 'tool_call';
  toolCall: {
    id: string;
    name: string;
    args: unknown;
  };
}

export interface ChatToolResultPayload {
  runId: string;
  type: 'tool_result';
  result: {
    name: string;
    content: unknown;
  };
}

export interface ChatDonePayload {
  runId: string;
  type: 'done';
  finalText: string;
}

export interface ChatErrorPayload {
  runId: string;
  type: 'error';
  error: string;
}

export type ChatEventPayload =
  | ChatTextDeltaPayload
  | ChatToolCallPayload
  | ChatToolResultPayload
  | ChatDonePayload
  | ChatErrorPayload;

// ===== ACP 事件（历史重放） =====

export interface AcpEvent {
  seq: number;
  type: 'user_message' | 'assistant_delta' | 'assistant_complete' | 'tool_call' | 'tool_result' | 'error';
  payload: {
    runId: string;
    message?: string;
    delta?: string;
    finalText?: string;
    toolCall?: { id: string; name: string; args: unknown };
    result?: { name: string; content: unknown };
    error?: string;
  };
}

// ===== in-flight run 快照 =====

export interface InFlightRunSnapshot {
  runId: string;
  bufferedText: string;
  isRunning: boolean;
  startedAt: number;
}

// ===== 前端 store 数据结构 =====

export type MessageRole = 'user' | 'assistant';

export interface ToolCallRecord {
  id: string;
  name: string;
  args: unknown;
  result?: { name: string; content: unknown };
  status: 'pending' | 'completed';
}

export interface ChatMessage {
  id: string;
  sessionKey: string;
  runId?: string;  // assistant 消息关联的 runId
  role: MessageRole;
  content: string;
  toolCalls: ToolCallRecord[];
  status: 'streaming' | 'complete' | 'error' | 'aborted';
  error?: string;
  createdAt: number;
}

export interface ChatSession {
  sessionKey: string;
  title: string;
  lastMessageAt: number;
  messageCount: number;
}

// ===== 连接状态 =====

export type WsConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

// ===== 事件回调类型 =====

export interface WsClientCallbacks {
  onOpen: () => void;
  onClose: (code: number, reason: string) => void;
  onError: (error: Event) => void;
  onEvent: (event: string, payload: unknown, seq?: number) => void;
}
```

---

## Task 2: WebSocket 客户端类

**Files:**
- `web-console/src/lib/ws-client.ts`

- [ ] **Step 1: 创建 src/lib/ws-client.ts**

实现 WebSocket 客户端类，封装：
- 连接管理（带 JWT token）
- req/res 配对（Promise + id 映射 + 超时）
- seq gap 检测（触发 onGap 回调）
- 自动重连（指数退避，最大 5 次）
- hello-ok 等待

```typescript
import type {
  WsReqFrame,
  WsServerFrame,
  WsResFrame,
  WsEventFrame,
  WsConnectionStatus,
} from '../types/chat';

export interface WsClientOptions {
  url: string;
  token: string;
  onStatusChange?: (status: WsConnectionStatus) => void;
  onEvent?: (event: string, payload: unknown, seq?: number) => void;
  onGap?: (expectedSeq: number, receivedSeq: number) => void;
  reconnectMaxAttempts?: number;
  requestTimeoutMs?: number;
}

interface PendingRequest {
  resolve: (payload: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class WsClient {
  private ws: WebSocket | null = null;
  private reqId = 0;
  private pending = new Map<string, PendingRequest>();
  private lastSeq = 0;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isManualClose = false;
  private status: WsConnectionStatus = 'disconnected';

  constructor(private options: WsClientOptions) {}

  get connectionStatus(): WsConnectionStatus {
    return this.status;
  }

  /** 连接 WebSocket */
  connect(): void {
    this.isManualClose = false;
    this.setStatus('connecting');
    const url = `${this.options.url}?token=${encodeURIComponent(this.options.token)}`;
    this.ws = new WebSocket(url);

    this.ws.onopen = () => {
      // 等待 hello-ok 事件，不立即标记 connected
    };

    this.ws.onmessage = (e: MessageEvent) => {
      this.handleMessage(e.data);
    };

    this.ws.onerror = (event: Event) => {
      this.setStatus('error');
    };

    this.ws.onclose = (event: CloseEvent) => {
      this.handleClose(event.code, event.reason);
    };
  }

  /** 手动关闭 */
  close(): void {
    this.isManualClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close(1000, 'client closed');
      this.ws = null;
    }
    this.setStatus('disconnected');
  }

  /** 发送 RPC 请求 */
  request<T = unknown>(method: string, params: unknown): Promise<T> {
    if (!this.ws || this.ws.readyState !== this.ws.OPEN) {
      return Promise.reject(new Error('WebSocket not connected'));
    }

    const id = `req-${++this.reqId}`;
    const frame: WsReqFrame = { type: 'req', id, method, params };

    return new Promise<T>((resolve, reject) => {
      const timeoutMs = this.options.requestTimeoutMs ?? 10000;
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, timeoutMs);

      this.pending.set(id, {
        resolve: (payload) => {
          clearTimeout(timer);
          this.pending.delete(id);
          resolve(payload as T);
        },
        reject: (error) => {
          clearTimeout(timer);
          this.pending.delete(id);
          reject(error);
        },
        timer,
      });

      this.ws!.send(JSON.stringify(frame));
    });
  }

  private handleMessage(data: unknown): void {
    let frame: WsServerFrame;
    try {
      frame = JSON.parse(data as string) as WsServerFrame;
    } catch {
      return;
    }

    if (frame.type === 'res') {
      this.handleResponse(frame);
    } else if (frame.type === 'event') {
      this.handleEvent(frame);
    }
  }

  private handleResponse(frame: WsResFrame): void {
    const pending = this.pending.get(frame.id);
    if (!pending) return;

    if (frame.ok) {
      pending.resolve(frame.payload);
    } else {
      const errMsg = (frame.payload as { error?: string })?.error || 'Request failed';
      pending.reject(new Error(errMsg));
    }
  }

  private handleEvent(frame: WsEventFrame): void {
    // hello-ok 事件：标记已连接
    if (frame.event === 'hello-ok') {
      this.reconnectAttempts = 0;
      this.setStatus('connected');
      this.options.onEvent?.('hello-ok', frame.payload, frame.seq);
      return;
    }

    // seq gap 检测（仅对带 seq 的事件）
    if (frame.seq !== undefined) {
      const expected = this.lastSeq + 1;
      if (frame.seq > expected) {
        // 检测到 gap，触发回调
        this.options.onGap?.(expected, frame.seq);
      }
      this.lastSeq = frame.seq;
    }

    this.options.onEvent?.(frame.event, frame.payload, frame.seq);
  }

  private handleClose(code: number, reason: string): void {
    this.ws = null;
    // 拒绝所有 pending 请求
    for (const pending of this.pending.values()) {
      pending.reject(new Error(`Connection closed: ${code}`));
    }
    this.pending.clear();
    this.lastSeq = 0;

    if (this.isManualClose) {
      this.setStatus('disconnected');
      return;
    }

    // 自动重连
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    const maxAttempts = this.options.reconnectMaxAttempts ?? 5;
    if (this.reconnectAttempts >= maxAttempts) {
      this.setStatus('error');
      return;
    }

    this.reconnectAttempts++;
    this.setStatus('reconnecting');

    // 指数退避：1s, 2s, 4s, 8s, 16s
    const delay = Math.pow(2, this.reconnectAttempts - 1) * 1000;
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private setStatus(status: WsConnectionStatus): void {
    this.status = status;
    this.options.onStatusChange?.(status);
  }
}
```

---

## Task 3: AI 对话 Zustand store

**Files:**
- `web-console/src/stores/chat.ts`

- [ ] **Step 1: 创建 src/stores/chat.ts**

实现 Zustand store，管理：
- WsClient 单例（绑定 JWT token）
- 会话列表 `sessions: ChatSession[]`
- 当前会话 `currentSessionKey: string | null`
- 消息映射 `messagesBySession: Map<string, ChatMessage[]>`
- runId → sessionKey 映射 `runIdToSession: Map<string, string>`
- 连接状态 `connectionStatus`
- 流式缓冲 `streamingBuffers: Map<string, string>`
- 断线恢复逻辑（chat.history + inFlightRun）

```typescript
import { create } from 'zustand';
import { WsClient } from '../lib/ws-client';
import { useAuthStore } from './auth';
import type {
  ChatMessage,
  ChatSession,
  ChatEventPayload,
  ChatHistoryResponse,
  ChatSendResponse,
  InFlightRunSnapshot,
  WsConnectionStatus,
  AcpEvent,
  ToolCallRecord,
} from '../types/chat';

interface ChatState {
  // 连接
  wsClient: WsClient | null;
  connectionStatus: WsConnectionStatus;
  // 会话
  sessions: ChatSession[];
  currentSessionKey: string | null;
  // 消息（按 sessionKey 分组）
  messagesBySession: Record<string, ChatMessage[]>;
  // runId → sessionKey 映射
  runIdToSession: Record<string, string>;
  // 流式缓冲（runId → 已接收文本）
  streamingBuffers: Record<string, string>;
  // 输入框
  inputText: string;
  // 是否正在发送
  isSending: boolean;

  // Actions
  connect: () => void;
  disconnect: () => void;
  setConnectionStatus: (status: WsConnectionStatus) => void;
  handleEvent: (event: string, payload: unknown) => void;
  handleGap: (expectedSeq: number, receivedSeq: number) => void;

  createSession: () => string;
  selectSession: (sessionKey: string) => void;
  loadSessionHistory: (sessionKey: string) => Promise<void>;

  sendMessage: (text: string) => Promise<void>;
  abortRun: (runId: string) => Promise<void>;

  setInputText: (text: string) => void;
}

const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || 'ws://localhost:3005/ws';

function generateSessionKey(): string {
  const userId = useAuthStore.getState().user?.userId || 'anonymous';
  const ts = Date.now();
  const rand = Math.random().toString(36).slice(2, 8);
  return `chat:${userId}:${ts}:${rand}`;
}

function generateRunId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function generateMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** ACP 事件 → ChatMessage 转换 */
function acpEventsToMessages(sessionKey: string, events: AcpEvent[]): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const runMap = new Map<string, ChatMessage>();

  for (const evt of events) {
    const { runId } = evt.payload;

    if (evt.type === 'user_message') {
      messages.push({
        id: generateMessageId(),
        sessionKey,
        runId,
        role: 'user',
        content: evt.payload.message || '',
        toolCalls: [],
        status: 'complete',
        createdAt: evt.seq * 1000,
      });
    } else if (evt.type === 'assistant_delta') {
      let msg = runMap.get(runId);
      if (!msg) {
        msg = {
          id: generateMessageId(),
          sessionKey,
          runId,
          role: 'assistant',
          content: '',
          toolCalls: [],
          status: 'streaming',
          createdAt: evt.seq * 1000,
        };
        runMap.set(runId, msg);
        messages.push(msg);
      }
      msg.content += evt.payload.delta || '';
    } else if (evt.type === 'assistant_complete') {
      let msg = runMap.get(runId);
      if (!msg) {
        msg = {
          id: generateMessageId(),
          sessionKey,
          runId,
          role: 'assistant',
          content: '',
          toolCalls: [],
          status: 'complete',
          createdAt: evt.seq * 1000,
        };
        runMap.set(runId, msg);
        messages.push(msg);
      }
      msg.content = evt.payload.finalText || msg.content;
      msg.status = 'complete';
    } else if (evt.type === 'tool_call') {
      let msg = runMap.get(runId);
      if (!msg) {
        msg = {
          id: generateMessageId(),
          sessionKey,
          runId,
          role: 'assistant',
          content: '',
          toolCalls: [],
          status: 'streaming',
          createdAt: evt.seq * 1000,
        };
        runMap.set(runId, msg);
        messages.push(msg);
      }
      if (evt.payload.toolCall) {
        msg.toolCalls.push({
          id: evt.payload.toolCall.id,
          name: evt.payload.toolCall.name,
          args: evt.payload.toolCall.args,
          status: 'pending',
        });
      }
    } else if (evt.type === 'tool_result') {
      let msg = runMap.get(runId);
      if (!msg) {
        msg = {
          id: generateMessageId(),
          sessionKey,
          runId,
          role: 'assistant',
          content: '',
          toolCalls: [],
          status: 'streaming',
          createdAt: evt.seq * 1000,
        };
        runMap.set(runId, msg);
        messages.push(msg);
      }
      if (evt.payload.result) {
        const tc = msg.toolCalls.find((t) => t.status === 'pending');
        if (tc) {
          tc.result = evt.payload.result;
          tc.status = 'completed';
        }
      }
    }
  }

  return messages;
}

export const useChatStore = create<ChatState>((set, get) => ({
  wsClient: null,
  connectionStatus: 'disconnected',
  sessions: [],
  currentSessionKey: null,
  messagesBySession: {},
  runIdToSession: {},
  streamingBuffers: {},
  inputText: '',
  isSending: false,

  connect: () => {
    const { wsClient } = get();
    if (wsClient) return;

    const token = useAuthStore.getState().tokens?.accessToken;
    if (!token) return;

    const client = new WsClient({
      url: WS_BASE_URL,
      token,
      onStatusChange: (status) => {
        set({ connectionStatus: status });
      },
      onEvent: (event, payload) => {
        get().handleEvent(event, payload);
      },
      onGap: (expected, received) => {
        get().handleGap(expected, received);
      },
      reconnectMaxAttempts: 5,
      requestTimeoutMs: 15000,
    });

    client.connect();
    set({ wsClient: client });
  },

  disconnect: () => {
    const { wsClient } = get();
    if (wsClient) {
      wsClient.close();
      set({ wsClient: null, connectionStatus: 'disconnected' });
    }
  },

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  handleEvent: (event, payload) => {
    if (event !== 'chat') return;

    const chatPayload = payload as ChatEventPayload;
    const { runId, type } = chatPayload;
    const state = get();
    const sessionKey = state.runIdToSession[runId];

    if (!sessionKey) {
      // 未知 runId，可能是其他客户端触发的，忽略
      return;
    }

    const messages = state.messagesBySession[sessionKey] || [];
    const msgIndex = messages.findIndex((m) => m.runId === runId);

    switch (type) {
      case 'text_delta': {
        const delta = (chatPayload as { delta: string }).delta;
        // 更新缓冲
        const buffer = state.streamingBuffers[runId] || '';
        const newBuffer = buffer + delta;
        set({
          streamingBuffers: { ...state.streamingBuffers, [runId]: newBuffer },
        });

        // 更新消息
        if (msgIndex >= 0) {
          const newMessages = [...messages];
          newMessages[msgIndex] = {
            ...newMessages[msgIndex],
            content: newBuffer,
            status: 'streaming',
          };
          set({
            messagesBySession: { ...state.messagesBySession, [sessionKey]: newMessages },
          });
        }
        break;
      }

      case 'tool_call': {
        const toolCall = (chatPayload as { toolCall: ToolCallRecord }).toolCall;
        if (msgIndex >= 0) {
          const newMessages = [...messages];
          const msg = { ...newMessages[msgIndex] };
          msg.toolCalls = [
            ...msg.toolCalls,
            { id: toolCall.id, name: toolCall.name, args: toolCall.args, status: 'pending' },
          ];
          newMessages[msgIndex] = msg;
          set({
            messagesBySession: { ...state.messagesBySession, [sessionKey]: newMessages },
          });
        }
        break;
      }

      case 'tool_result': {
        const result = (chatPayload as { result: { name: string; content: unknown } }).result;
        if (msgIndex >= 0) {
          const newMessages = [...messages];
          const msg = { ...newMessages[msgIndex] };
          msg.toolCalls = msg.toolCalls.map((t) =>
            t.status === 'pending' ? { ...t, result, status: 'completed' as const } : t
          );
          newMessages[msgIndex] = msg;
          set({
            messagesBySession: { ...state.messagesBySession, [sessionKey]: newMessages },
          });
        }
        break;
      }

      case 'done': {
        const finalText = (chatPayload as { finalText: string }).finalText;
        if (msgIndex >= 0) {
          const newMessages = [...messages];
          newMessages[msgIndex] = {
            ...newMessages[msgIndex],
            content: finalText,
            status: 'complete',
          };
          set({
            messagesBySession: { ...state.messagesBySession, [sessionKey]: newMessages },
          });
        }
        // 清理缓冲
        const newBuffers = { ...state.streamingBuffers };
        delete newBuffers[runId];
        set({ streamingBuffers: newBuffers, isSending: false });
        break;
      }

      case 'error': {
        const errorMsg = (chatPayload as { error: string }).error;
        if (msgIndex >= 0) {
          const newMessages = [...messages];
          newMessages[msgIndex] = {
            ...newMessages[msgIndex],
            status: 'error',
            error: errorMsg,
          };
          set({
            messagesBySession: { ...state.messagesBySession, [sessionKey]: newMessages },
          });
        }
        const newBuffers = { ...state.streamingBuffers };
        delete newBuffers[runId];
        set({ streamingBuffers: newBuffers, isSending: false });
        break;
      }
    }
  },

  handleGap: (_expected, _received) => {
    // 检测到 seq gap，对当前会话触发 history 恢复
    const { currentSessionKey, wsClient } = get();
    if (!currentSessionKey || !wsClient) return;
    // 触发 chat.history 恢复
    get().loadSessionHistory(currentSessionKey);
  },

  createSession: () => {
    const sessionKey = generateSessionKey();
    const newSession: ChatSession = {
      sessionKey,
      title: '新对话',
      lastMessageAt: Date.now(),
      messageCount: 0,
    };
    set((state) => ({
      sessions: [newSession, ...state.sessions],
      currentSessionKey: sessionKey,
      messagesBySession: { ...state.messagesBySession, [sessionKey]: [] },
    }));
    return sessionKey;
  },

  selectSession: (sessionKey) => {
    set({ currentSessionKey: sessionKey });
    // 加载历史
    get().loadSessionHistory(sessionKey);
  },

  loadSessionHistory: async (sessionKey) => {
    const { wsClient } = get();
    if (!wsClient) return;

    try {
      const res = await wsClient.request<ChatHistoryResponse>('chat.history', { sessionKey });
      const messages = acpEventsToMessages(sessionKey, res.events);

      // 处理 in-flight run
      if (res.inFlightRun) {
        const { runId, bufferedText, isRunning } = res.inFlightRun;
        // 记录 runId 映射
        set((state) => ({
          runIdToSession: { ...state.runIdToSession, [runId]: sessionKey },
        }));

        // 如果有缓冲文本，创建或更新 assistant 消息
        if (bufferedText) {
          const existingIdx = messages.findIndex((m) => m.runId === runId);
          if (existingIdx >= 0) {
            messages[existingIdx].content = bufferedText;
            messages[existingIdx].status = isRunning ? 'streaming' : 'complete';
          } else {
            messages.push({
              id: generateMessageId(),
              sessionKey,
              runId,
              role: 'assistant',
              content: bufferedText,
              toolCalls: [],
              status: isRunning ? 'streaming' : 'complete',
              createdAt: res.inFlightRun.startedAt,
            });
          }
          set((state) => ({
            streamingBuffers: { ...state.streamingBuffers, [runId]: bufferedText },
          }));
        }

        if (isRunning) {
          set({ isSending: true });
        }
      }

      set((state) => ({
        messagesBySession: { ...state.messagesBySession, [sessionKey]: messages },
      }));

      // 更新会话元信息
      set((state) => ({
        sessions: state.sessions.map((s) =>
          s.sessionKey === sessionKey
            ? { ...s, messageCount: messages.length, lastMessageAt: Date.now() }
            : s
        ),
      }));
    } catch (err) {
      console.error('Failed to load session history:', err);
    }
  },

  sendMessage: async (text) => {
    const { wsClient, currentSessionKey } = get();
    if (!wsClient || !currentSessionKey || !text.trim()) return;

    const sessionKey = currentSessionKey;
    const runId = generateRunId();

    // 添加用户消息
    const userMsg: ChatMessage = {
      id: generateMessageId(),
      sessionKey,
      role: 'user',
      content: text,
      toolCalls: [],
      status: 'complete',
      createdAt: Date.now(),
    };

    // 添加 assistant 占位消息
    const assistantMsg: ChatMessage = {
      id: generateMessageId(),
      sessionKey,
      runId,
      role: 'assistant',
      content: '',
      toolCalls: [],
      status: 'streaming',
      createdAt: Date.now(),
    };

    set((state) => ({
      messagesBySession: {
        ...state.messagesBySession,
        [sessionKey]: [...(state.messagesBySession[sessionKey] || []), userMsg, assistantMsg],
      },
      runIdToSession: { ...state.runIdToSession, [runId]: sessionKey },
      streamingBuffers: { ...state.streamingBuffers, [runId]: '' },
      isSending: true,
      inputText: '',
    }));

    // 更新会话标题（首条消息）
    set((state) => ({
      sessions: state.sessions.map((s) =>
        s.sessionKey === sessionKey && s.title === '新对话'
          ? { ...s, title: text.slice(0, 30), lastMessageAt: Date.now(), messageCount: s.messageCount + 1 }
          : s
      ),
    }));

    try {
      await wsClient.request<ChatSendResponse>('chat.send', {
        sessionKey,
        message: text,
        clientRunId: runId,
      });
    } catch (err) {
      // 发送失败，标记 assistant 消息为错误
      const errorMsg = err instanceof Error ? err.message : '发送失败';
      set((state) => {
        const msgs = state.messagesBySession[sessionKey] || [];
        const newMsgs = msgs.map((m) =>
          m.runId === runId ? { ...m, status: 'error' as const, error: errorMsg } : m
        );
        return {
          messagesBySession: { ...state.messagesBySession, [sessionKey]: newMsgs },
          isSending: false,
        };
      });
    }
  },

  abortRun: async (runId) => {
    const { wsClient } = get();
    if (!wsClient) return;
    try {
      await wsClient.request('chat.abort', { runId });
    } catch (err) {
      console.error('Failed to abort run:', err);
    }
  },

  setInputText: (text) => set({ inputText: text }),
}));
```

---

## Task 4: 流式渲染组件

**Files:**
- `web-console/src/components/chat/MessageBubble.tsx`
- `web-console/src/components/chat/ToolCallCard.tsx`
- `web-console/src/components/chat/MessageList.tsx`
- `web-console/src/components/ui/scroll-area.tsx`

- [ ] **Step 1: 创建 src/components/ui/scroll-area.tsx**

轻量滚动容器（不引入 Radix ScrollArea，避免依赖膨胀）。

```typescript
import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export interface ScrollAreaProps extends HTMLAttributes<HTMLDivElement> {
  orientation?: 'vertical' | 'horizontal' | 'both';
}

export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(
  ({ className, children, orientation = 'vertical', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          'overflow-auto',
          orientation === 'vertical' && 'overflow-y-auto overflow-x-hidden',
          orientation === 'horizontal' && 'overflow-x-auto overflow-y-hidden',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
ScrollArea.displayName = 'ScrollArea';
```

- [ ] **Step 2: 创建 src/components/chat/ToolCallCard.tsx**

工具调用卡片，展示工具名、参数、结果。

```typescript
import { useState } from 'react';
import { ChevronDown, ChevronRight, Wrench, CheckCircle2, Loader2 } from 'lucide-react';
import type { ToolCallRecord } from '../../types/chat';
import { cn } from '../../lib/utils';

interface ToolCallCardProps {
  toolCall: ToolCallRecord;
}

export function ToolCallCard({ toolCall }: ToolCallCardProps) {
  const [expanded, setExpanded] = useState(false);

  const isCompleted = toolCall.status === 'completed';

  return (
    <div className="my-2 rounded-md border border-border bg-muted/30 text-sm">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="font-mono text-xs font-medium">{toolCall.name}</span>
        {isCompleted ? (
          <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-green-500" />
        ) : (
          <Loader2 className="ml-auto h-3.5 w-3.5 animate-spin text-muted-foreground" />
        )}
      </button>
      {expanded && (
        <div className="border-t border-border px-3 py-2 space-y-2">
          {toolCall.args != null && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">参数</div>
              <pre className="text-xs font-mono bg-background p-2 rounded overflow-x-auto">
                {typeof toolCall.args === 'string'
                  ? toolCall.args
                  : JSON.stringify(toolCall.args, null, 2)}
              </pre>
            </div>
          )}
          {toolCall.result && (
            <div>
              <div className="text-xs text-muted-foreground mb-1">结果</div>
              <pre className="text-xs font-mono bg-background p-2 rounded overflow-x-auto max-h-60">
                {typeof toolCall.result.content === 'string'
                  ? toolCall.result.content
                  : JSON.stringify(toolCall.result.content, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 创建 src/components/chat/MessageBubble.tsx**

消息气泡，区分 user/assistant，assistant 消息渲染 Markdown + 工具卡片。

```typescript
import { User, Bot, AlertCircle } from 'lucide-react';
import type { ChatMessage } from '../../types/chat';
import { ToolCallCard } from './ToolCallCard';
import { cn } from '../../lib/utils';

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isError = message.status === 'error';
  const isStreaming = message.status === 'streaming';

  return (
    <div className={cn('flex gap-3 px-4 py-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className={cn('flex flex-col gap-1 min-w-0 max-w-[80%]', isUser && 'items-end')}>
        {/* 工具调用卡片（assistant 消息） */}
        {!isUser && message.toolCalls.length > 0 && (
          <div className="w-full">
            {message.toolCalls.map((tc) => (
              <ToolCallCard key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        {/* 消息内容 */}
        {message.content && (
          <div
            className={cn(
              'rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words',
              isUser
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-foreground'
            )}
          >
            {message.content}
            {isStreaming && (
              <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-current animate-pulse align-middle" />
            )}
          </div>
        )}

        {/* 错误提示 */}
        {isError && (
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>{message.error || '生成失败'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 创建 src/components/chat/MessageList.tsx**

消息列表，自动滚动到底部。

```typescript
import { useEffect, useRef } from 'react';
import type { ChatMessage } from '../../types/chat';
import { MessageBubble } from './MessageBubble';
import { ScrollArea } from '../ui/scroll-area';

interface MessageListProps {
  messages: ChatMessage[];
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
        开始新的对话
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="py-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
```

---

## Task 5: 对话页 UI

**Files:**
- `web-console/src/components/chat/SessionList.tsx`
- `web-console/src/components/chat/ChatInput.tsx`
- `web-console/src/pages/ChatReact.tsx`

- [ ] **Step 1: 创建 src/components/chat/SessionList.tsx**

会话列表侧边栏，新建/切换/删除会话。

```typescript
import { Plus, MessageSquare, Trash2 } from 'lucide-react';
import { useChatStore } from '../../stores/chat';
import { cn } from '../../lib/utils';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';

export function SessionList() {
  const sessions = useChatStore((s) => s.sessions);
  const currentSessionKey = useChatStore((s) => s.currentSessionKey);
  const createSession = useChatStore((s) => s.createSession);
  const selectSession = useChatStore((s) => s.selectSession);

  return (
    <div className="flex h-full flex-col border-r border-border bg-background">
      <div className="p-3 border-b border-border">
        <Button onClick={createSession} className="w-full" size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          新建对话
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {sessions.length === 0 && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              暂无对话
            </div>
          )}
          {sessions.map((session) => (
            <div
              key={session.sessionKey}
              className={cn(
                'group flex items-center gap-2 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-muted',
                currentSessionKey === session.sessionKey && 'bg-muted'
              )}
              onClick={() => selectSession(session.sessionKey)}
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate">{session.title}</span>
              <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100">
                {session.messageCount}
              </span>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
```

- [ ] **Step 2: 创建 src/components/chat/ChatInput.tsx`

输入框 + 发送 + 中止按钮。

```typescript
import { useState, type KeyboardEvent } from 'react';
import { Send, Square } from 'lucide-react';
import { useChatStore } from '../../stores/chat';
import { Button } from '../ui/button';
import { cn } from '../../lib/utils';

export function ChatInput() {
  const inputText = useChatStore((s) => s.inputText);
  const isSending = useChatStore((s) => s.isSending);
  const setInputText = useChatStore((s) => s.setInputText);
  const sendMessage = useChatStore((s) => s.sendMessage);
  const abortRun = useChatStore((s) => s.abortRun);
  const streamingBuffers = useChatStore((s) => s.streamingBuffers);

  // 获取当前正在运行的 runId
  const currentRunId = Object.keys(streamingBuffers)[0] || null;

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSend = () => {
    if (!inputText.trim() || isSending) return;
    sendMessage(inputText);
  };

  const handleAbort = () => {
    if (currentRunId) {
      abortRun(currentRunId);
    }
  };

  return (
    <div className="border-t border-border p-3 bg-background">
      <div className="flex items-end gap-2">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="输入消息，Enter 发送，Shift+Enter 换行"
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm',
            'focus:outline-none focus:ring-1 focus:ring-ring',
            'max-h-32 overflow-auto'
          )}
          style={{ minHeight: '40px' }}
        />
        {isSending ? (
          <Button onClick={handleAbort} variant="destructive" size="sm">
            <Square className="h-4 w-4" />
            中止
          </Button>
        ) : (
          <Button onClick={handleSend} disabled={!inputText.trim()} size="sm">
            <Send className="h-4 w-4" />
            发送
          </Button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 创建 src/pages/ChatReact.tsx`（替换占位）**

AI 对话页主组件，组合 SessionList + MessageList + ChatInput，管理 WsClient 生命周期。

```typescript
import { useEffect } from 'react';
import { useChatStore } from '../stores/chat';
import { SessionList } from '../components/chat/SessionList';
import { MessageList } from '../components/chat/MessageList';
import { ChatInput } from '../components/chat/ChatInput';
import { cn } from '../lib/utils';

export default function ChatReact() {
  const connect = useChatStore((s) => s.connect);
  const disconnect = useChatStore((s) => s.disconnect);
  const connectionStatus = useChatStore((s) => s.connectionStatus);
  const currentSessionKey = useChatStore((s) => s.currentSessionKey);
  const messagesBySession = useChatStore((s) => s.messagesBySession);
  const createSession = useChatStore((s) => s.createSession);

  // 连接/断开 WebSocket
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  // 首次进入自动创建会话
  useEffect(() => {
    if (connectionStatus === 'connected' && !currentSessionKey) {
      createSession();
    }
  }, [connectionStatus, currentSessionKey, createSession]);

  const messages = currentSessionKey ? messagesBySession[currentSessionKey] || [] : [];

  const statusText = {
    disconnected: '未连接',
    connecting: '连接中...',
    connected: '已连接',
    reconnecting: '重连中...',
    error: '连接错误',
  }[connectionStatus];

  const statusColor = {
    disconnected: 'bg-muted-foreground',
    connecting: 'bg-yellow-500',
    connected: 'bg-green-500',
    reconnecting: 'bg-yellow-500',
    error: 'bg-red-500',
  }[connectionStatus];

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* 会话列表 */}
      <div className="w-64 shrink-0">
        <SessionList />
      </div>

      {/* 对话区 */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* 顶栏：连接状态 */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <span className={cn('h-2 w-2 rounded-full', statusColor)} />
          <span className="text-xs text-muted-foreground">{statusText}</span>
        </div>

        {/* 消息列表 */}
        <div className="flex-1 min-h-0">
          {currentSessionKey ? (
            <MessageList messages={messages} />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
              选择或新建对话
            </div>
          )}
        </div>

        {/* 输入区 */}
        {currentSessionKey && <ChatInput />}
      </div>
    </div>
  );
}
```

---

## Task 6: 端到端验证 + commit

- [ ] **Step 1: 安装新依赖**

```bash
cd web-console && pnpm add react-markdown
```

注意：Task 4 的 MessageBubble 当前用 `whitespace-pre-wrap` 简单渲染，如需 Markdown 支持再引入 react-markdown。当前实现已足够。

- [ ] **Step 2: TypeScript 编译检查**

```bash
cd web-console && pnpm exec tsc --noEmit
```

- [ ] **Step 3: 生产构建**

```bash
cd web-console && pnpm build
```

- [ ] **Step 4: 启动 dev server 验证**

```bash
cd web-console && pnpm dev
```

访问 http://localhost:5173/chat/react，验证：
- 登录后跳转对话页
- WebSocket 连接状态指示器变绿
- 新建会话后可发送消息
- 流式渲染逐字显示
- 工具调用卡片可展开
- 中止按钮可停止生成

- [ ] **Step 5: commit**

```bash
git add -A && git commit -m "feat(web-console): Phase 5.4 AI 对话页 React 版（WebSocket 流式 + 断线恢复）

- 新增 WS 协议类型定义（types/chat.ts）
- 新增 WebSocket 客户端类（lib/ws-client.ts）：连接管理 + req/res 配对 + seq gap 检测 + 自动重连
- 新增 AI 对话 Zustand store（stores/chat.ts）：会话/消息/runId 映射/断线恢复
- 新增流式渲染组件：MessageList + MessageBubble + ToolCallCard
- 新增对话页 UI：SessionList + ChatInput + ChatReact 页面
- 支持 chat.send/chat.history/chat.abort/sessions.subscribe RPC
- 支持 text_delta/tool_call/tool_result/done/error 事件处理
- 支持 seq gap 检测 + chat.history 断线恢复"
```

---

## 验收标准

1. ✅ TypeScript 编译无错误
2. ✅ 生产构建成功
3. ✅ dev server 启动正常
4. ✅ WebSocket 连接成功（hello-ok 后状态变绿）
5. ✅ 可新建会话、发送消息
6. ✅ 流式渲染逐字显示
7. ✅ 工具调用卡片可展开查看参数/结果
8. ✅ 中止按钮可停止生成
9. ✅ 断线后自动重连 + chat.history 恢复
