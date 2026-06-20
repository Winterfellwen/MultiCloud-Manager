import { api } from './client';
import type {
  CloudResource,
  ResourceTypeMeta,
  ResourceFilters,
  ResourceListResult,
  ResourceStats,
} from '@/types/resource';

/** 同步参数 */
export interface SyncParams {
  provider?: string;
  resourceType?: string;
}

export const resourceApi = {
  /** 获取所有资源类型元数据 */
  listTypes: () => api.get<ResourceTypeMeta[]>('/cloud/resources/types'),

  /** 获取资源列表（支持筛选与分页） */
  list: (filters: ResourceFilters = {}) => {
    const query = new URLSearchParams();
    if (filters.resourceType) query.set('resourceType', filters.resourceType);
    if (filters.provider) query.set('provider', filters.provider);
    if (filters.region) query.set('region', filters.region);
    if (filters.status) query.set('status', filters.status);
    if (filters.search) query.set('search', filters.search);
    if (filters.limit) query.set('limit', String(filters.limit));
    if (filters.offset !== undefined) query.set('offset', String(filters.offset));
    const qs = query.toString();
    return api.get<ResourceListResult>(`/cloud/resources${qs ? '?' + qs : ''}`);
  },

  /** 获取单个资源详情 */
  getById: (id: string) => api.get<CloudResource>(`/cloud/resources/${id}`),

  /** 删除资源 */
  delete: (id: string) => api.delete<{ ok: boolean }>(`/cloud/resources/${id}`),

  /** 获取资源统计汇总 */
  getStats: () => api.get<ResourceStats>('/cloud/resources/stats/summary'),

  /** 触发资源同步 */
  sync: (params?: SyncParams) => {
    const query = new URLSearchParams();
    if (params?.provider) query.set('provider', params.provider);
    if (params?.resourceType) query.set('resourceType', params.resourceType);
    const qs = query.toString();
    return api.post(`/cloud/resources/sync${qs ? '?' + qs : ''}`);
  },
};
