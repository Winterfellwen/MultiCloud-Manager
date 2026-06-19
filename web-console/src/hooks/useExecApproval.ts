// 执行审批 React Query hooks
// usePendingApprovals：轮询 exec.approval.list RPC 获取待审批列表
// useResolveApproval：调用 exec.approval.resolve RPC 提交审批结果
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useChatStore } from '../stores/chat';

export interface ApprovalRequest {
  runId: string;
  toolName: string;
  args: unknown;
  dangerLevel: 'moderate' | 'dangerous';
  timestamp: number;
}

export interface ApprovalListResponse {
  pending: ApprovalRequest[];
}

export function usePendingApprovals() {
  const wsClient = useChatStore((s) => s.wsClient);
  const connectionStatus = useChatStore((s) => s.connectionStatus);

  return useQuery({
    queryKey: ['pending-approvals'],
    queryFn: async (): Promise<ApprovalRequest[]> => {
      if (!wsClient) throw new Error('WebSocket 未连接');
      const res = await wsClient.request<ApprovalListResponse>('exec.approval.list', {});
      return res.pending || [];
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
    mutationFn: async (params: { runId: string; decision: 'allow' | 'deny' }) => {
      if (!wsClient) throw new Error('WebSocket 未连接');
      return wsClient.request('exec.approval.resolve', params);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-approvals'] });
    },
  });
}
