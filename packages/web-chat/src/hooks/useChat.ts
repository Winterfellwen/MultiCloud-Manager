import { useState, useCallback, useRef } from 'react'
import { sendChatMessage, confirmChat, stopChat } from '../api/chat'
import { getSession } from '../api/sessions'
import type { Message, ChatMode, ToolCall, SSEEvent } from '../api/types'

interface ChatState {
  messages: Message[]
  isStreaming: boolean
  currentRunId: string | null
  currentSessionId: string | null
  mode: ChatMode
  toolCalls: ToolCall[]
  streamingContent: string
}

export function useChat() {
  const [state, setState] = useState<ChatState>({
    messages: [],
    isStreaming: false,
    currentRunId: null,
    currentSessionId: null,
    mode: 'plan',
    toolCalls: [],
    streamingContent: '',
  })

  const toolCallsRef = useRef<ToolCall[]>([])
  const streamingContentRef = useRef('')

  const setMode = useCallback((mode: ChatMode) => {
    setState(prev => ({ ...prev, mode }))
  }, [])

  const loadSession = useCallback(async (sessionId: string) => {
    try {
      const data = await getSession(sessionId)
      const messages: Message[] = []

      if (data.messages) {
        for (const m of data.messages) {
          messages.push({
            role: m.role as Message['role'],
            content: m.content,
            created_at: m.created_at,
          })
        }
      }

      if (messages.length === 0) {
        messages.push({
          role: 'agent',
          content: 'Hello! I\'m your MultiCloud AI assistant. How can I help you?',
          created_at: new Date().toISOString(),
        })
      }

      setState(prev => ({
        ...prev,
        messages,
        currentSessionId: sessionId,
        currentRunId: data.active_run_id || null,
        isStreaming: !!data.active_run_id,
      }))

      return data
    } catch (err) {
      console.error('Failed to load session:', err)
      return null
    }
  }, [])

  const sendMessage = useCallback(async (message: string) => {
    const { currentSessionId, mode } = state
    if (!currentSessionId || !message.trim()) return

    const userMessage: Message = {
      role: 'user',
      content: message.trim(),
      created_at: new Date().toISOString(),
    }

    setState(prev => ({
      ...prev,
      messages: [...prev.messages, userMessage],
      isStreaming: true,
      streamingContent: '',
      toolCalls: [],
    }))
    streamingContentRef.current = ''
    toolCallsRef.current = []

    try {
      const res = await sendChatMessage({
        message: message.trim(),
        session_id: currentSessionId,
        mode,
      })

      setState(prev => ({
        ...prev,
        currentRunId: res.run_id,
      }))
    } catch (err) {
      console.error('Failed to send message:', err)
      setState(prev => ({
        ...prev,
        isStreaming: false,
        messages: [...prev.messages, {
          role: 'system',
          content: `Error: ${err instanceof Error ? err.message : 'Failed to send message'}`,
        }],
      }))
    }
  }, [state.currentSessionId, state.mode])

  const handleConfirm = useCallback(async (toolName: string, params?: Record<string, unknown>) => {
    const { currentRunId } = state
    if (!currentRunId) return

    try {
      await confirmChat({
        run_id: currentRunId,
        action: 'confirm',
        tool_name: toolName,
        tool_params: params,
      })
    } catch (err) {
      console.error('Failed to confirm:', err)
    }
  }, [state.currentRunId])

  const handleReject = useCallback(async (toolName: string) => {
    const { currentRunId } = state
    if (!currentRunId) return

    try {
      await confirmChat({
        run_id: currentRunId,
        action: 'reject',
        tool_name: toolName,
      })
    } catch (err) {
      console.error('Failed to reject:', err)
    }
  }, [state.currentRunId])

  const handleStop = useCallback(async () => {
    const { currentRunId } = state
    if (!currentRunId) return

    try {
      await stopChat(currentRunId)
      setState(prev => ({ ...prev, isStreaming: false }))
    } catch (err) {
      console.error('Failed to stop:', err)
    }
  }, [state.currentRunId])

  const handleSSEEvent = useCallback((event: SSEEvent) => {
    if (event.run_id && event.run_id !== state.currentRunId) return

    switch (event.type) {
      case 'token': {
        streamingContentRef.current += event.content || ''
        setState(prev => ({
          ...prev,
          streamingContent: streamingContentRef.current,
        }))
        break
      }
      case 'tool_start': {
        if (event.tool_calls) {
          toolCallsRef.current = event.tool_calls.map(tc => ({
            ...tc,
            status: 'running' as const,
          }))
          setState(prev => ({
            ...prev,
            toolCalls: [...toolCallsRef.current],
          }))
        }
        break
      }
      case 'tool_result': {
        const toolName = event.tool_name || ''
        toolCallsRef.current = toolCallsRef.current.map(tc =>
          tc.name === toolName
            ? { ...tc, status: event.error ? 'error' : 'done', result: event.result, error: event.error }
            : tc
        )
        setState(prev => ({
          ...prev,
          toolCalls: [...toolCallsRef.current],
          streamingContent: '',
        }))
        streamingContentRef.current = ''
        break
      }
      case 'confirm_required': {
        setState(prev => ({ ...prev, isStreaming: false }))
        break
      }
      case 'state_change': {
        if (event.state === 'done' || event.state === 'error' || event.state === 'stopped') {
          const finalContent = streamingContentRef.current
          const finalToolCalls = [...toolCallsRef.current]

          setState(prev => {
            const newMessages = [...prev.messages]
            if (finalContent || finalToolCalls.length > 0) {
              newMessages.push({
                role: 'agent',
                content: finalContent,
                created_at: new Date().toISOString(),
              })
            }
            return {
              ...prev,
              messages: newMessages,
              isStreaming: false,
              streamingContent: '',
              toolCalls: [],
              currentRunId: null,
            }
          })
          streamingContentRef.current = ''
          toolCallsRef.current = []
        }
        break
      }
      case 'done': {
        const finalContent = streamingContentRef.current
        const finalToolCalls = [...toolCallsRef.current]

        setState(prev => {
          const newMessages = [...prev.messages]
          if (finalContent || finalToolCalls.length > 0) {
            newMessages.push({
              role: 'agent',
              content: finalContent,
              created_at: new Date().toISOString(),
            })
          }
          return {
            ...prev,
            messages: newMessages,
            isStreaming: false,
            streamingContent: '',
            toolCalls: [],
            currentRunId: null,
          }
        })
        streamingContentRef.current = ''
        toolCallsRef.current = []
        break
      }
      case 'error': {
        setState(prev => ({
          ...prev,
          isStreaming: false,
          messages: [...prev.messages, {
            role: 'system',
            content: `Error: ${event.message || event.error || 'Unknown error'}`,
          }],
          currentRunId: null,
        }))
        streamingContentRef.current = ''
        toolCallsRef.current = []
        break
      }
    }
  }, [state.currentRunId])

  return {
    ...state,
    setMode,
    loadSession,
    sendMessage,
    handleConfirm,
    handleReject,
    handleStop,
    handleSSEEvent,
  }
}
