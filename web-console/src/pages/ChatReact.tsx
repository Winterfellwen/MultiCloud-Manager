// AI 对话页（React 版）：WebSocket 流式 + 断线恢复
// 组合 SessionList + MessageList + ChatInput，管理 WsClient 生命周期
// 集成 ApprovalPrompt 审批弹窗（监听 exec.approval.requested 事件，轮询获取待审批列表）
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useChatStore } from '../stores/chat';
import { useAuthStore } from '../stores/auth';
import { SessionList } from '../components/chat/SessionList';
import { MessageList } from '../components/chat/MessageList';
import { ChatInput } from '../components/chat/ChatInput';
import { ApprovalPrompt } from '../components/chat/ApprovalPrompt';
import { useIsMobile } from '../hooks/useMediaQuery';
import { Button } from '@/components/ui/button';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { WsConnectionStatus } from '../types/chat';

export default function ChatReact() {
  const { t } = useTranslation();
  const connect = useChatStore((s) => s.connect);
  const connectionStatus = useChatStore((s) => s.connectionStatus);
  const currentSessionKey = useChatStore((s) => s.currentSessionKey);
  const sessions = useChatStore((s) => s.sessions);
  const messagesBySession = useChatStore((s) => s.messagesBySession);
  const createSession = useChatStore((s) => s.createSession);
  const currentUser = useAuthStore((s) => s.user);

  const isMobile = useIsMobile();
  const [sessionListOpen, setSessionListOpen] = useState(false);

  const STATUS_TEXT: Record<WsConnectionStatus, string> = {
    disconnected: t('chat.wsDisconnected'),
    connecting: t('chat.wsConnecting'),
    connected: t('chat.wsConnected'),
    reconnecting: t('chat.wsReconnecting'),
    error: t('chat.wsError'),
  };

  const STATUS_COLOR: Record<WsConnectionStatus, string> = {
    disconnected: 'bg-muted-foreground',
    connecting: 'bg-yellow-500',
    connected: 'bg-green-500',
    reconnecting: 'bg-yellow-500',
    error: 'bg-red-500',
  };

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

  // 判断当前会话是否是自己的
  const currentSession = sessions.find(s => s.sessionKey === currentSessionKey);
  const isOwnSession = !currentSession || !currentSession.userId || currentSession.userId === currentUser?.id;
  const canChat = isOwnSession;

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
              title={t('chat.sessionList')}
            >
              <MessageSquare className="h-4 w-4" />
            </Button>
          )}
          <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_COLOR[connectionStatus])} />
          <span className="text-xs text-muted-foreground truncate">{STATUS_TEXT[connectionStatus]}</span>
          {!canChat && currentSessionKey && (
            <span className="text-xs text-muted-foreground ml-auto">{t('chat.readonly')}</span>
          )}
        </div>

        {/* 消息列表 */}
        <div className="min-h-0 flex-1 overflow-hidden">
          {currentSessionKey ? (
            <MessageList messages={messages} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {t('chat.selectSession')}
            </div>
          )}
        </div>

        {/* 输入区：只有自己的对话才显示 */}
        {currentSessionKey && canChat && <ChatInput />}
      </div>

      {/* 审批弹窗：有待审批请求时显示 */}
      <ApprovalPrompt />
    </div>
  );
}
