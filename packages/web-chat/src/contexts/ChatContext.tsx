import { createContext, useContext } from 'react'
import type { ChatMode, Message, ToolCall } from '../api/types'

export interface ChatContextValue {
  messages: Message[]
  isStreaming: boolean
  currentRunId: string | null
  currentSessionId: string | null
  mode: ChatMode
  toolCalls: ToolCall[]
  streamingContent: string
  setMode: (mode: ChatMode) => void
  loadSession: (sessionId: string) => Promise<unknown>
  sendMessage: (message: string) => Promise<void>
  handleConfirm: (toolName: string, params?: Record<string, unknown>) => Promise<void>
  handleReject: (toolName: string) => Promise<void>
  handleStop: () => Promise<void>
  handleSSEEvent: (event: import('../api/types').SSEEvent) => void
}

export const ChatContext = createContext<ChatContextValue | null>(null)

export function useChatContext() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChatContext must be used within ChatProvider')
  return ctx
}
