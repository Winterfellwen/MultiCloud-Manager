# 拓扑视图实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 CloudOps AI 多云管理平台添加拓扑视图功能，支持网络和存储两种视角，可拖拽、缩放、点击查看详情，多维筛选。

**Architecture:** 使用 @xyflow/react (React Flow) 作为可视化库，dagre 实现自动布局。后端增强 Provider 同步以捕获资源关系，前端实现拓扑页面组件。支持 Demo 模式。

**Tech Stack:** @xyflow/react, dagre, @tanstack/react-query, drizzle-orm, TypeScript, React, i18next

---

## 文件结构

### 后端 (cloud-service)
```
cloud-service/src/
├── providers/types.ts              # 修改：添加拓扑关系字段
├── services/resource.service.ts    # 修改：添加拓扑数据查询方法
├── routes/topology.ts              # 新增：拓扑 API 路由
└── index.ts                        # 修改：注册拓扑路由
```

### 前端 (web-console)
```
web-console/src/
├── types/topology.ts               # 新增：拓扑类型定义
├── hooks/useTopology.ts            # 新增：拓扑数据 hook
├── lib/demo/mock-data.ts           # 修改：添加拓扑模拟数据
├── lib/demo/demo-api.ts            # 修改：添加 demo 拓扑 API
├── pages/Topology.tsx              # 新增：拓扑页面
├── components/topology/
│   ├── TopologyCanvas.tsx          # 新增：React Flow 画布
│   ├── ResourceNode.tsx            # 新增：自定义资源节点
│   ├── ResourceEdge.tsx            # 新增：自定义边
│   ├── TopologyFilter.tsx          # 新增：筛选面板
│   ├── ViewSwitcher.tsx            # 新增：视角切换
│   └── NodeDetailPanel.tsx         # 新增：节点详情面板
├── components/Sidebar.tsx          # 修改：添加拓扑导航项
├── i18n/locales/zh.json            # 修改：添加拓扑 i18n
├── i18n/locales/en.json            # 修改：添加拓扑 i18n
└── App.tsx                         # 修改：添加拓扑路由
```

---

## Task 1: 后端 - 添加拓扑关系字段到类型定义

**Files:**
- Modify: `cloud-service/src/providers/types.ts:135-148`

- [ ] **Step 1: 在 CloudResource 接口中添加拓扑关系字段**

在 `cloud-service/src/providers/types.ts` 文件中，找到 `CloudResource` 接口（约第 135-148 行），添加拓扑关系字段：

```typescript
export interface CloudResource {
  id: string;
  provider: string;
  resourceType: ResourceType;
  providerResourceId: string;
  name: string;
  region: string;
  status: string;
  createdAt: Date;
  tags: Record<string, string>;
  attributes: Record<string, unknown>;
  cloudAccountId?: string;
  /** 拓扑关系字段 */
  topology?: {
    vpcId?: string;
    subnetId?: string;
    securityGroupIds?: string[];
    targetInstanceIds?: string[];
    parentClusterId?: string;
  };
}
```

- [ ] **Step 2: 更新 TypedResource 联合类型**

在 `cloud-service/src/providers/types.ts` 文件中，确保 TypedResource 联合类型包含所有类型（约第 280 行）：

```typescript
export type TypedResource = Disk | Bucket | DatabaseInstance | CacheInstance |
  LoadBalancer | Vpc | SecurityGroup | CdnDistribution | Cluster | AiService;
```

- [ ] **Step 3: 运行 TypeScript 检查**

Run: `cd cloud-service && pnpm typecheck`
Expected: PASS（无类型错误）

- [ ] **Step 4: 提交更改**

```bash
git add cloud-service/src/providers/types.ts
git commit -m "feat(backend): add topology relationship fields to CloudResource type"
```

---

## Task 2: 后端 - 添加拓扑数据查询方法

**Files:**
- Modify: `cloud-service/src/services/resource.service.ts:1-133`

- [ ] **Step 1: 在 ResourceService 类中添加 getTopology 方法**

在 `cloud-service/src/services/resource.service.ts` 文件中，在 `statsByStatus` 方法之后（约第 130 行），添加拓扑数据查询方法：

