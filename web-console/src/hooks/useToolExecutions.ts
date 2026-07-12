import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/config';

export interface ToolExecution {
  id: string;
  timestamp: string;
  userId: string;
  action: string;
  resourceId: string;
  provider?: string;
  result: string;
  params?: { sessionId?: string };
  durationMs?: number;
}

const apiBase = getApiBaseUrl();

export function useToolExecutions(toolName?: string, limit = 20) {
  const params = new URLSearchParams({ action: 'ai.tool_call', limit: String(limit) });
  if (toolName) params.set('resourceId', toolName);

  return useQuery({
    queryKey: ['tool-executions', toolName, limit],
    queryFn: async () => {
      const res = await fetch(`${apiBase}/audit/?${params}`);
      if (!res.ok) throw new Error(`Failed to fetch tool executions: ${res.status}`);
      return res.json() as Promise<ToolExecution[]>;
    },
  });
}
