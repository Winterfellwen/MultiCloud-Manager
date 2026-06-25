// 消息列表：消息按顺序排列，自动滚动到底部
import { useEffect, useRef, useCallback } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { ChatMessage } from '../../types/chat';
import { MessageBubble } from './MessageBubble';
import { ScrollArea } from '../ui/scroll-area';

interface MessageListProps {
  messages: ChatMessage[];
}

function TruncatedWarning() {
  return (
    <div className="mx-4 mb-2 flex items-start gap-2 rounded-md border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-600 dark:bg-yellow-950 dark:text-yellow-200">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
      <span>AI 已达到最大思考轮次，当前回答可能不完整。建议缩小问题范围或分步骤提问。</span>
    </div>
  );
}

export function MessageList({ messages }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        开始新的对话
      </div>
    );
  }

  // 检查最后一条 assistant 消息是否 truncated
  const lastTruncated = [...messages].reverse().find(m => m.role === 'assistant' && m.truncated);

  return (
    <ScrollArea className="h-full overflow-y-auto">
      <div className="py-4">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} />
        ))}
        {lastTruncated && <TruncatedWarning />}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
