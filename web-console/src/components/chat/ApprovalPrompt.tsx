// 审批弹窗组件：当有待审批请求时显示弹窗，展示工具名、参数、风险级别
// 提供"允许"和"拒绝"按钮，支持倒计时自动拒绝
// 根据当前模式（Plan/Action/Confirm）自动处理或要求手动审批
import { useState, useEffect, useCallback, useRef } from 'react';
import { AlertTriangle, Check, X, Clock, Loader2 } from 'lucide-react';
import { usePendingApprovals, useResolveApproval } from '@/hooks/useExecApproval';
import type { ApprovalRequest } from '@/hooks/useExecApproval';
import { Dialog } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

import { ModeSelector } from './ModeSelector';
import { useChatStore } from '@/stores/chat';

const READ_ONLY_PATTERNS = ['list', 'get', 'search', 'find', 'query', 'read', 'analyze'];

function isReadOnlyTool(toolName: string): boolean {
  const lowerName = toolName.toLowerCase();
  return READ_ONLY_PATTERNS.some(pattern => lowerName.includes(pattern));
}

// 倒计时秒数（超时自动拒绝）
const COUNTDOWN_SECONDS = 60;

const DANGER_CONFIG: Record<
  ApprovalRequest['dangerLevel'],
  { label: string; variant: 'warning' | 'destructive' }
> = {
  moderate: { label: '中等风险', variant: 'warning' },
  dangerous: { label: '高风险', variant: 'destructive' },
};

export function ApprovalPrompt() {
  const { data: approvals } = usePendingApprovals();
  const resolveApproval = useResolveApproval();

  // 当前展示的审批请求（取第一个待审批）
  const [currentApproval, setCurrentApproval] = useState<ApprovalRequest | null>(null);
  const [countdown, setCountdown] = useState(COUNTDOWN_SECONDS);
  // 防止同一审批被重复处理（倒计时超时与用户点击竞态）
  const resolvedRef = useRef<Set<string>>(new Set());
  const mode = useChatStore((s) => s.mode);

  // 根据模式自动处理审批
  useEffect(() => {
    if (!approvals) return;
    for (const approval of approvals) {
      if (resolvedRef.current.has(approval.approvalId)) continue;

      if (mode === 'action') {
        resolvedRef.current.add(approval.approvalId);
        resolveApproval.mutate({ approvalId: approval.approvalId, decision: 'approve' });
      } else if (mode === 'plan') {
        if (isReadOnlyTool(approval.toolName)) {
          resolvedRef.current.add(approval.approvalId);
          resolveApproval.mutate({ approvalId: approval.approvalId, decision: 'approve' });
        }
      }
    }
  }, [approvals, mode, resolveApproval]);

  // 当有待审批请求且当前没有展示时，设置当前审批
  useEffect(() => {
    if (approvals && approvals.length > 0 && !currentApproval) {
      // approvals 已经过滤掉 resolving 中的，直接取第一个
      const next = approvals[0];
      if (next) {
        setCurrentApproval(next);
        setCountdown(COUNTDOWN_SECONDS);
      }
    }
    // 当前审批已被解决（不在列表中），清除
    if (currentApproval && approvals && !approvals.some((a) => a.approvalId === currentApproval.approvalId)) {
      resolvedRef.current.delete(currentApproval.approvalId);
      setCurrentApproval(null);
    }
  }, [approvals, currentApproval]);

  // 倒计时
  useEffect(() => {
    if (!currentApproval) return;
    if (countdown <= 0) {
      handleResolve('reject');
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentApproval, countdown]);

  const handleResolve = useCallback(
    (decision: 'approve' | 'reject') => {
      if (!currentApproval) return;
      const approvalId = currentApproval.approvalId;
      if (resolvedRef.current.has(approvalId)) return;
      resolvedRef.current.add(approvalId);
      setCurrentApproval(null);
      resolveApproval.mutate({ approvalId, decision });
    },
    [currentApproval, resolveApproval]
  );

  if (!currentApproval) return null;

  const dangerConfig = DANGER_CONFIG[currentApproval.dangerLevel] || DANGER_CONFIG.moderate;

  // 格式化参数为 JSON 字符串（从 toolCall.arguments 提取）
  const argsJson = (() => {
    try {
      const args = currentApproval.toolCall?.arguments;
      return typeof args === 'string'
        ? args
        : JSON.stringify(args ?? {}, null, 2);
    } catch {
      return String(currentApproval.toolCall?.arguments ?? '');
    }
  })();

  return (
    <>
      <div className="fixed bottom-4 right-4 z-40">
        <ModeSelector />
      </div>

      <Dialog
        open={!!currentApproval}
        onClose={() => handleResolve('reject')}
        title="工具执行审批"
        description="以下工具调用需要您的确认"
      >
        <div className="space-y-4">
          {/* 风险级别标识 */}
          <div className="flex items-center gap-2">
            <AlertTriangle className={`h-5 w-5 ${currentApproval.dangerLevel === 'dangerous' ? 'text-red-500' : 'text-yellow-500'}`} />
            <Badge variant={dangerConfig.variant}>{dangerConfig.label}</Badge>
          </div>

          {/* 工具信息 */}
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">工具名称</div>
            <div className="font-mono text-sm font-medium rounded-md bg-muted px-3 py-2">
              {currentApproval.toolName}
            </div>
          </div>

          {/* 参数展示 */}
          <div className="space-y-2">
            <div className="text-xs text-muted-foreground">调用参数</div>
            <pre className="max-h-48 overflow-auto rounded-md bg-muted p-3 font-mono text-xs">
              {argsJson}
            </pre>
          </div>

          {/* 倒计时 */}
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>
              {countdown > 0
                ? `${countdown} 秒后自动拒绝`
                : '正在自动拒绝...'}
            </span>
          </div>

          {/* 操作按钮 */}
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => handleResolve('reject')}
              disabled={resolveApproval.isPending}
            >
              <X className="mr-1.5 h-4 w-4" />
              拒绝
            </Button>
            <Button
              onClick={() => handleResolve('approve')}
              disabled={resolveApproval.isPending}
            >
              {resolveApproval.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <Check className="mr-1.5 h-4 w-4" />
              )}
              允许
            </Button>
          </div>
        </div>
      </Dialog>
    </>
  );
}