```typescript
  /** 获取拓扑数据 */
  async getTopology(filters: {
    provider?: string;
    region?: string;
    resourceType?: ResourceType;
    status?: string;
    cloudAccountId?: string;
  }): Promise<{
    nodes: Array<{
      id: string;
      type: string;
      label: string;
      provider: string;
      region: string;
      status: string;
      category: string;
      icon: string;
      data: Record<string, unknown>;
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
      type: string;
      label?: string;
    }>;
  }> {
    const resources = await this.list({
      ...filters,
      limit: 1000,
    });

    const nodes: Array<{
      id: string;
      type: string;
      label: string;
      provider: string;
      region: string;
      status: string;
      category: string;
      icon: string;
      data: Record<string, unknown>;
    }> = [];

    const edges: Array<{
      id: string;
      source: string;
      target: string;
      type: string;
      label?: string;
    }> = [];

    // 资源类型到分类和图标的映射
    const typeMeta: Record<string, { category: string; icon: string }> = {
      instance: { category: 'compute', icon: 'server' },
      disk: { category: 'storage', icon: 'hard-drive' },
      bucket: { category: 'storage', icon: 'database' },
      database: { category: 'database', icon: 'database' },
      cache: { category: 'database', icon: 'zap' },
      loadbalancer: { category: 'network', icon: 'share-2' },
      vpc: { category: 'network', icon: 'git-branch' },
      securitygroup: { category: 'security', icon: 'shield' },
      cdn: { category: 'cdn', icon: 'globe' },
      cluster: { category: 'container', icon: 'boxes' },
      aiservice: { category: 'ai', icon: 'cpu' },
    };

    // 创建节点
    for (const resource of resources.items) {
      const meta = typeMeta[resource.resourceType] || { category: 'unknown', icon: 'circle' };
      nodes.push({
        id: resource.id,
        type: resource.resourceType,
        label: resource.name || resource.providerResourceId,
        provider: resource.provider,
        region: resource.region,
        status: resource.status,
        category: meta.category,
        icon: meta.icon,
        data: resource.attributes || {},
      });
    }

    // 创建边（基于 topology 关系字段）
    for (const resource of resources.items) {
      const topology = (resource as any).topology;
      if (!topology) continue;

      // VPC 关系
      if (topology.vpcId) {
        const vpcExists = resources.items.some(r => r.providerResourceId === topology.vpcId);
        if (vpcExists) {
          edges.push({
            id: `edge-${resource.id}-${topology.vpcId}`,
            source: resource.id,
            target: topology.vpcId,
            type: 'contains',
            label: '位于',
          });
        }
      }

      // 安全组关系
      if (topology.securityGroupIds?.length) {
        for (const sgId of topology.securityGroupIds) {
          const sgExists = resources.items.some(r => r.providerResourceId === sgId);
          if (sgExists) {
            edges.push({
              id: `edge-${resource.id}-${sgId}`,
              source: resource.id,
              target: sgId,
              type: 'protected-by',
              label: '受保护',
            });
          }
        }
      }

      // 负载均衡器目标实例关系
      if (topology.targetInstanceIds?.length) {
        for (const instanceId of topology.targetInstanceIds) {
          const instanceExists = resources.items.some(r => r.providerResourceId === instanceId);
          if (instanceExists) {
            edges.push({
              id: `edge-${resource.id}-${instanceId}`,
              source: resource.id,
              target: instanceId,
              type: 'routes-to',
              label: '转发',
            });
          }
        }
      }

      // 磁盘挂载实例关系
      if (resource.resourceType === 'disk' && resource.attributes?.attachedInstanceId) {
        const instanceId = resource.attributes.attachedInstanceId as string;
        const instanceExists = resources.items.some(r => r.providerResourceId === instanceId);
        if (instanceExists) {
          edges.push({
            id: `edge-${resource.id}-${instanceId}`,
            source: resource.id,
            target: instanceId,
            type: 'attached-to',
            label: '挂载',
          });
        }
      }
    }

    return { nodes, edges };
  }
```

- [ ] **Step 2: 运行 TypeScript 检查**

Run: `cd cloud-service && pnpm typecheck`
Expected: PASS（无类型错误）

- [ ] **Step 3: 提交更改**

```bash
git add cloud-service/src/services/resource.service.ts
git commit -m "feat(backend): add getTopology method to ResourceService"
```

---

## Task 3: 后端 - 创建拓扑 API 路由

**Files:**
- Create: `cloud-service/src/routes/topology.ts`
- Modify: `cloud-service/src/index.ts`

- [ ] **Step 1: 创建拓扑路由文件**

在 `cloud-service/src/routes/` 目录下创建 `topology.ts` 文件：

```typescript
import { Router } from 'express';
import { resourceService } from '../services/resource.service.js';
import type { ResourceType } from '../providers/types.js';

const router = Router();

/**
 * GET /topology
 * 获取拓扑数据
 * Query params:
 *   - view: 'network' | 'storage'（前端使用，后端不处理）
 *   - provider: 云厂商
 *   - region: 区域
 *   - resourceType: 资源类型
 *   - status: 状态
 *   - cloudAccountId: 云账号 ID
 */
router.get('/', async (req, res) => {
  try {
    const {
      provider,
      region,
      resourceType,
      status,
      cloudAccountId,
    } = req.query;

    const filters: Record<string, string> = {};
    if (provider) filters.provider = provider as string;
    if (region) filters.region = region as string;
    if (resourceType) filters.resourceType = resourceType as ResourceType;
    if (status) filters.status = status as string;
    if (cloudAccountId) filters.cloudAccountId = cloudAccountId as string;

    const topology = await resourceService.getTopology(filters);
    res.json(topology);
  } catch (error) {
    console.error('Failed to get topology:', error);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: '获取拓扑数据失败' });
  }
});

export default router;
```

- [ ] **Step 2: 在 index.ts 中注册拓扑路由**

在 `cloud-service/src/index.ts` 文件中，找到路由注册部分（通常在文件中间位置），添加拓扑路由：

```typescript
import topologyRoutes from './routes/topology.js';

// 在其他路由注册之后
app.use('/topology', topologyRoutes);
```

- [ ] **Step 3: 运行 TypeScript 检查**

Run: `cd cloud-service && pnpm typecheck`
Expected: PASS（无类型错误）

- [ ] **Step 4: 提交更改**

```bash
git add cloud-service/src/routes/topology.ts cloud-service/src/index.ts
git commit -m "feat(backend): add topology API route"
```

---

## Task 4: 前端 - 添加拓扑类型定义

**Files:**
- Create: `web-console/src/types/topology.ts`

- [ ] **Step 1: 创建拓扑类型文件**

在 `web-console/src/types/` 目录下创建 `topology.ts` 文件：

```typescript
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
```

- [ ] **Step 2: 提交更改**

```bash
git add web-console/src/types/topology.ts
git commit -m "feat(frontend): add topology type definitions"
```

---

## Task 5: 前端 - 添加拓扑 Demo 模拟数据

