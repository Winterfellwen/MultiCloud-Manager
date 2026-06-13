import { Bot } from 'lucide-react'
import { MarkdownRenderer } from '../../utils/markdown'
import { ToolCallCard } from './ToolCallCard'
import type { Message, ToolCall } from '../../api/types'

interface MessageItemProps {
  message: Message
  toolCalls?: ToolCall[]
  isStreaming?: boolean
}

export function MessageItem({ message, toolCalls = [], isStreaming }: MessageItemProps) {
  if (message.role === 'system') {
    return (
      <div className="msg system">
        {message.content}
      </div>
    )
  }

  if (message.role === 'user') {
    return (
      <div className="msg user">
        <div className="msg-bubble">
          <p>{message.content}</p>
        </div>
        {message.created_at && (
          <div className="msg-time">
            {new Date(message.created_at).toLocaleTimeString()}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`msg agent ${isStreaming ? 'streaming' : ''}`}>
      <div className="msg-role">
        <span className="role-icon">
          <Bot size={16} />
        </span>
        <span className="role-label">AI</span>
      </div>
      <div className="msg-content">
        {message.content && (
          <div className={`ai-text ${isStreaming ? 'streaming-cursor' : ''}`}>
            <MarkdownRenderer content={message.content} />
          </div>
        )}
        {toolCalls.length > 0 && (
          <div className="tool-calls-container">
            {toolCalls.map((tc) => (
              <ToolCallCard key={tc.id || tc.name} tool={tc} />
            ))}
          </div>
        )}
      </div>
      {message.created_at && !isStreaming && (
        <div className="msg-time">
          {new Date(message.created_at).toLocaleTimeString()}
        </div>
      )}
    </div>
  )
}
