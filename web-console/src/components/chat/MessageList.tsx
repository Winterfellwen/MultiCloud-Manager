// 消息列表：置顶消息显示在顶部，其余消息正常排列，自动滚动到底部
import { useEffect, useRef, useMemo, useState } from 'react';
import type { ChatMessage } from '../../types/chat';
import { MessageBubble } from './MessageBubble';
import { PinnedMessages } from './PinnedMessages';
import { PinnedMessages as PinnedMessagesStore } from '../../lib/openclaw/pinned-messages';
import { ScrollArea } from '../ui/scroll-area';

interface MessageListProps {
  messages: ChatMessage[];
  sessionKey: string;
}

export function MessageList({ messages, sessionKey }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  // 置顶消息管理器（按 sessionKey 隔离）
  const pinnedStore = useMemo(() => new PinnedMessagesStore(sessionKey), [sessionKey]);
  // 置顶状态版本号，用于触发重渲染
  const [, setPinnedVersion] = useState(0);

  const forceUpdate = () => setPinnedVersion((v) => v + 1);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // 切换会话时重置置顶状态
  useEffect(() => {
    forceUpdate();
  }, [sessionKey]);

  if (messages.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        开始新的对话
      </div>
    );
  }

  // 分离置顶和非置顶消息
  const pinnedItems: Array<{ message: ChatMessage; index: number }> = [];
  const unpinnedMessages: Array<{ message: ChatMessage; index: number }> = [];

  messages.forEach((msg, index) => {
    if (pinnedStore.has(index)) {
      pinnedItems.push({ message: msg, index });
    } else {
      unpinnedMessages.push({ message: msg, index });
    }
  });

  const handleTogglePin = (index: number) => {
    pinnedStore.toggle(index);
    forceUpdate();
  };

  const handleUnpin = (index: number) => {
    pinnedStore.unpin(index);
    forceUpdate();
  };

  return (
    <ScrollArea className="h-full">
      <div className="py-4">
        {/* 置顶消息区 */}
        <PinnedMessages items={pinnedItems} onUnpin={handleUnpin} />

        {/* 普通消息列表 */}
        {unpinnedMessages.map(({ message, index }) => (
          <MessageBubble
            key={message.id}
            message={message}
            onTogglePin={() => handleTogglePin(index)}
          />
        ))}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
