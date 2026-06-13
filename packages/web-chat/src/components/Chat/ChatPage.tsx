import { useState, useCallback, useEffect } from 'react'
import { useChat } from '../../hooks/useChat'
import { useSessions } from '../../hooks/useSessions'
import { useSSE } from '../../hooks/useSSE'
import { ChatContext } from '../../contexts/ChatContext'
import { SessionSidebar } from './SessionSidebar'
import { MessageList } from './MessageList'
import { ChatInput } from './ChatInput'
import { ConfirmCard } from './ConfirmCard'
import { FilesSidebar } from '../Files/FilesSidebar'
import type { FileItem } from '../../api/types'

export function ChatPage() {
  const chat = useChat()
  const sessions = useSessions()
  const [filesSidebarOpen, setFilesSidebarOpen] = useState(false)
  const files: FileItem[] = []
  const [confirmToolCalls, setConfirmToolCalls] = useState<{ name: string; params?: Record<string, unknown> }[]>([])

  useSSE({
    sessionIds: chat.currentSessionId ? [chat.currentSessionId] : [],
    onEvent: (event) => {
      chat.handleSSEEvent(event)
      if (event.type === 'confirm_required' && event.tool_calls) {
        setConfirmToolCalls(event.tool_calls.map(tc => ({
          name: tc.name,
          params: tc.params,
        })))
      }
    },
    enabled: !!chat.currentSessionId,
  })

  useEffect(() => {
    sessions.loadSessions()
  }, [])

  const handleSelectSession = useCallback(async (sessionId: string) => {
    await chat.loadSession(sessionId)
    setConfirmToolCalls([])
  }, [chat.loadSession])

  const handleCreateSession = useCallback(async () => {
    const sid = await sessions.createSession('New Session')
    await handleSelectSession(sid)
  }, [sessions.createSession, handleSelectSession])

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    if (chat.currentSessionId === sessionId) {
      // TODO: clear current session
    }
    await sessions.deleteSession(sessionId)
  }, [chat.currentSessionId, sessions.deleteSession])

  const handleConfirm = useCallback((toolName: string, params?: Record<string, unknown>) => {
    chat.handleConfirm(toolName, params)
    setConfirmToolCalls(prev => prev.filter(tc => tc.name !== toolName))
  }, [chat.handleConfirm])

  const handleReject = useCallback((toolName: string) => {
    chat.handleReject(toolName)
    setConfirmToolCalls(prev => prev.filter(tc => tc.name !== toolName))
  }, [chat.handleReject])

  return (
    <ChatContext.Provider value={chat}>
      <div className="chat-layout">
        <SessionSidebar
          sessions={sessions.sessions}
          currentSessionId={chat.currentSessionId}
          loading={sessions.loading}
          onSelect={handleSelectSession}
          onCreate={handleCreateSession}
          onDelete={handleDeleteSession}
          onLoad={sessions.loadSessions}
        />

        <div className="chat-main">
          <div className="chat-header">
            <div className="chat-header-title">AI Cloud Assistant</div>
            <div className="chat-header-actions">
              <button
                className={`files-toggle ${filesSidebarOpen ? 'active' : ''}`}
                onClick={() => setFilesSidebarOpen(!filesSidebarOpen)}
              >
                Files
              </button>
            </div>
          </div>

          <MessageList
            messages={chat.messages}
            toolCalls={chat.toolCalls}
            streamingContent={chat.streamingContent}
            isStreaming={chat.isStreaming}
          />

          {confirmToolCalls.length > 0 && (
            <div className="confirm-area">
              <ConfirmCard
                toolCalls={confirmToolCalls.map((tc, i) => ({
                  id: `confirm-${i}`,
                  name: tc.name,
                  params: tc.params || {},
                  status: 'running' as const,
                }))}
                onConfirm={handleConfirm}
                onReject={handleReject}
              />
            </div>
          )}

          <ChatInput
            mode={chat.mode}
            isStreaming={chat.isStreaming}
            onSend={chat.sendMessage}
            onStop={chat.handleStop}
            onModeChange={chat.setMode}
          />
        </div>

        <FilesSidebar
          open={filesSidebarOpen}
          files={files}
          onClose={() => setFilesSidebarOpen(false)}
        />
      </div>
    </ChatContext.Provider>
  )
}
