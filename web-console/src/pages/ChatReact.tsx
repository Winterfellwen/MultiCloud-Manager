// AI 对话页（React 版）：WebSocket 流式 + 断线恢复
// 组合 SessionList + MessageList + ChatInput，管理 WsClient 生命周期
import { useEffect } from 'react';
import { useChatStore } from '../stores/chat';
import { SessionList } from '../components/chat/SessionList';
import { MessageList } from '../components/chat/MessageList';
import { ChatInput } from '../components/chat/ChatInput';
import { cn } from '../lib/utils';
import type { WsConnectionStatus } from '../types/chat';

const STATUS_TEXT: Record<WsConnectionStatus, string> = {
  disconnected: '未连接',
  connecting: '连接中...',
  connected: '已连接',
  reconnecting: '重连中...',
  error: '连接错误',
};

const STATUS_COLOR: Record<WsConnectionStatus, string> = {
  disconnected: 'bg-muted-foreground',
  connecting: 'bg-yellow-500',
  connected: 'bg-green-500',
  reconnecting: 'bg-yellow-500',
  error: 'bg-red-500',
};

export default function ChatReact() {
  const connect = useChatStore((s) => s.connect);
  const disconnect = useChatStore((s) => s.disconnect);
  const connectionStatus = useChatStore((s) => s.connectionStatus);
  const currentSessionKey = useChatStore((s) => s.currentSessionKey);
  const messagesBySession = useChatStore((s) => s.messagesBySession);
  const createSession = useChatStore((s) => s.createSession);

  // 连接/断开 WebSocket
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  // 首次进入自动创建会话
  useEffect(() => {
    if (connectionStatus === 'connected' && !currentSessionKey) {
      createSession();
    }
  }, [connectionStatus, currentSessionKey, createSession]);

  const messages = currentSessionKey ? messagesBySession[currentSessionKey] || [] : [];

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* 会话列表 */}
      <div className="w-64 shrink-0">
        <SessionList />
      </div>

      {/* 对话区 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 顶栏：连接状态 */}
        <div className="flex items-center gap-2 border-b border-border px-4 py-2">
          <span className={cn('h-2 w-2 rounded-full', STATUS_COLOR[connectionStatus])} />
          <span className="text-xs text-muted-foreground">{STATUS_TEXT[connectionStatus]}</span>
        </div>

        {/* 消息列表 */}
        <div className="min-h-0 flex-1">
          {currentSessionKey ? (
            <MessageList messages={messages} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              选择或新建对话
            </div>
          )}
        </div>

        {/* 输入区 */}
        {currentSessionKey && <ChatInput />}
      </div>
    </div>
  );
}
