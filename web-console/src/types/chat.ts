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

/** 服务端 → 客户端：错误帧（如认证失败） */
export interface WsErrorFrame {
  type: 'error';
  error: string;
}

export type WsServerFrame = WsResFrame | WsEventFrame | WsErrorFrame;

// ===== RPC 方法参数 =====

export interface ChatSendParams {
  sessionKey: string;
  message: string;
  clientRunId?: string;
  /** 附件列表（content 为 base64 编码） */
  attachments?: ChatSendAttachment[];
  model?: string;
  /** 是否启用深度思考（reasoning）模式 */
  enableThinking?: boolean;
  /** 温度覆盖 */
  temperature?: number;
  /** 最大 token 覆盖 */
  maxTokens?: number;
}

/** chat.send 附件载荷（wire 格式） */
export interface ChatSendAttachment {
  /** 附件类型分类：image / audio / file */
  type: string;
  mimeType: string;
  fileName?: string;
  /** base64 编码内容（不含 data: 前缀） */
  content: string;
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

export interface ChatReasoningDeltaPayload {
  runId: string;
  type: 'reasoning_delta';
  delta: string;
}

export interface ChatToolCallPayload {
  runId: string;
  type: 'tool_call';
  toolCall: {
    id: string;
    name: string;
    arguments: unknown;
  };
}

export interface ChatToolResultPayload {
  runId: string;
  type: 'tool_result';
  /** 关联的工具调用 ID（用于精确匹配 tool_call） */
  toolCallId?: string;
  result: {
    name?: string;
    success?: boolean;
    data?: unknown;
    error?: string;
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

export interface ChatAbortedPayload {
  runId: string;
  type: 'aborted';
}

export type ChatEventPayload =
  | ChatTextDeltaPayload
  | ChatReasoningDeltaPayload
  | ChatToolCallPayload
  | ChatToolResultPayload
  | ChatDonePayload
  | ChatErrorPayload
  | ChatAbortedPayload;

// ===== ACP 事件（历史重放，eventType 命名与实时事件有差异） =====

export interface AcpEvent {
  seq: number;
  /** 事件时间戳（ms） */
  timestamp: number;
  type:
    | 'user_message'
    | 'assistant_delta'
    | 'assistant_reasoning'
    | 'assistant_complete'
    | 'tool_call'
    | 'tool_result'
    | 'error';
  payload: {
    runId: string;
    message?: string;
    delta?: string;
    finalText?: string;
    toolCall?: { id: string; name: string; arguments: unknown };
    /** 后端 tool_result 实际 payload 结构：{ name, success, data, error? } */
    result?: { name?: string; success?: boolean; data?: unknown; error?: string };
    /** 关联的工具调用 ID（用于精确匹配 tool_call 与 tool_result） */
    toolCallId?: string;
    error?: string;
  };
}

// ===== in-flight run 快照（chat.history 返回，用于断线恢复） =====

export interface InFlightRunSnapshot {
  runId: string;
  bufferedText: string;
  bufferedReasoning?: string;
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
  /** 工具结果（映射后的前端格式：{ name, content }） */
  result?: { name: string; content: unknown };
  status: ToolCallStatus;
}

/**
 * 内容块：按事件到达顺序记录 assistant 消息的各个部分
 * 渲染时按 blocks 数组顺序输出，确保 reasoning / text / tool_call 按实际时间顺序展示
 */
export type ContentBlock =
  | { type: 'reasoning'; id: string; content: string }
  | { type: 'text'; id: string; content: string }
  | { type: 'tool_call'; id: string; toolCall: ToolCallRecord };

export type MessageStatus = 'streaming' | 'complete' | 'error' | 'aborted';

export interface ChatMessage {
  id: string;
  sessionKey: string;
  /** assistant 消息关联的 runId（user 消息无） */
  runId?: string;
  role: MessageRole;
  content: string;
  /** AI 深度思考（reasoning）过程，与 content 分开存储 */
  reasoning?: string;
  toolCalls: ToolCallRecord[];
  /** 按时间顺序排列的内容块（渲染时优先使用） */
  blocks?: ContentBlock[];
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
