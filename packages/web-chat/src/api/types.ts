export interface Session {
  session_id: string
  title: string
  created_at: string
  updated_at: string
  status: 'idle' | 'running' | 'waiting_confirm' | 'done' | 'error' | 'stopped' | 'queued'
  queue_depth: number
  has_unread: boolean
  user_id?: string
  provider?: string
}

export interface Message {
  role: 'user' | 'agent' | 'assistant' | 'system' | 'tool-calls'
  content: string
  created_at?: string
  timestamp?: string
  toolCalls?: ToolCall[]
}

export interface ToolCall {
  id: string
  name: string
  params: Record<string, unknown>
  result?: string
  error?: string
  status: 'running' | 'done' | 'error'
}

export interface FileItem {
  name: string
  path: string
  size: number
  type: string
  content?: string
}

export interface SSEEvent {
  id: number
  run_id?: string
  session_id?: string
  seq?: number
  event_type: string
  payload?: {
    content?: string
    tool_calls?: ToolCall[]
    tool_name?: string
    result?: string
    error?: string
    message?: string
    state?: string
    error_message?: string
    [key: string]: unknown
  }
  created_at?: string
}

export interface AIConfig {
  api_endpoint: string
  model: string
  api_key: string
  enable_reasoning: boolean
  reasoning_effort: 'low' | 'medium' | 'high'
}

export type ChatMode = 'plan' | 'build' | 'confirm'

export interface SessionMessages {
  [sessionId: string]: Message[]
}