**Files:**
- Modify: `web-console/src/lib/demo/mock-data.ts:1-494`
- Modify: `web-console/src/lib/demo/demo-api.ts:1-194`

- [ ] **Step 1: 在 mock-data.ts 中添加拓扑模拟数据**

在 `web-console/src/lib/demo/mock-data.ts` 文件末尾（第 494 行之后），添加拓扑模拟数据：

```typescript
// ===== 拓扑模拟数据 =====
export interface DemoTopologyNode {
  id: string;
  type: string;
  label: string;
  provider: string;
  region: string;
  status: string;
  category: string;
  icon: string;
  data: Record<string, unknown>;
}

export interface DemoTopologyEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label?: string;
}

let _topologyCache: { nodes: DemoTopologyNode[]; edges: DemoTopologyEdge[] } | null = null;

export function getDemoTopology(filters?: {
  provider?: string;
  region?: string;
  resourceType?: string;
  status?: string;
}): { nodes: DemoTopologyNode[]; edges: DemoTopologyEdge[] } {
  if (!_topologyCache) {
    const rand = seededRandom(789);
    const nodes: DemoTopologyNode[] = [];
    const edges: DemoTopologyEdge[] = [];
    let nodeIdx = 0;

    // 创建 VPC（3个）
    const vpcs = Array.from({ length: 3 }, (_, i) => {
      const id = `demo-vpc-${i}`;
      const provider = pick(Object.keys(PROVIDER_REGIONS), rand);
      const region = pick(PROVIDER_REGIONS[provider], rand);
      nodes.push({
        id,
        type: 'vpc',
        label: `VPC-${i + 1}`,
        provider,
        region,
        status: 'active',
        category: 'network',
        icon: 'git-branch',
        data: { cidrBlock: `10.${i}.0.0/16`, subnetCount: 2 + Math.floor(rand() * 2) },
      });
      return { id, provider, region };
    });

    // 创建子网（每个 VPC 2-3 个）
    const subnets: Array<{ id: string; provider: string; region: string; vpcId: string }> = [];
    for (const vpc of vpcs) {
      const subnetCount = 2 + Math.floor(rand() * 2);
      for (let i = 0; i < subnetCount; i++) {
        const id = `demo-subnet-${nodeIdx++}`;
        subnets.push({ id, provider: vpc.provider, region: vpc.region, vpcId: vpc.id });
        nodes.push({
          id,
          type: 'subnet',
          label: `Subnet-${vpc.id.split('-').pop()}-${i + 1}`,
          provider: vpc.provider,
          region: vpc.region,
          status: 'active',
          category: 'network',
          icon: 'git-branch',
          data: { cidrBlock: `10.${vpc.id.split('-').pop()}.${i}.0/24` },
        });
        edges.push({
          id: `edge-${id}-${vpc.id}`,
          source: id,
          target: vpc.id,
          type: 'contains',
          label: '位于',
        });
      }
    }

    // 创建实例（每个子网 5-10 个）
    const instances: Array<{ id: string; provider: string; region: string }> = [];
    for (const subnet of subnets) {
      const instanceCount = 5 + Math.floor(rand() * 6);
      for (let i = 0; i < instanceCount; i++) {
        const id = `demo-instance-${nodeIdx++}`;
        const status = weightedPick(['running', 'stopped', 'pending'], [0.7, 0.2, 0.1], rand);
        instances.push({ id, provider: subnet.provider, region: subnet.region });
        nodes.push({
          id,
          type: 'instance',
          label: `Instance-${instances.length}`,
          provider: subnet.provider,
          region: subnet.region,
          status,
          category: 'compute',
          icon: 'server',
          data: { cpu: pick([1, 2, 4, 8], rand), memoryMb: pick([2048, 4096, 8192, 16384], rand) },
        });
        edges.push({
          id: `edge-${id}-${subnet.id}`,
          source: id,
          target: subnet.id,
          type: 'contains',
          label: '位于',
        });
      }
    }

    // 创建安全组（每个 VPC 2 个）
    for (const vpc of vpcs) {
      for (let i = 0; i < 2; i++) {
        const id = `demo-sg-${nodeIdx++}`;
        nodes.push({
          id,
          type: 'securitygroup',
          label: `SG-${vpc.id.split('-').pop()}-${i + 1}`,
          provider: vpc.provider,
          region: vpc.region,
          status: 'active',
          category: 'security',
          icon: 'shield',
          data: { ruleCount: 5 + Math.floor(rand() * 10) },
        });
        // 随机选择一些实例关联此安全组
        const relatedInstances = instances
          .filter(inst => inst.region === vpc.region && rand() > 0.5)
          .slice(0, 3);
        for (const inst of relatedInstances) {
          edges.push({
            id: `edge-${inst.id}-${id}`,
            source: inst.id,
            target: id,
            type: 'protected-by',
            label: '受保护',
          });
        }
      }
    }

    // 创建负载均衡器（2个）
    for (let i = 0; i < 2; i++) {
      const id = `demo-lb-${nodeIdx++}`;
      const provider = pick(Object.keys(PROVIDER_REGIONS), rand);
      const region = pick(PROVIDER_REGIONS[provider], rand);
      nodes.push({
        id,
        type: 'loadbalancer',
        label: `LB-${i + 1}`,
        provider,
        region,
        status: 'active',
        category: 'network',
        icon: 'share-2',
        data: { type: pick(['application', 'network'], rand), scheme: 'internet-facing' },
      });
      // 关联一些实例
      const targetInstances = instances
        .filter(inst => inst.region === region)
        .slice(0, 3);
      for (const inst of targetInstances) {
        edges.push({
          id: `edge-${id}-${inst.id}`,
          source: id,
          target: inst.id,
          type: 'routes-to',
          label: '转发',
        });
      }
    }

    // 创建数据库（3个）
    for (let i = 0; i < 3; i++) {
      const id = `demo-db-${nodeIdx++}`;
      const provider = pick(Object.keys(PROVIDER_REGIONS), rand);
      const region = pick(PROVIDER_REGIONS[provider], rand);
      const vpc = vpcs.find(v => v.region === region) || vpcs[0];
      nodes.push({
        id,
        type: 'database',
        label: `DB-${i + 1}`,
        provider,
        region,
        status: 'active',
        category: 'database',
        icon: 'database',
        data: { engine: pick(['mysql', 'postgresql', 'mongodb'], rand), engineVersion: '8.0' },
      });
      edges.push({
        id: `edge-${id}-${vpc.id}`,
        source: id,
        target: vpc.id,
        type: 'contains',
        label: '位于',
      });
    }

    // 创建缓存（2个）
    for (let i = 0; i < 2; i++) {
      const id = `demo-cache-${nodeIdx++}`;
      const provider = pick(Object.keys(PROVIDER_REGIONS), rand);
      const region = pick(PROVIDER_REGIONS[provider], rand);
      nodes.push({
        id,
        type: 'cache',
        label: `Redis-${i + 1}`,
        provider,
        region,
        status: 'active',
        category: 'database',
        icon: 'zap',
        data: { engine: 'redis', engineVersion: '7.0', memoryMb: pick([256, 512, 1024], rand) },
      });
    }

    // 创建对象存储（3个）
    for (let i = 0; i < 3; i++) {
      const id = `demo-bucket-${nodeIdx++}`;
      const provider = pick(Object.keys(PROVIDER_REGIONS), rand);
      const region = pick(PROVIDER_REGIONS[provider], rand);
      nodes.push({
        id,
        type: 'bucket',
        label: `Bucket-${i + 1}`,
        provider,
        region,
        status: 'active',
        category: 'storage',
        icon: 'database',
        data: { storageClass: pick(['standard', 'standard-ia', 'glacier'], rand), sizeBytes: Math.floor(rand() * 1000000000) },
      });
    }

    _topologyCache = { nodes, edges };
  }

  // 应用筛选
  let { nodes, edges } = _topologyCache;

  if (filters?.provider) {
    const nodeIds = new Set(nodes.filter(n => n.provider === filters.provider).map(n => n.id));
    nodes = nodes.filter(n => nodeIds.has(n.id));
    edges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
  }

  if (filters?.region) {
    const nodeIds = new Set(nodes.filter(n => n.region === filters.region).map(n => n.id));
    nodes = nodes.filter(n => nodeIds.has(n.id));
    edges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
  }

  if (filters?.resourceType) {
    const nodeIds = new Set(nodes.filter(n => n.type === filters.resourceType).map(n => n.id));
    nodes = nodes.filter(n => nodeIds.has(n.id));
    edges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
  }

  if (filters?.status) {
    const nodeIds = new Set(nodes.filter(n => n.status === filters.status).map(n => n.id));
    nodes = nodes.filter(n => nodeIds.has(n.id));
    edges = edges.filter(e => nodeIds.has(e.source) && nodeIds.has(e.target));
  }

  return { nodes, edges };
}
```

