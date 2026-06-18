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
  parameters: Record<string, unknown>;
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
