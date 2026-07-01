// web-console/src/hooks/useKnowledgeBase.ts
import { useQuery } from '@tanstack/react-query';
import { monitorApi } from '@/api/monitor';

export function useKnowledgeBase() {
  return useQuery({
    queryKey: ['knowledge-base'],
    queryFn: () => monitorApi.getKnowledgeBase(),
  });
}
