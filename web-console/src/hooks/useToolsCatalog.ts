// 工具目录 React Query hook
// 通过 ws-client 调用 tools.catalog RPC 获取工具目录
import { useQuery } from '@tanstack/react-query';
import { useChatStore } from '../stores/chat';

export interface ToolCatalogEntry {
  id: string;
  label: string;
  description: string;
  risk?: 'low' | 'medium' | 'high';
}

export interface ToolCatalogGroup {
  id: string;
  label: string;
  tools: ToolCatalogEntry[];
}

export interface ToolCatalogResponse {
  groups: ToolCatalogGroup[];
}

export function useToolsCatalog() {
  const wsClient = useChatStore((s) => s.wsClient);
  const connectionStatus = useChatStore((s) => s.connectionStatus);

  return useQuery({
    queryKey: ['tools-catalog'],
    queryFn: async (): Promise<ToolCatalogResponse> => {
      if (!wsClient) throw new Error('WebSocket 未连接');
      return wsClient.request<ToolCatalogResponse>('tools.catalog', {});
    },
    enabled: connectionStatus === 'connected' && !!wsClient,
  });
}
