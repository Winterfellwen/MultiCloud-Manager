// 置顶消息组件：在消息列表顶部显示置顶消息，左侧黄色边框标记
import { Pin, User, Bot } from 'lucide-react';
import type { ChatMessage } from '../../types/chat';
import { cn } from '../../lib/utils';

interface PinnedMessagesProps {
  /** 置顶消息列表（含原始索引） */
  items: Array<{ message: ChatMessage; index: number }>;
  /** 取消置顶回调 */
  onUnpin: (index: number) => void;
}

export function PinnedMessages({ items, onUnpin }: PinnedMessagesProps) {
  if (items.length === 0) return null;

  return (
    <div className="border-b border-border bg-yellow-500/5 px-4 py-2">
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-yellow-600">
        <Pin className="h-3 w-3" />
        <span>置顶消息 ({items.length})</span>
      </div>
      <div className="space-y-1.5">
        {items.map(({ message, index }) => {
          const isUser = message.role === 'user';
          return (
            <div
              key={message.id}
              className={cn(
                'flex items-start gap-2 rounded-md border-l-2 border-yellow-500 bg-background/60 px-3 py-2'
              )}
            >
              <div
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-full',
                  isUser ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}
              >
                {isUser ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs text-muted-foreground">
                  {isUser ? '用户' : '助手'}
                </div>
                <div className="line-clamp-2 whitespace-pre-wrap break-words text-sm text-foreground">
                  {message.content || '(空消息)'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onUnpin(index)}
                className="shrink-0 rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                title="取消置顶"
              >
                <Pin className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
