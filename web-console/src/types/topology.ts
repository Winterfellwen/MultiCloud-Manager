/** 拓扑视图类型定义 */

/** 拓扑节点 */
export interface TopologyNode {
  id: string;
  type: string;
  label: string;
  provider: string;
  region: string;
  status: string;
  category: string;
  icon: string;
  data: Record<string, unknown>;
  parentId?: string;
}

/** 拓扑边 */
export interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label?: string;
}

/** 拓扑数据 */
export interface TopologyData {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
}

/** 拓扑筛选参数 */
export interface TopologyFilters {
  provider?: string;
  region?: string;
  resourceType?: string;
  status?: string;
  cloudAccountId?: string;
}

/** 拓扑视图类型 */
export type TopologyView = 'network' | 'storage';

/** 资源分类 */
export type TopologyCategory =
  | 'compute'
  | 'storage'
  | 'database'
  | 'network'
  | 'security'
  | 'cdn'
  | 'container'
  | 'ai';

/** 分类中文标签 */
export const TOPOLOGY_CATEGORY_LABELS: Record<TopologyCategory, string> = {
  compute: '计算',
  storage: '存储',
  database: '数据库',
  network: '网络',
  security: '安全',
  cdn: 'CDN',
  container: '容器',
  ai: 'AI 服务',
};

/** 资源类型到路由的映射 */
export const RESOURCE_TYPE_ROUTE_MAP: Record<string, string> = {
  instance: '/instances',
  disk: '/resources',
  database: '/resources',
  cache: '/resources',
  bucket: '/resources',
  loadbalancer: '/resources',
  vpc: '/resources',
  securitygroup: '/resources',
  cdn: '/resources',
  cluster: '/resources',
  aiservice: '/resources',
};

/** 视角配置 */
export const VIEW_CONFIG: Record<TopologyView, {
  label: string;
  categories: TopologyCategory[];
}> = {
  network: {
    label: '网络',
    categories: ['network', 'compute', 'security', 'container'],
  },
  storage: {
    label: '存储',
    categories: ['compute', 'storage', 'database'],
  },
};

/** 分组模式 */
export type GroupMode = 'hierarchy' | 'resourceType' | 'provider' | 'team' | 'cost';

/** 分组模式标签 */
export const GROUP_MODE_LABELS: Record<GroupMode, string> = {
  hierarchy: '按结构',
  resourceType: '按类型',
  provider: '按厂商',
  team: '按团队',
  cost: '按费用',
};

/** 聚簇节点数据 */
export interface ClusterData {
  id: string;
  label: string;
  groupMode: GroupMode;
  childNodeIds: string[];
  collapsed: boolean;
  statusSummary: Record<string, number>;
  category: TopologyCategory;
  icon: string;
}

/** 节点颜色配置（按分类） */
export const NODE_COLORS: Record<TopologyCategory, string> = {
  compute: '#3b82f6',      // 蓝色
  storage: '#10b981',      // 绿色
  database: '#8b5cf6',     // 紫色
  network: '#f59e0b',      // 黄色
  security: '#ef4444',     // 红色
  cdn: '#06b6d4',          // 青色
  container: '#ec4899',    // 粉色
  ai: '#6366f1',           // 靛蓝色
};