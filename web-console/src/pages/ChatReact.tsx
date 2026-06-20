// AI 对话页（React 版）：WebSocket 流式 + 断线恢复
// 组合 SessionList + MessageList + ChatInput，管理 WsClient 生命周期
// 集成 ApprovalPrompt 审批弹窗（监听 exec.approval.requested 事件，轮询获取待审批列表）
import { useEffect, useState } from 'react';
import { useChatStore } from '../stores/chat';
import { SessionList } from '../components/chat/SessionList';
import { MessageList } from '../components/chat/MessageList';
import { ChatInput } from '../components/chat/ChatInput';
import { ApprovalPrompt } from '../components/chat/ApprovalPrompt';
import { useIsMobile } from '../hooks/useMediaQuery';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  const connectionStatus = useChatStore((s) => s.connectionStatus);
  const currentSessionKey = useChatStore((s) => s.currentSessionKey);
  const messagesBySession = useChatStore((s) => s.messagesBySession);
  const createSession = useChatStore((s) => s.createSession);

  const isMobile = useIsMobile();
  const [sessionListOpen, setSessionListOpen] = useState(false);

  // 确保 WebSocket 已连接（Layout 已全局初始化，这里做幂等保障）
  useEffect(() => {
    connect();
  }, [connect]);

  // 首次进入自动创建会话
  useEffect(() => {
    if (connectionStatus === 'connected' && !currentSessionKey) {
      createSession();
    }
  }, [connectionStatus, currentSessionKey, createSession]);

  const messages = currentSessionKey ? messagesBySession[currentSessionKey] || [] : [];

  return (
    <div className="flex h-full overflow-hidden">
      {/* 桌面端：固定会话列表 */}
      {!isMobile && (
        <div className="w-64 shrink-0">
          <SessionList />
        </div>
      )}

      {/* 移动端：抽屉式会话列表 */}
      {isMobile && sessionListOpen && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            onClick={() => setSessionListOpen(false)}
          />
          <div className="fixed inset-y-0 left-0 z-50 w-72 max-w-[80vw] animate-in slide-in-from-left duration-200">
            <SessionList onClose={() => setSessionListOpen(false)} />
          </div>
        </>
      )}

      {/* 对话区 */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* 顶栏：连接状态 + 移动端会话列表按钮 */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 md:px-4">
          {isMobile && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={() => setSessionListOpen(true)}
              title="会话列表"
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
          )}
          <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_COLOR[connectionStatus])} />
          <span className="text-xs text-muted-foreground truncate">{STATUS_TEXT[connectionStatus]}</span>
        </div>

        {/* 消息列表 */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {currentSessionKey ? (
            <MessageList messages={messages} sessionKey={currentSessionKey} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              选择或新建对话
            </div>
          )}
        </div>

        {/* 输入区 */}
        {currentSessionKey && <ChatInput />}
      </div>

      {/* 审批弹窗：有待审批请求时显示 */}
      <ApprovalPrompt />
    </div>
  );
}
