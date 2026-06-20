// 会话列表侧边栏：新建/切换/删除会话
// 显示会话状态标识：正在运行 / 运行结束 / 提问审批 / AI错误
import { useState, useMemo } from 'react';
import { Plus, MessageSquare, Trash2, Loader2, CheckCircle2, AlertCircle, ShieldQuestion } from 'lucide-react';
import { useChatStore } from '../../stores/chat';
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
): SessionStatus {
  // 优先检查是否有待审批
  if (pendingApprovalSessionKeys.size > 0) return 'approval';
  if (!messages || messages.length === 0) return 'idle';

  // 找最后一条 assistant 消息
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  if (!lastAssistant) return 'idle';

  if (lastAssistant.status === 'streaming') return 'running';
  if (lastAssistant.status === 'error') return 'error';
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
  const deleteSession = useChatStore((s) => s.deleteSession);

  // 获取待审批列表，按 sessionKey 分组
  const { data: approvals } = usePendingApprovals();
  const approvalSessionKeys = useMemo(() => {
    const set = new Set<string>();
    if (approvals) {
      for (const a of approvals) {
        set.add(a.sessionKey);
      }
    }
    return set;
  }, [approvals]);

  // 删除确认对话框状态
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteSession(deleteTarget);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  return (
    <div className="flex h-full flex-col border-r border-border bg-background">
      <div className="border-b border-border p-3">
        <Button onClick={createSession} className="w-full" size="sm">
          <Plus className="mr-1.5 h-4 w-4" />
          新建对话
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {sessions.length === 0 && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              暂无对话
            </div>
          )}
          {sessions.map((session) => {
            // 派生该会话的状态
            const sessionApprovalKeys = new Set(
              approvalSessionKeys.has(session.sessionKey) ? [session.sessionKey] : []
            );
            const status = deriveSessionStatus(
              messagesBySession[session.sessionKey],
              sessionApprovalKeys,
            );
            const statusConfig = STATUS_CONFIG[status];
            const StatusIcon = statusConfig.icon;

            return (
            <div
              key={session.sessionKey}
              className={cn(
                'group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted',
                currentSessionKey === session.sessionKey && 'bg-muted'
              )}
              onClick={() => {
                selectSession(session.sessionKey);
                onClose?.();
              }}
            >
              <StatusIcon
                className={cn(
                  'h-3.5 w-3.5 shrink-0',
                  statusConfig.className,
                  status === 'running' && 'animate-spin',
                )}
              />
              <span className="flex-1 truncate">{session.title}</span>
              {/* 状态文字标签（非 idle 时显示） */}
              {status !== 'idle' && (
                <span className={cn('shrink-0 text-xs', statusConfig.className)}>
                  {statusConfig.label}
                </span>
              )}
              <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100">
                {session.messageCount}
              </span>
              {/* 删除按钮：hover 时显示，点击时阻止冒泡 */}
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
            </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* 删除确认对话框 */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => !isDeleting && setDeleteTarget(null)}
        title="确认删除对话"
        description="删除后无法恢复，该对话的所有消息和历史记录将被永久清除。"
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => setDeleteTarget(null)}
            disabled={isDeleting}
          >
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirmDelete}
            disabled={isDeleting}
          >
            {isDeleting ? '删除中...' : '确认删除'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
