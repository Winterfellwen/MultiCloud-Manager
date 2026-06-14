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

export function useChat(onRunComplete?: () => void) {
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
  const currentRunIdRef = useRef<string | null>(null)
  const onRunCompleteRef = useRef(onRunComplete)
  onRunCompleteRef.current = onRunComplete

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
      currentRunIdRef.current = data.active_run_id || null

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

      currentRunIdRef.current = res.run_id
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
    const currentRunId = currentRunIdRef.current
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
  }, [])

  const handleReject = useCallback(async (toolName: string) => {
    const currentRunId = currentRunIdRef.current
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
  }, [])

  const handleStop = useCallback(async () => {
    const currentRunId = currentRunIdRef.current
    if (!currentRunId) return

    try {
      await stopChat(currentRunId)
      currentRunIdRef.current = null
      setState(prev => ({ ...prev, isStreaming: false, currentRunId: null }))
    } catch (err) {
      console.error('Failed to stop:', err)
    }
  }, [])

  const handleSSEEvent = useCallback((event: SSEEvent) => {
    const currentRunId = currentRunIdRef.current
    // Don't filter state_change/done/error events - they may arrive before currentRunId is set
    const terminalEvents = ['state_change', 'done', 'error']
    if (!terminalEvents.includes(event.event_type) && event.run_id && currentRunId && event.run_id !== currentRunId) {
      return
    }

    const eventType = event.event_type
    const payload = event.payload || {}

    switch (eventType) {
      case 'token': {
        streamingContentRef.current += payload.content || ''
        setState(prev => ({
          ...prev,
          streamingContent: streamingContentRef.current,
        }))
        break
      }
      case 'tool_start': {
        if (payload.tool_calls) {
          toolCallsRef.current = payload.tool_calls.map(tc => {
            // Transform from OpenAI format {function: {name, arguments}} to internal format
            const fn = (tc as any).function
            if (fn) {
              let params = {}
              try {
                params = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : fn.arguments || {}
              } catch { params = {} }
              return {
                id: (tc as any).id || `tc-${Date.now()}`,
                name: fn.name,
                params,
                status: 'running' as const,
              }
            }
            return { ...tc, status: 'running' as const }
          })
          setState(prev => ({
            ...prev,
            toolCalls: [...toolCallsRef.current],
          }))
        }
        break
      }
      case 'tool_result': {
        const toolName = payload.tool_name || ''
        toolCallsRef.current = toolCallsRef.current.map(tc =>
          tc.name === toolName
            ? { ...tc, status: payload.error ? 'error' : 'done', result: payload.result, error: payload.error }
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
        if (payload.state === 'done' || payload.state === 'error' || payload.state === 'stopped') {
          const finalContent = streamingContentRef.current
          const finalToolCalls = [...toolCallsRef.current]

          currentRunIdRef.current = null
          setState(prev => {
            const newMessages = [...prev.messages]
            if (finalContent || finalToolCalls.length > 0) {
              newMessages.push({
                role: 'agent',
                content: finalContent,
                created_at: new Date().toISOString(),
                toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
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
          onRunCompleteRef.current?.()
        }
        break
      }
      case 'done': {
        const finalContent = streamingContentRef.current
        const finalToolCalls = [...toolCallsRef.current]

        currentRunIdRef.current = null
        setState(prev => {
          const newMessages = [...prev.messages]
          if (finalContent || finalToolCalls.length > 0) {
            newMessages.push({
              role: 'agent',
              content: finalContent,
              created_at: new Date().toISOString(),
              toolCalls: finalToolCalls.length > 0 ? finalToolCalls : undefined,
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
        onRunCompleteRef.current?.()
        break
      }
      case 'error': {
        currentRunIdRef.current = null
        setState(prev => ({
          ...prev,
          isStreaming: false,
          messages: [...prev.messages, {
            role: 'system',
            content: `Error: ${payload.message || payload.error || 'Unknown error'}`,
          }],
          currentRunId: null,
        }))
        streamingContentRef.current = ''
        toolCallsRef.current = []
        break
      }
    }
  }, []) // No dependencies - uses refs for all mutable state

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
