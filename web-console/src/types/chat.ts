// ai-gateway WebSocket 协议类型定义
// 对接 ws://host:3005/ws?token=<JWT>

// ===== WebSocket 协议帧 =====

/** 客户端 → 服务端：RPC 请求 */
export interface WsReqFrame {
  type: 'req';
  id: string;
  method: string;
  params: unknown;
}

/** 服务端 → 客户端：RPC 响应 */
export interface WsResFrame {
  type: 'res';
  id: string;
  ok: boolean;
  payload: unknown;
}

/** 服务端 → 客户端：事件推送 */
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

// ===== chat 事件 payload（payload.type 区分子类型） =====

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

// ===== ACP 事件（历史重放，eventType 命名与实时事件有差异） =====

export interface AcpEvent {
  seq: number;
  type:
    | 'user_message'
    | 'assistant_delta'
    | 'assistant_complete'
    | 'tool_call'
    | 'tool_result'
    | 'error';
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

// ===== in-flight run 快照（chat.history 返回，用于断线恢复） =====

export interface InFlightRunSnapshot {
  runId: string;
  bufferedText: string;
  isRunning: boolean;
  startedAt: number;
}

// ===== 前端 store 数据结构 =====

export type MessageRole = 'user' | 'assistant';

export type ToolCallStatus = 'pending' | 'completed';

export interface ToolCallRecord {
  id: string;
  name: string;
  args: unknown;
  result?: { name: string; content: unknown };
  status: ToolCallStatus;
}

export type MessageStatus = 'streaming' | 'complete' | 'error' | 'aborted';

export interface ChatMessage {
  id: string;
  sessionKey: string;
  /** assistant 消息关联的 runId（user 消息无） */
  runId?: string;
  role: MessageRole;
  content: string;
  toolCalls: ToolCallRecord[];
  status: MessageStatus;
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
