import { useState, useRef, useEffect } from 'react'
import { Send, Square } from 'lucide-react'
import { ModeToggle } from './ModeToggle'
import type { ChatMode } from '../../api/types'

interface ChatInputProps {
  mode: ChatMode
  isStreaming: boolean
  onSend: (message: string) => void
  onStop: () => void
  onModeChange: (mode: ChatMode) => void
}

export function ChatInput({ mode, isStreaming, onSend, onStop, onModeChange }: ChatInputProps) {
  const [input, setInput] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 150) + 'px'
    }
  }, [input])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleSend = () => {
    if (!input.trim() || isStreaming) return
    onSend(input)
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
  }

  return (
    <div className="chat-input-area">
      <div className="chat-input-bar">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Type a message..."
          rows={1}
          disabled={isStreaming}
        />
        {isStreaming ? (
          <button className="stop-btn" onClick={onStop} title="Stop">
            <Square size={16} />
          </button>
        ) : (
          <button
            className="send-btn"
            onClick={handleSend}
            disabled={!input.trim()}
            title="Send"
          >
            <Send size={16} />
          </button>
        )}
      </div>
      <ModeToggle mode={mode} onChange={onModeChange} disabled={isStreaming} />
      <div className="chat-hint">
        MultiCloud AI Agent · {mode === 'plan' ? 'Plan mode is read-only' : mode === 'build' ? 'Build mode executes operations' : 'Confirm mode requires approval'}
      </div>
    </div>
  )
}
