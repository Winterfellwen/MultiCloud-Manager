// 消息气泡：区分 user/assistant，assistant 消息渲染文本 + 工具卡片
// 支持置顶：置顶消息左侧黄色边框，hover 显示置顶/取消置顶按钮
import { useState } from 'react';
import { User, Bot, AlertCircle, Pin } from 'lucide-react';
import type { ChatMessage } from '../../types/chat';
import { ToolCallCard } from './ToolCallCard';
import { cn } from '../../lib/utils';

interface MessageBubbleProps {
  message: ChatMessage;
  isPinned?: boolean;
  onTogglePin?: () => void;
}

export function MessageBubble({ message, isPinned = false, onTogglePin }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isError = message.status === 'error';
  const isStreaming = message.status === 'streaming';
  // 工具卡片展开状态（按 toolCall id 跟踪）
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  const toggleTool = (id: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className={cn('group flex gap-3 px-4 py-3', isUser && 'flex-row-reverse')}>
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
              <ToolCallCard
                key={tc.id}
                toolCall={tc}
                isExpanded={expandedTools.has(tc.id)}
                onToggle={() => toggleTool(tc.id)}
              />
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
                : 'bg-muted text-foreground',
              // 置顶消息左侧黄色边框
              isPinned && 'border-l-2 border-yellow-500'
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

        {/* 置顶/取消置顶按钮（hover 显示） */}
        {onTogglePin && (
          <button
            type="button"
            onClick={onTogglePin}
            className={cn(
              'flex items-center gap-1 rounded px-1.5 py-0.5 text-xs text-muted-foreground',
              'opacity-0 transition-opacity hover:bg-accent hover:text-foreground',
              'group-hover:opacity-100',
              isPinned && 'text-yellow-600 opacity-100'
            )}
            title={isPinned ? '取消置顶' : '置顶'}
          >
            <Pin className="h-3 w-3" />
            <span>{isPinned ? '取消置顶' : '置顶'}</span>
          </button>
        )}
      </div>
    </div>
  );
}
