// 模型列表 hook：通过 models.list RPC 获取可用模型目录
import { useQuery } from '@tanstack/react-query';
import { useChatStore } from '@/stores/chat';
import type { ModelCatalogEntry } from '@/lib/openclaw/model-types';

export type { ModelCatalogEntry };

export function useModels() {
  const wsClient = useChatStore((s) => s.wsClient);
  return useQuery({
    queryKey: ['models'],
    queryFn: async () => {
      if (!wsClient) return [];
      const res = await wsClient.request<{ models: ModelCatalogEntry[] }>('models.list', {});
      return res.models;
    },
    enabled: !!wsClient,
    staleTime: 60_000,
  });
}
