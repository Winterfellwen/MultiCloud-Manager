import { useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { MessageItem } from './MessageItem'
import type { Message, ToolCall } from '../../api/types'

interface MessageListProps {
  messages: Message[]
  toolCalls: ToolCall[]
  streamingContent: string
  isStreaming: boolean
}

export function MessageList({ messages, toolCalls, streamingContent, isStreaming }: MessageListProps) {
  const parentRef = useRef<HTMLDivElement>(null)

  const allItems = [
    ...messages,
    // Show tool calls as a special item when they exist during streaming
    ...(isStreaming && toolCalls.length > 0
      ? [{ role: 'tool-calls' as const, content: '', created_at: undefined }]
      : []),
    ...(isStreaming && streamingContent
      ? [{ role: 'agent' as const, content: streamingContent, created_at: undefined }]
      : []),
    ...(isStreaming && !streamingContent && toolCalls.length === 0
      ? [{ role: 'agent' as const, content: '__thinking__', created_at: undefined }]
      : []),
  ]

  const virtualizer = useVirtualizer({
    count: allItems.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80,
    overscan: 5,
  })

  useEffect(() => {
    if (allItems.length > 0) {
      virtualizer.scrollToIndex(allItems.length - 1, { align: 'end' })
    }
  }, [allItems.length, streamingContent])

  return (
    <div ref={parentRef} className="chat-messages" style={{ overflow: 'auto' }}>
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const msg = allItems[virtualRow.index]
          const isLast = virtualRow.index === allItems.length - 1

          return (
            <div
              key={virtualRow.index}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualRow.start}px)`,
              }}
              ref={virtualizer.measureElement}
              data-index={virtualRow.index}
            >
              {msg.content === '__thinking__' ? (
                <div className="msg agent streaming">
                  <div className="msg-role">
                    <span className="role-icon">🤖</span>
                    <span className="role-label">AI</span>
                  </div>
                  <div className="msg-content">
                    <span className="inline-status">Thinking...</span>
                  </div>
                </div>
              ) : msg.role === 'tool-calls' ? (
                // Render tool calls directly when they exist during streaming
                <MessageItem
                  message={{ role: 'agent', content: '', created_at: undefined }}
                  toolCalls={toolCalls}
                  isStreaming={true}
                />
              ) : (
                <MessageItem
                  message={msg}
                  toolCalls={[]}
                  isStreaming={isLast && isStreaming && !!streamingContent}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
