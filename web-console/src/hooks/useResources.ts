import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { resourceApi, type SyncParams } from '@/api/resource';
import type { ResourceFilters } from '@/types/resource';

/** 获取资源类型元数据 */
export function useResourceTypes() {
  return useQuery({
    queryKey: ['resource-types'],
    queryFn: () => resourceApi.listTypes(),
  });
}

/** 获取资源列表 */
export function useResources(filters: ResourceFilters) {
  return useQuery({
    queryKey: ['resources', filters],
    queryFn: () => resourceApi.list(filters),
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
  return useQuery({
    queryKey: ['resource-stats'],
    queryFn: () => resourceApi.getStats(),
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