- [ ] **Step 2: 在 demo-api.ts 中添加拓扑 API**

在 `web-console/src/lib/demo/demo-api.ts` 文件中，添加拓扑 API 函数：

```typescript
import { getDemoTopology } from './mock-data';

export function demoGetTopology(filters?: {
  provider?: string;
  region?: string;
  resourceType?: string;
  status?: string;
}): Promise<{ nodes: Array<{ id: string; type: string; label: string; provider: string; region: string; status: string; category: string; icon: string; data: Record<string, unknown> }>; edges: Array<{ id: string; source: string; target: string; type: string; label?: string }> }> {
  return Promise.resolve(getDemoTopology(filters));
}
```

- [ ] **Step 3: 提交更改**

```bash
git add web-console/src/lib/demo/mock-data.ts web-console/src/lib/demo/demo-api.ts
git commit -m "feat(frontend): add topology demo mock data and API"
```

---

## Task 6: 前端 - 创建拓扑数据 Hook

**Files:**
- Create: `web-console/src/hooks/useTopology.ts`

- [ ] **Step 1: 创建拓扑 hook 文件**

在 `web-console/src/hooks/` 目录下创建 `useTopology.ts` 文件：

```typescript
import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/client';
import { isDemoMode } from '@/lib/config';
import { demoGetTopology } from '@/lib/demo/demo-api';
import type { TopologyData, TopologyFilters } from '@/types/topology';

export function useTopology(filters?: TopologyFilters) {
  return useQuery<TopologyData>({
    queryKey: ['topology', filters],
    queryFn: async () => {
      if (isDemoMode()) {
        return demoGetTopology(filters);
      }

      const params = new URLSearchParams();
      if (filters?.provider) params.set('provider', filters.provider);
      if (filters?.region) params.set('region', filters.region);
      if (filters?.resourceType) params.set('resourceType', filters.resourceType);
      if (filters?.status) params.set('status', filters.status);
      if (filters?.cloudAccountId) params.set('cloudAccountId', filters.cloudAccountId);

      const query = params.toString();
      return api.get<TopologyData>(`/topology${query ? `?${query}` : ''}`);
    },
    staleTime: 30_000, // 30 秒
  });
}
```

- [ ] **Step 2: 提交更改**

