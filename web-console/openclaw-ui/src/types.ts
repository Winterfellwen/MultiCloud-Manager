// CloudOps WebSocket 协议类型（对齐 web-console/src/types/chat.ts）

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

// RPC 方法参数
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

// RPC 方法响应
export interface ChatSendResponse {
  runId: string;
  status: 'started' | 'in_flight';
}

export interface ChatHistoryResponse {
  sessionKey: string;
  events: AcpEvent[];
  inFlightRun: InFlightRunSnapshot | null;
}

// chat 事件 payload
export interface ChatTextDeltaPayload {
  runId: string;
  type: 'text_delta';
  delta: string;
}

export interface ChatToolCallPayload {
  runId: string;
  type: 'tool_call';
  toolCall: { id: string; name: string; args: unknown };
}

export interface ChatToolResultPayload {
  runId: string;
  type: 'tool_result';
  result: { name: string; content: unknown };
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

// ACP 事件（历史重放）
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

// in-flight run 快照
export interface InFlightRunSnapshot {
  runId: string;
  bufferedText: string;
  isRunning: boolean;
  startedAt: number;
}

// 前端数据结构
export type MessageRole = 'user' | 'assistant';

export interface ToolCallRecord {
  id: string;
  name: string;
  args: unknown;
  result?: { name: string; content: unknown };
  status: 'pending' | 'completed';
}

export type MessageStatus = 'streaming' | 'complete' | 'error' | 'aborted';

export interface ChatMessage {
  id: string;
  sessionKey: string;
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

export type WsConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';
