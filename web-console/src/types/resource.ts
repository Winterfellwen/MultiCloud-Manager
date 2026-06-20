/** 多资源类型管理 - 类型定义 */

/** 云资源类型 */
export type ResourceType =
  | 'instance'
  | 'disk'
  | 'database'
  | 'cache'
  | 'bucket'
  | 'loadbalancer'
  | 'vpc'
  | 'cluster'
  | 'securitygroup'
  | 'cdn'
  | 'aiservice';

/** 资源分类 */
export type ResourceCategory =
  | 'compute'
  | 'storage'
  | 'database'
  | 'network'
  | 'security'
  | 'cdn'
  | 'container'
  | 'ai';

/** 云资源行（通用结构，类型相关字段放在 attributes 中） */
export interface CloudResource {
  id: string;
  resourceType: ResourceType;
  provider: string;
  region: string;
  name: string;
  status: string;
  /** 类型相关属性，如 spec/ip/capacity/engine/cidr 等 */
  attributes: Record<string, unknown>;
  tags: Record<string, string> | null;
  createdAt: string | null;
  lastSyncedAt: string | null;
}

/** 资源类型元数据（由 /cloud/resources/types 返回） */
export interface ResourceTypeMeta {
  type: ResourceType;
  displayName: string;
  iconName: string;
  category: ResourceCategory;
  supportedProviders: string[];
}

/** 资源列表筛选参数 */
export interface ResourceFilters {
  resourceType?: ResourceType;
  provider?: string;
  region?: string;
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

/** 资源列表分页结果 */
export interface ResourceListResult {
  items: CloudResource[];
  total: number;
}

/** 资源统计汇总 */
export interface ResourceStats {
  byType: Array<{ resourceType: string; provider: string; count: number }>;
  byStatus: Array<{ status: string; count: number }>;
}

/** 资源分类中文标签 */
export const RESOURCE_CATEGORY_LABELS: Record<ResourceCategory, string> = {
  compute: '计算',
  storage: '存储',
  database: '数据库',
  network: '网络',
  security: '安全',
  cdn: 'CDN',
  container: '容器',
  ai: 'AI 服务',
};

/** 资源分类展示顺序 */
export const RESOURCE_CATEGORY_ORDER: ResourceCategory[] = [
  'compute',
  'storage',
  'database',
  'network',
  'security',
  'cdn',
  'container',
  'ai',
];

/** Badge 可用颜色变体 */
export type StatusColor =
  | 'success'
  | 'secondary'
  | 'destructive'
  | 'warning'
  | 'outline'
  | 'default';

/**
 * 根据资源状态字符串映射 Badge 颜色变体。
 * 与 components/ui/badge 的 variant 保持一致。
 */
export function getStatusColor(status: string): StatusColor {
  const s = status.toLowerCase();
  if (
    ['running', 'active', 'available', 'in-use', 'ok', 'normal', 'healthy'].includes(s)
  ) {
    return 'success';
  }
  if (
    ['pending', 'creating', 'starting', 'stopping', 'updating', 'syncing', 'provisioning'].includes(
      s
    )
  ) {
    return 'warning';
  }
  if (
    ['error', 'failed', 'terminated', 'deleted', 'deleting', 'unavailable', 'abnormal'].includes(s)
  ) {
    return 'destructive';
  }
  if (['stopped', 'inactive'].includes(s)) {
    return 'secondary';
  }
  return 'outline';
}
