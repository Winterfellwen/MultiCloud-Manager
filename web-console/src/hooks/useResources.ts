import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { resourceApi, type SyncParams } from '@/api/resource';
import { useDemoStore } from '@/stores/demo';
import { demoListResources } from '@/lib/demo/demo-api';
import type { ResourceFilters } from '@/types/resource';

/** 获取资源类型元数据 */
export function useResourceTypes() {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  return useQuery({
    queryKey: ['resource-types', isDemoMode],
    queryFn: () => isDemoMode ? Promise.resolve([]) : resourceApi.listTypes(),
  });
}

/** 获取资源列表 */
export function useResources(filters: ResourceFilters) {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  return useQuery({
    queryKey: ['resources', filters, isDemoMode],
    queryFn: () => isDemoMode
      ? demoListResources(filters as any).then(items => ({ items, total: items.length }))
      : resourceApi.list(filters),
    gcTime: 5 * 60_000,
  });
}

/** 获取单个资源 */
export function useResource(id: string | undefined) {
  return useQuery({
    queryKey: ['resource', id],
    queryFn: () => resourceApi.getById(id!),
    enabled: !!id,
  });
}

/** 获取资源统计汇总 */
export function useResourceStats() {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);
  return useQuery({
    queryKey: ['resource-stats', isDemoMode],
    queryFn: () => isDemoMode
      ? Promise.resolve({ byType: [], byStatus: [] })
      : resourceApi.getStats(),
  });
}

/** 删除资源 */
export function useDeleteResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => resourceApi.delete(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resources'] });
      qc.invalidateQueries({ queryKey: ['resource-stats'] });
    },
  });
}

/** 同步资源 */
export function useSyncResources() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params?: SyncParams) => resourceApi.sync(params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resources'] });
      qc.invalidateQueries({ queryKey: ['resource-stats'] });
    },
  });
}
