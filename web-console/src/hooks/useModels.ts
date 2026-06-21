// 模型列表 hook：通过 models.list RPC 获取可用模型目录
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useChatStore } from '@/stores/chat';
import type { ModelCatalogEntry } from '@/lib/openclaw/model-types';

export type { ModelCatalogEntry };

export function useModels() {
  const wsClient = useChatStore((s) => s.wsClient);
  const connected = useChatStore((s) => s.connectionStatus === 'connected');
  return useQuery({
    queryKey: ['models'],
    queryFn: async () => {
      if (!wsClient) return [];
      const res = await wsClient.request<{ models: ModelCatalogEntry[] }>('models.list', {});
      return res.models;
    },
    enabled: connected,
    staleTime: 60_000,
  });
}

export function useDeleteModel() {
  const queryClient = useQueryClient();
  const wsClient = useChatStore((s) => s.wsClient);
  return useMutation({
    mutationFn: async (params: { providerId: string; modelId: string }) => {
      if (!wsClient) throw new Error('WebSocket 未连接');
      return wsClient.request<{ ok: boolean }>('models.delete', params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['models'] });
      queryClient.invalidateQueries({ queryKey: ['llm-providers'] });
    },
  });
}

export function useTestModel() {
  const wsClient = useChatStore((s) => s.wsClient);
  return useMutation({
    mutationFn: async (params: { providerId: string; modelId: string }) => {
      if (!wsClient) throw new Error('WebSocket 未连接');
      return wsClient.request<{ ok: boolean; message?: string }>('models.test', params);
    },
  });
}