```bash
git add web-console/src/hooks/useTopology.ts
git commit -m "feat(frontend): add useTopology hook for topology data fetching"
```

---

## Task 7: 前端 - 创建自定义资源节点组件

**Files:**
- Create: `web-console/src/components/topology/ResourceNode.tsx`

- [ ] **Step 1: 创建 ResourceNode 组件**

在 `web-console/src/components/topology/` 目录下创建 `ResourceNode.tsx` 文件：

```typescript
import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { Server, Database, HardDrive, Share2, GitBranch, Shield, Globe, Boxes, Cpu, Zap } from 'lucide-react';
import { NODE_COLORS, type TopologyNode } from '@/types/topology';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  server: Server,
  database: Database,
  'hard-drive': HardDrive,
  'share-2': Share2,
  'git-branch': GitBranch,
  shield: Shield,
  globe: Globe,
  boxes: Boxes,
  cpu: Cpu,
  zap: Zap,
};

interface ResourceNodeData extends TopologyNode {
  selected?: boolean;
}

function ResourceNodeComponent({ data, selected }: NodeProps<ResourceNodeData>) {
  const Icon = ICON_MAP[data.icon] || Server;
  const color = NODE_COLORS[data.category as keyof typeof NODE_COLORS] || '#6b7280';

  return (
    <div
      className={cn(
        'relative flex flex-col items-center justify-center rounded-lg border-2 bg-white px-4 py-3 shadow-sm transition-all',
        selected ? 'border-primary shadow-md' : 'border-gray-200 hover:border-gray-300',
        'min-w-[120px]'
      )}
      style={{ borderColor: selected ? color : undefined }}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />
      
      <div
        className="flex items-center justify-center w-8 h-8 rounded-full mb-2"
        style={{ backgroundColor: `${color}20` }}
      >
        <Icon className="w-4 h-4" style={{ color }} />
      </div>
      
      <div className="text-xs font-medium text-center truncate max-w-[100px]">
        {data.label}
      </div>
      
      <div className="text-[10px] text-muted-foreground mt-1">
        {data.provider} / {data.region}
      </div>
      
      <div
        className={cn(
          'absolute -top-1 -right-1 w-2 h-2 rounded-full',
          data.status === 'running' || data.status === 'active'
            ? 'bg-green-500'
            : data.status === 'stopped'
            ? 'bg-gray-400'
            : data.status === 'pending'
            ? 'bg-yellow-500'
            : 'bg-red-500'
        )}
      />
      
      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
    </div>
  );
}

export const ResourceNode = memo(ResourceNodeComponent);
```

- [ ] **Step 2: 提交更改**

```bash
git add web-console/src/components/topology/ResourceNode.tsx
git commit -m "feat(frontend): add ResourceNode component for topology visualization"
```

---

## Task 8: 前端 - 创建自定义边组件

**Files:**
- Create: `web-console/src/components/topology/ResourceEdge.tsx`

- [ ] **Step 1: 创建 ResourceEdge 组件**

在 `web-console/src/components/topology/` 目录下创建 `ResourceEdge.tsx` 文件：

```typescript
import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';

interface ResourceEdgeData {
  label?: string;
  type: string;
}

function ResourceEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  style = {},
  markerEnd,
}: EdgeProps<ResourceEdgeData>) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeColor = data?.type === 'protected-by'
    ? '#ef4444'
    : data?.type === 'routes-to'
    ? '#f59e0b'
    : data?.type === 'attached-to'
    ? '#10b981'
    : '#6b7280';

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          ...style,
          stroke: edgeColor,
          strokeWidth: 2,
        }}
      />
      {data?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan text-[10px] bg-white px-1.5 py-0.5 rounded border text-muted-foreground"
          >
            {data.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const ResourceEdge = memo(ResourceEdgeComponent);
```

- [ ] **Step 2: 提交更改**

```bash
git add web-console/src/components/topology/ResourceEdge.tsx
git commit -m "feat(frontend): add ResourceEdge component for topology visualization"
```

---

## Task 9: 前端 - 创建筛选面板组件

**Files:**
- Create: `web-console/src/components/topology/TopologyFilter.tsx`

- [ ] **Step 1: 创建 TopologyFilter 组件**

在 `web-console/src/components/topology/` 目录下创建 `TopologyFilter.tsx` 文件：

