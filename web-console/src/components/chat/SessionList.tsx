// 会话列表侧边栏：新建/切换/删除会话
// 显示会话状态标识：正在运行 / 运行结束 / 提问审批 / AI错误
// 编辑模式：批量选择和删除会话
import { useState, useMemo, useCallback } from 'react';
import { Plus, MessageSquare, Trash2, Loader2, CheckCircle2, AlertCircle, ShieldQuestion, Square, SquareCheck } from 'lucide-react';
import { useChatStore } from '../../stores/chat';
import { useAuthStore } from '../../stores/auth';
import { usePendingApprovals } from '../../hooks/useExecApproval';
import { cn } from '../../lib/utils';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import type { ChatMessage } from '../../types/chat';

type SessionStatus = 'running' | 'completed' | 'error' | 'approval' | 'idle';

/** 从消息列表和审批列表派生会话状态 */
function deriveSessionStatus(
  messages: ChatMessage[] | undefined,
  pendingApprovalSessionKeys: Set<string>,
  seenSessions: Set<string>,
  sessionKey: string,
): SessionStatus {
  if (pendingApprovalSessionKeys.size > 0) return 'approval';
  if (!messages || messages.length === 0) return 'idle';

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  if (!lastAssistant) return 'idle';

  if (lastAssistant.status === 'streaming') return 'running';
  if (lastAssistant.status === 'error') return 'error';
  
  if (seenSessions.has(sessionKey)) return 'idle';
  
  return 'completed';
}

const STATUS_CONFIG: Record<SessionStatus, { icon: typeof Loader2; className: string; label: string }> = {
  running: { icon: Loader2, className: 'text-blue-500', label: '运行中' },
  completed: { icon: CheckCircle2, className: 'text-green-500', label: '已完成' },
  error: { icon: AlertCircle, className: 'text-red-500', label: '错误' },
  approval: { icon: ShieldQuestion, className: 'text-yellow-500', label: '待审批' },
  idle: { icon: MessageSquare, className: 'text-muted-foreground', label: '' },
};

export function SessionList({ onClose }: { onClose?: () => void }) {
  const sessions = useChatStore((s) => s.sessions);
  const currentSessionKey = useChatStore((s) => s.currentSessionKey);
  const messagesBySession = useChatStore((s) => s.messagesBySession);
  const createSession = useChatStore((s) => s.createSession);
  const selectSession = useChatStore((s) => s.selectSession);
  const deleteSessions = useChatStore((s) => s.deleteSessions);
  const seenSessions = useChatStore((s) => s.seenSessions);
  const currentUser = useAuthStore((s) => s.user);

  const [isEditing, setIsEditing] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: approvals } = usePendingApprovals();
  const approvalSessionKeys = useMemo(() => {
    const set = new Set<string>();
    if (approvals) {
      for (const a of approvals) set.add(a.sessionKey);
    }
    return set;
  }, [approvals]);

  const toggleSelect = useCallback((key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedKeys(prev => {
      if (prev.size === sessions.length) return new Set();
      return new Set(sessions.map(s => s.sessionKey));
    });
  }, [sessions]);

  const handleBatchDelete = async () => {
    if (selectedKeys.size === 0) return;
    setIsDeleting(true);
    try {
      await deleteSessions(Array.from(selectedKeys));
      setSelectedKeys(new Set());
      setIsEditing(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteSessions([deleteTarget]);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const allSelected = sessions.length > 0 && selectedKeys.size === sessions.length;

  return (
    <div className="flex h-full flex-col border-r border-border bg-background">
      {/* 顶部工具栏 */}
      <div className="border-b border-border p-3">
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => { setIsEditing(false); setSelectedKeys(new Set()); }}>
                完成
              </Button>
              <div className="flex items-center gap-1.5 flex-1">
                <button
                  type="button"
                  onClick={toggleSelectAll}
                  className="shrink-0"
                >
                  {allSelected ? (
                    <SquareCheck className="h-4 w-4 text-primary" />
                  ) : (
                    <Square className="h-4 w-4 text-muted-foreground" />
                  )}
                </button>
                <span className="text-xs text-muted-foreground">
                  已选 {selectedKeys.size}/{sessions.length}
                </span>
              </div>
              <Button
                variant="destructive"
                size="sm"
                disabled={selectedKeys.size === 0 || isDeleting}
                onClick={handleBatchDelete}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                {isDeleting ? '删除中...' : '删除'}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={createSession} className="flex-1" size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                新建对话
              </Button>
              {currentUser?.role === 'admin' && sessions.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  编辑
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {sessions.length === 0 && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              暂无对话
            </div>
          )}
          {sessions.map((session) => {
            const sessionApprovalKeys = new Set(
              approvalSessionKeys.has(session.sessionKey) ? [session.sessionKey] : []
            );
            const status = deriveSessionStatus(
              messagesBySession[session.sessionKey],
              sessionApprovalKeys,
              seenSessions,
              session.sessionKey,
            );
            const statusConfig = STATUS_CONFIG[status];
            const StatusIcon = statusConfig.icon;
            const isSelected = selectedKeys.has(session.sessionKey);

            return (
              <div
                key={session.sessionKey}
                className={cn(
                  'group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted',
                  currentSessionKey === session.sessionKey && 'bg-muted'
                )}
                onClick={() => {
                  if (isEditing) {
                    toggleSelect(session.sessionKey);
                  } else {
                    selectSession(session.sessionKey);
                    onClose?.();
                  }
                }}
              >
                {isEditing && (
                  <div className="shrink-0">
                    {isSelected ? (
                      <SquareCheck className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                )}

                <StatusIcon
                  className={cn(
                    'h-3.5 w-3.5 shrink-0',
                    statusConfig.className,
                    status === 'running' && 'animate-spin',
                  )}
                />
                <div className="flex-1 min-w-0">
                  <span className="block truncate">{session.title}</span>
                  {session.username && (
                    <span className="text-xs text-muted-foreground">
                      <span className="text-blue-400">{session.username}</span>
                      {' · '}{session.messageCount}条消息
                    </span>
                  )}
                </div>
                {status !== 'idle' && (
                  <span className={cn('shrink-0 text-xs', statusConfig.className)}>
                    {statusConfig.label}
                  </span>
                )}
                {!isEditing && (
                  <button
                    type="button"
                    className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(session.sessionKey);
                    }}
                    title="删除对话"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* 删除确认对话框（单个删除） */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => !isDeleting && setDeleteTarget(null)}
        title="确认删除对话"
        description="删除后无法恢复，该对话的所有消息和历史记录将被永久清除。"
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
            取消
          </Button>
          <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
            {isDeleting ? '删除中...' : '确认删除'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
