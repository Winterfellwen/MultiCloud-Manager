// 执行审批 React Query hooks
// usePendingApprovals：轮询 exec.approval.list RPC 获取待审批列表
// useResolveApproval：调用 exec.approval.resolve RPC 提交审批结果
// Note: Mode logic is handled in ApprovalPrompt component, not here.
// This hook is mode-agnostic and provides the data layer for approvals.
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useChatStore } from '../stores/chat';

// ===== 审批状态管理 =====

/** 正在 resolve 中的 approvalId 集合（跨组件共享，防止轮询覆盖乐观更新） */
const resolvingApprovalIds = new Set<string>();

/** 标记审批为正在处理 */
export function markApprovalResolving(approvalId: string): void {
  resolvingApprovalIds.add(approvalId);
}

/** 清除审批的 resolving 标记 */
export function unmarkApprovalResolving(approvalId: string): void {
  resolvingApprovalIds.delete(approvalId);
}

/** 后端返回的审批请求结构（与 exec-approval.ts ApprovalRequest 对齐） */
export interface ApprovalRequest {
  approvalId: string;
  runId: string;
  sessionKey: string;
  toolCall: { name: string; arguments: Record<string, unknown> };
  toolName: string;
  dangerLevel: 'moderate' | 'dangerous';
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

/** 后端 exec.approval.list 返回结构 */
interface ApprovalListResponse {
  approvals: ApprovalRequest[];
}

export function usePendingApprovals() {
  const wsClient = useChatStore((s) => s.wsClient);
  const connectionStatus = useChatStore((s) => s.connectionStatus);

  return useQuery({
    queryKey: ['pending-approvals'],
    queryFn: async (): Promise<ApprovalRequest[]> => {
      if (!wsClient) throw new Error('WebSocket 未连接');
      const res = await wsClient.request<ApprovalListResponse>('exec.approval.list', {});
      // 只返回 pending 状态的审批，并过滤掉正在 resolve 中的（防止轮询覆盖乐观更新）
      return (res.approvals || [])
        .filter((a) => a.status === 'pending')
        .filter((a) => !resolvingApprovalIds.has(a.approvalId));
    },
    enabled: connectionStatus === 'connected' && !!wsClient,
    // 轮询间隔 3 秒，及时获取新审批请求
    refetchInterval: 3000,
  });
}

export function useResolveApproval() {
  const wsClient = useChatStore((s) => s.wsClient);
  const qc = useQueryClient();

  return useMutation({
    // 乐观更新：审批后立即从待审批列表中移除，UI 即时响应
    onMutate: async (params) => {
      // 标记为 resolving，防止后续轮询覆盖乐观更新
      markApprovalResolving(params.approvalId);
      // 取消所有正在进行的轮询
      await qc.cancelQueries({ queryKey: ['pending-approvals'] });
      const previousApprovals = qc.getQueryData<ApprovalRequest[]>(['pending-approvals']);
      if (previousApprovals) {
        qc.setQueryData(
          ['pending-approvals'],
          previousApprovals.filter((a) => a.approvalId !== params.approvalId),
        );
      }
      return { previousApprovals };
    },
    onError: (_err, params, context) => {
      // 请求失败时回滚并清除 resolving 标记
      unmarkApprovalResolving(params.approvalId);
      if (context?.previousApprovals) {
        qc.setQueryData(['pending-approvals'], context.previousApprovals);
      }
    },
    onSettled: (_data, _error, params) => {
      // 后端处理完成后清除 resolving 标记并重新获取
      unmarkApprovalResolving(params.approvalId);
      qc.invalidateQueries({ queryKey: ['pending-approvals'] });
    },
    mutationFn: async (params: { approvalId: string; decision: 'approve' | 'reject' }) => {
      if (!wsClient) throw new Error('WebSocket 未连接');
      return await wsClient.request('exec.approval.resolve', params);
    },
  });
}