```typescript
import { useTranslation } from 'react-i18next';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { RotateCcw } from 'lucide-react';
import type { TopologyFilters } from '@/types/topology';

const PROVIDERS = ['aws', 'aliyun', 'azure', 'tencent', 'huawei', 'render', 'oracle'];
const STATUSES = ['running', 'stopped', 'pending', 'error', 'active'];

interface TopologyFilterProps {
  filters: TopologyFilters;
  onChange: (filters: TopologyFilters) => void;
}

export function TopologyFilter({ filters, onChange }: TopologyFilterProps) {
  const { t } = useTranslation();

  function handleChange(key: keyof TopologyFilters, value: string) {
    onChange({ ...filters, [key]: value || undefined });
  }

  function handleReset() {
    onChange({});
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{t('topology.filters.title')}</h3>
        <Button variant="ghost" size="sm" onClick={handleReset}>
          <RotateCcw className="h-4 w-4 mr-1" />
          {t('topology.filters.reset')}
        </Button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            {t('topology.filters.provider')}
          </label>
          <Select
            value={filters.provider || ''}
            onChange={(e) => handleChange('provider', e.target.value)}
            className="w-full"
          >
            <option value="">{t('topology.filters.allProviders')}</option>
            {PROVIDERS.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            {t('topology.filters.region')}
          </label>
          <input
            type="text"
            value={filters.region || ''}
            onChange={(e) => handleChange('region', e.target.value)}
            placeholder={t('topology.filters.regionPlaceholder')}
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            {t('topology.filters.resourceType')}
          </label>
          <Select
            value={filters.resourceType || ''}
            onChange={(e) => handleChange('resourceType', e.target.value)}
            className="w-full"
          >
            <option value="">{t('topology.filters.allTypes')}</option>
            <option value="instance">{t('resourceTypes.instance')}</option>
            <option value="disk">{t('resourceTypes.disk')}</option>
            <option value="database">{t('resourceTypes.database')}</option>
            <option value="cache">{t('resourceTypes.cache')}</option>
            <option value="bucket">{t('resourceTypes.bucket')}</option>
            <option value="loadbalancer">{t('resourceTypes.loadbalancer')}</option>
            <option value="vpc">{t('resourceTypes.vpc')}</option>
            <option value="securitygroup">{t('resourceTypes.securitygroup')}</option>
            <option value="cdn">{t('resourceTypes.cdn')}</option>
            <option value="cluster">{t('resourceTypes.cluster')}</option>
          </Select>
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">
            {t('topology.filters.status')}
          </label>
          <Select
            value={filters.status || ''}
            onChange={(e) => handleChange('status', e.target.value)}
            className="w-full"
          >
            <option value="">{t('topology.filters.allStatuses')}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </Select>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 提交更改**

```bash
git add web-console/src/components/topology/TopologyFilter.tsx
git commit -m "feat(frontend): add TopologyFilter component for filtering resources"
```

---

## Task 10: 前端 - 创建视角切换组件

**Files:**
- Create: `web-console/src/components/topology/ViewSwitcher.tsx`

- [ ] **Step 1: 创建 ViewSwitcher 组件**

在 `web-console/src/components/topology/` 目录下创建 `ViewSwitcher.tsx` 文件：

```typescript
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { VIEW_CONFIG, type TopologyView } from '@/types/topology';
import { Network, Database } from 'lucide-react';

interface ViewSwitcherProps {
  currentView: TopologyView;
  onChange: (view: TopologyView) => void;
}

const VIEW_ICONS: Record<TopologyView, React.ComponentType<{ className?: string }>> = {
  network: Network,
  storage: Database,
};

