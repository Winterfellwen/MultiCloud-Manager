import { useQuery } from '@tanstack/react-query';
import { getApiBaseUrl } from '@/lib/config';
import { useAuthStore } from '@/stores/auth';

export interface ToolExecution {
  id: string;
  timestamp: string;
  userId: string;
  action: string;
  resourceId: string;
  resourceType: string | null;
  provider: string | null;
  region: string | null;
  params: Record<string, unknown> | null;
  result: string;
  ip: string | null;
  traceId: string | null;
  durationMs: number | null;
  sessionId: string | null;
}

const apiBase = getApiBaseUrl();

export function useToolExecutions(toolName?: string, limit = 20) {
  const params = new URLSearchParams({ action: 'ai.tool_call', limit: String(limit) });
  if (toolName) params.set('resourceId', toolName);

  return useQuery({
    queryKey: ['tool-executions', toolName, limit],
    queryFn: async () => {
      const token = useAuthStore.getState().accessToken;
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      params.set('_t', String(Date.now()));
      const res = await fetch(`${apiBase}/audit/?${params}`, { headers });
      if (!res.ok) throw new Error(`Failed to fetch tool executions: ${res.status}`);
      return (await res.json()) as ToolExecution[];
    },
  });
}
