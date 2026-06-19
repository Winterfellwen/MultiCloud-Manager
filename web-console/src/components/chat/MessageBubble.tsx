// 消息气泡：区分 user/assistant，assistant 消息渲染文本 + 工具卡片
import { User, Bot, AlertCircle } from 'lucide-react';
import type { ChatMessage } from '../../types/chat';
import { ToolCallCard } from './ToolCallCard';
import { cn } from '../../lib/utils';

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isError = message.status === 'error';
  const isStreaming = message.status === 'streaming';

  return (
    <div className={cn('flex gap-3 px-4 py-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
          isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div className={cn('flex min-w-0 max-w-[80%] flex-col gap-1', isUser && 'items-end')}>
        {/* 工具调用卡片（assistant 消息） */}
        {!isUser && message.toolCalls.length > 0 && (
          <div className="w-full">
            {message.toolCalls.map((tc) => (
              <ToolCallCard key={tc.id} toolCall={tc} />
            ))}
          </div>
        )}

        {/* 消息内容 */}
        {message.content && (
          <div
            className={cn(
              'whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm',
              isUser
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-foreground'
            )}
          >
            {message.content}
            {isStreaming && (
              <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle" />
            )}
          </div>
        )}

        {/* 错误提示 */}
        {isError && (
          <div className="flex items-center gap-1.5 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5" />
            <span>{message.error || '生成失败'}</span>
          </div>
        )}
      </div>
    </div>
  );
}