export function ViewSwitcher({ currentView, onChange }: ViewSwitcherProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-2">
      {(Object.keys(VIEW_CONFIG) as TopologyView[]).map((view) => {
        const config = VIEW_CONFIG[view];
        const Icon = VIEW_ICONS[view];
        const isActive = currentView === view;

        return (
          <Button
            key={view}
            variant={isActive ? 'default' : 'outline'}
            size="sm"
            onClick={() => onChange(view)}
            className={cn(
              'flex items-center gap-2',
              isActive && 'bg-foreground text-background'
            )}
          >
            <Icon className="h-4 w-4" />
            {t(`topology.view.${view}`)}
          </Button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: 提交更改**

```bash
git add web-console/src/components/topology/ViewSwitcher.tsx
git commit -m "feat(frontend): add ViewSwitcher component for topology view switching"
```

---

## Task 11: 前端 - 创建节点详情面板组件

**Files:**
- Create: `web-console/src/components/topology/NodeDetailPanel.tsx`

- [ ] **Step 1: 创建 NodeDetailPanel 组件**

在 `web-console/src/components/topology/` 目录下创建 `NodeDetailPanel.tsx` 文件：

```typescript
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { X, ExternalLink } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { TOPOLOGY_CATEGORY_LABELS, type TopologyNode, type TopologyCategory } from '@/types/topology';
import { getStatusColor } from '@/types/resource';

interface NodeDetailPanelProps {
  node: TopologyNode | null;
  onClose: () => void;
}

export function NodeDetailPanel({ node, onClose }: NodeDetailPanelProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  if (!node) return null;

  const categoryLabel = TOPOLOGY_CATEGORY_LABELS[node.category as TopologyCategory] || node.category;

  function handleViewDetails() {
    // 根据资源类型跳转到对应页面
    const routeMap: Record<string, string> = {
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
    const baseRoute = routeMap[node.type] || '/resources';
    navigate(baseRoute);
  }

  return (
    <div className="w-80 border-l bg-card p-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold">{t('topology.nodeDetail.title')}</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="space-y-4">
        <div>
          <div className="text-sm font-medium mb-1">{node.label}</div>
          <Badge variant={getStatusColor(node.status)}>{node.status}</Badge>
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('topology.nodeDetail.type')}</span>
            <span>{categoryLabel}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('topology.nodeDetail.provider')}</span>
            <span>{node.provider}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t('topology.nodeDetail.region')}</span>
            <span>{node.region}</span>
          </div>
        </div>

        {Object.keys(node.data).length > 0 && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">
              {t('topology.nodeDetail.attributes')}
            </div>
            <div className="space-y-1 text-xs">
              {Object.entries(node.data).map(([key, value]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-muted-foreground">{key}</span>
                  <span className="truncate max-w-[120px]">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <Button variant="outline" className="w-full" onClick={handleViewDetails}>
          <ExternalLink className="h-4 w-4 mr-2" />
          {t('topology.nodeDetail.viewDetails')}
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 提交更改**

```bash
git add web-console/src/components/topology/NodeDetailPanel.tsx
git commit -m "feat(frontend): add NodeDetailPanel component for viewing node details"
```

---

## Task 12: 前端 - 创建拓扑画布组件

**Files:**
- Create: `web-console/src/components/topology/TopologyCanvas.tsx`

- [ ] **Step 1: 创建 TopologyCanvas 组件**

在 `web-console/src/components/topology/` 目录下创建 `TopologyCanvas.tsx` 文件：

```typescript
import { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import dagre from 'dagre';
import { ResourceNode } from './ResourceNode';
import { ResourceEdge } from './ResourceEdge';
import { NodeDetailPanel } from './NodeDetailPanel';
import { VIEW_CONFIG, type TopologyView, type TopologyNode, type TopologyEdge } from '@/types/topology';

const nodeTypes = {
  resource: ResourceNode,
};

const edgeTypes = {
  resource: ResourceEdge,
};

interface TopologyCanvasProps {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  view: TopologyView;
  isLoading?: boolean;
}

export function TopologyCanvas({ nodes, edges, view, isLoading }: TopologyCanvasProps) {
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null);

  // 使用 dagre 计算自动布局
  const { layoutNodes, layoutEdges } = useMemo(() => {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 80 });

    // 添加节点
    for (const node of nodes) {
      g.setNode(node.id, { width: 120, height: 80 });
    }

    // 添加边
    for (const edge of edges) {
      g.setEdge(edge.source, edge.target);
    }

    // 计算布局
    dagre.layout(g);

    // 转换为 React Flow 格式
    const layoutNodes: Node[] = nodes.map((node) => {
      const pos = g.node(node.id);
      return {
        id: node.id,
        type: 'resource',
        position: { x: pos.x - 60, y: pos.y - 40 },
        data: node,
      };
    });

    const layoutEdges: Edge[] = edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'resource',
      data: edge,
    }));

    return { layoutNodes, layoutEdges };
  }, [nodes, edges]);

  const [flowNodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [flowEdges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  // 更新节点和边当数据变化时
  useMemo(() => {
    setNodes(layoutNodes);
    setEdges(layoutEdges);
  }, [layoutNodes, layoutEdges, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node.data as TopologyNode);
    },
    []
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        {t('topology.loading')}
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <div className="text-lg mb-2">{t('topology.empty')}</div>
          <div className="text-sm">{t('topology.emptyHint')}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex h-full">
      <div className="flex-1 h-full">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onPaneClick={onPaneClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          attributionPosition="bottom-left"
        >
          <Controls />
          <MiniMap
            nodeStrokeWidth={3}
            zoomable
            pannable
          />
          <Background gap={16} />
        </ReactFlow>
      </div>
      <NodeDetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
    </div>
  );
}
```

- [ ] **Step 2: 提交更改**

```bash
git add web-console/src/components/topology/TopologyCanvas.tsx
git commit -m "feat(frontend): add TopologyCanvas component with dagre layout"
```

---

## Task 13: 前端 - 创建拓扑页面

**Files:**
- Create: `web-console/src/pages/Topology.tsx`

- [ ] **Step 1: 创建 Topology 页面**

在 `web-console/src/pages/` 目录下创建 `Topology.tsx` 文件：

```typescript
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTopology } from '@/hooks/useTopology';
import { TopologyFilter } from '@/components/topology/TopologyFilter';
import { ViewSwitcher } from '@/components/topology/ViewSwitcher';
import { TopologyCanvas } from '@/components/topology/TopologyCanvas';
import { Card, CardContent } from '@/components/ui/card';
import { TOPOLOGY_CATEGORY_LABELS, VIEW_CONFIG, type TopologyView, type TopologyFilters, type TopologyCategory } from '@/types/topology';

export default function Topology() {
  const { t } = useTranslation();
  const [view, setView] = useState<TopologyView>('network');
  const [filters, setFilters] = useState<TopologyFilters>({});

  const { data, isLoading } = useTopology(filters);

  // 根据视角过滤节点
  const filteredNodes = data?.nodes.filter((node) => {
    const config = VIEW_CONFIG[view];
    return config.categories.includes(node.category as TopologyCategory);
  }) || [];

  // 过滤边（只保留两端节点都在过滤后节点中的边）
  const nodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = data?.edges.filter((e) => {
    return nodeIds.has(e.source) && nodeIds.has(e.target);
  }) || [];

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* 左侧筛选面板 */}
      <div className="w-60 border-r bg-card p-4 h-full overflow-y-auto">
        <TopologyFilter filters={filters} onChange={setFilters} />
      </div>

      {/* 右侧主内容区 */}
      <div className="flex-1 flex flex-col h-full">
        {/* 顶部标题和视角切换 */}
        <div className="flex items-center justify-between p-4 border-b">
          <h1 className="text-xl font-bold">{t('topology.title')}</h1>
          <ViewSwitcher currentView={view} onChange={setView} />
        </div>

        {/* 拓扑画布 */}
        <div className="flex-1 h-full">
          <TopologyCanvas
            nodes={filteredNodes}
            edges={filteredEdges}
            view={view}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 提交更改**

```bash
git add web-console/src/pages/Topology.tsx
git commit -m "feat(frontend): add Topology page with filter and view switching"
```

---

## Task 14: 前端 - 添加拓扑导航项

**Files:**
- Modify: `web-console/src/components/Sidebar.tsx:1-170`
- Modify: `web-console/src/i18n/locales/zh.json:1-429`
- Modify: `web-console/src/i18n/locales/en.json:1-429`
- Modify: `web-console/src/App.tsx`

- [ ] **Step 1: 在 Sidebar.tsx 中添加拓扑导航项**

在 `web-console/src/components/Sidebar.tsx` 文件中，找到 `NAV_ITEMS` 数组（约第 35-101 行），在资源总览项之后添加拓扑视图项：

```typescript
import { Network } from 'lucide-react';

// 在 NAV_ITEMS 数组中，资源总览项之后添加
{
  label: t('nav.topology'),
  to: '/topology',
  icon: Network,
  permission: { resource: 'instance', action: 'list' },
},
```

- [ ] **Step 2: 在 zh.json 中添加拓扑 i18n**

在 `web-console/src/i18n/locales/zh.json` 文件中，添加拓扑相关翻译：

```json
{
  "nav": {
    "topology": "拓扑视图"
  },
  "topology": {
    "title": "拓扑视图",
    "view": {
      "network": "网络",
      "storage": "存储"
    },
    "filters": {
      "title": "筛选",
      "reset": "重置",
      "provider": "云厂商",
      "allProviders": "全部厂商",
      "region": "区域",
      "regionPlaceholder": "输入区域",
      "resourceType": "资源类型",
      "allTypes": "全部类型",
      "status": "状态",
      "allStatuses": "全部状态"
    },
    "nodeDetail": {
      "title": "节点详情",
      "type": "类型",
      "provider": "云厂商",
      "region": "区域",
      "status": "状态",
      "attributes": "属性",
      "viewDetails": "查看详情"
    },
    "empty": "暂无资源数据",
    "emptyHint": "请先同步云资源",
    "loading": "加载拓扑数据中..."
  }
}
```

- [ ] **Step 3: 在 en.json 中添加拓扑 i18n**

在 `web-console/src/i18n/locales/en.json` 文件中，添加拓扑相关翻译：

```json
{
  "nav": {
    "topology": "Topology"
  },
  "topology": {
    "title": "Topology View",
    "view": {
      "network": "Network",
      "storage": "Storage"
    },
    "filters": {
      "title": "Filters",
      "reset": "Reset",
      "provider": "Provider",
      "allProviders": "All Providers",
      "region": "Region",
      "regionPlaceholder": "Enter region",
      "resourceType": "Resource Type",
      "allTypes": "All Types",
      "status": "Status",
      "allStatuses": "All Statuses"
    },
    "nodeDetail": {
      "title": "Node Details",
      "type": "Type",
      "provider": "Provider",
      "region": "Region",
      "status": "Status",
      "attributes": "Attributes",
      "viewDetails": "View Details"
    },
    "empty": "No resource data",
    "emptyHint": "Please sync cloud resources first",
    "loading": "Loading topology data..."
  }
}
```

- [ ] **Step 4: 在 App.tsx 中添加拓扑路由**

在 `web-console/src/App.tsx` 文件中，添加拓扑路由：

```typescript
import Topology from '@/pages/Topology';

// 在路由配置中添加
<Route path="/topology" element={<Topology />} />
```

- [ ] **Step 5: 运行 TypeScript 检查**

Run: `cd web-console && pnpm typecheck`
Expected: PASS（无类型错误）

- [ ] **Step 6: 提交更改**

```bash
git add web-console/src/components/Sidebar.tsx web-console/src/i18n/locales/zh.json web-console/src/i18n/locales/en.json web-console/src/App.tsx
git commit -m "feat(frontend): add topology navigation and i18n support"
```

---

## Task 15: 前端 - 安装依赖并测试构建

**Files:**
- Modify: `web-console/openclaw-ui/package.json`

- [ ] **Step 1: 安装 @xyflow/react 和 dagre 依赖**

Run: `cd web-console/openclaw-ui && pnpm add @xyflow/react dagre @types/dagre`
Expected: 依赖安装成功

- [ ] **Step 2: 运行构建**

Run: `pnpm --filter @cloudops/web-console build`
Expected: 构建成功

- [ ] **Step 3: 提交更改**

```bash
git add web-console/openclaw-ui/package.json pnpm-lock.yaml
git commit -m "chore: add @xyflow/react and dagre dependencies"
```

---

## Task 16: 前端 - 集成测试

**Files:**
- All created files

- [ ] **Step 1: 启动开发服务器**

Run: `pnpm --filter @cloudops/web-console dev`
Expected: 服务器启动成功

- [ ] **Step 2: 访问拓扑页面**

在浏览器中访问 `http://localhost:5173/topology`
Expected: 拓扑页面正常显示，包含筛选面板、视角切换、拓扑画布

- [ ] **Step 3: 测试筛选功能**

- 选择云厂商筛选，观察节点变化
- 输入区域筛选，观察节点变化
- 选择资源类型筛选，观察节点变化
- 选择状态筛选，观察节点变化
- 点击重置按钮，恢复所有节点

- [ ] **Step 4: 测试视角切换**

- 点击「网络」按钮，观察节点过滤
- 点击「存储」按钮，观察节点过滤

- [ ] **Step 5: 测试交互功能**

- 拖拽节点，观察位置变化
- 缩放画布，观察缩放效果
- 点击节点，观察详情面板显示
- 双击节点，观察页面跳转

- [ ] **Step 6: 测试 Demo 模式**

- 启用 Demo 模式，验证拓扑数据正常显示
- 验证筛选功能在 Demo 模式下正常工作

- [ ] **Step 7: 提交最终更改**

```bash
git add .
git commit -m "feat: complete topology view implementation"
```

---

## 验证清单

- [ ] 后端拓扑 API 正常工作
- [ ] 前端拓扑页面正常显示
- [ ] 筛选功能正常工作
- [ ] 视角切换正常工作
- [ ] 交互功能正常工作
- [ ] Demo 模式正常工作
- [ ] TypeScript 检查通过
- [ ] 构建成功
- [ ] i18n 翻译正确
- [ ] 导航项正确显示
