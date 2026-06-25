# Topology Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the topology visualization to support auto-clustering, multi-mode grouping, a centered detail modal with tabs, and smooth Framer Motion animations — maintaining clarity at 300+ nodes.

**Architecture:** ClusterNode component groups child nodes by the selected `GroupMode`; a dagre Web Worker computes layout off the main thread; NodeDetailModal replaces the side panel with tabbed content; Framer Motion drives all transitions.

**Tech Stack:** React 18, @xyflow/react v12, dagre v0.8, framer-motion v11, Tailwind CSS, zustand, TypeScript strict

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `src/types/topology.ts` | Add `GroupMode`, `ClusterData`, extend `TopologyNode` with `parentId` |
| Create | `src/workers/dagre-layout.worker.ts` | Web Worker for dagre layout computation |
| Create | `src/hooks/useTopologyCluster.ts` | Compute clusters from nodes/edges/groupMode |
| Create | `src/components/topology/ClusterNode.tsx` | Custom React Flow node for collapsed clusters |
| Create | `src/components/topology/GroupModeSwitcher.tsx` | 4-button toggle for grouping mode |
| Create | `src/components/topology/NodeDetailModal.tsx` | Centered modal with tab navigation |
| Create | `src/components/topology/NodeDetailTabs/OverviewTab.tsx` | Basic attributes tab |
| Create | `src/components/topology/NodeDetailTabs/MetricsTab.tsx` | Placeholder metrics tab |
| Create | `src/components/topology/NodeDetailTabs/LogsTab.tsx` | Placeholder logs tab |
| Create | `src/components/topology/NodeDetailTabs/ConnectionsTab.tsx` | Upstream/downstream connections tab |
| Modify | `src/components/topology/TopologyCanvas.tsx` | Integrate ClusterNode, Worker, replace side panel with modal |
| Modify | `src/pages/Topology.tsx` | Add GroupModeSwitcher, pass groupMode down |
| Modify | `src/i18n/locales/zh.json` | Add groupMode, cluster, detailModal translations |
| Modify | `src/i18n/locales/en.json` | Add groupMode, cluster, detailModal translations |
| Modify | `src/lib/demo/mock-data.ts` | Add `cloudAccountId`, `monthlyCost` to demo nodes |

---

### Task 1: Extend Types

**Files:**
- Modify: `web-console/src/types/topology.ts`

- [ ] **Step 1: Add GroupMode, ClusterData, and TopologyNode.parentId**

Append to `web-console/src/types/topology.ts` (after the `VIEW_CONFIG` constant, before `NODE_COLORS`):

```typescript
/** 分组模式 */
export type GroupMode = 'hierarchy' | 'semantic' | 'team' | 'cost';

/** 分组模式标签 */
export const GROUP_MODE_LABELS: Record<GroupMode, string> = {
  hierarchy: '层级',
  semantic: '语义',
  team: '团队',
  cost: '成本',
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
```

Modify the `TopologyNode` interface to add an optional `parentId`:

```typescript
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
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd web-console && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web-console/src/types/topology.ts
git commit -m "feat(topology): extend types for clustering and grouping"
```

---

### Task 2: Dagre Web Worker

**Files:**
- Create: `web-console/src/workers/dagre-layout.worker.ts`

- [ ] **Step 1: Create the Web Worker file**

```typescript
// web-console/src/workers/dagre-layout.worker.ts
import dagre from 'dagre';

interface LayoutRequest {
  nodes: Array<{ id: string; width?: number; height?: number }>;
  edges: Array<{ source: string; target: string }>;
  rankdir?: 'TB' | 'BT' | 'LR' | 'RL';
  nodesep?: number;
  ranksep?: number;
}

interface LayoutResult {
  positions: Record<string, { x: number; y: number }>;
}

self.onmessage = (e: MessageEvent<LayoutRequest>) => {
  const { nodes, edges, rankdir = 'TB', nodesep = 50, ranksep = 80 } = e.data;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir, nodesep, ranksep });

  for (const node of nodes) {
    g.setNode(node.id, { width: node.width ?? 120, height: node.height ?? 80 });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of nodes) {
    const pos = g.node(node.id);
    if (pos) {
      positions[node.id] = { x: pos.x, y: pos.y };
    }
  }

  const result: LayoutResult = { positions };
  self.postMessage(result);
};
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd web-console && npx tsc -b --noEmit`
Expected: No errors (worker file is included in tsconfig by default since it's under src/)

- [ ] **Step 3: Commit**

```bash
git add web-console/src/workers/dagre-layout.worker.ts
git commit -m "feat(topology): add dagre Web Worker for layout computation"
```

---

### Task 3: Cluster Computation Hook

**Files:**
- Create: `web-console/src/hooks/useTopologyCluster.ts`

- [ ] **Step 1: Create the clustering hook**

```typescript
// web-console/src/hooks/useTopologyCluster.ts
import { useMemo } from 'react';
import type { TopologyNode, TopologyEdge, TopologyCategory, GroupMode, ClusterData } from '@/types/topology';

interface ClusterResult {
  clusters: ClusterData[];
  childToCluster: Map<string, string>;
}

export function computeClusters(
  nodes: TopologyNode[],
  edges: TopologyEdge[],
  groupMode: GroupMode,
  clusterThreshold: number = 50
): ClusterResult {
  if (nodes.length <= clusterThreshold) {
    return { clusters: [], childToCluster: new Map() };
  }

  // Group nodes by the grouping dimension
  const groups = new Map<string, TopologyNode[]>();

  for (const node of nodes) {
    let key: string;
    switch (groupMode) {
      case 'hierarchy':
        key = `${node.type}:${node.parentId || 'root'}`;
        break;
      case 'semantic':
        key = node.category;
        break;
      case 'team':
        key = String(node.data.cloudAccountId || 'unknown');
        break;
      case 'cost':
        key = node.region;
        break;
      default:
        key = node.type;
    }

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(node);
  }

  const clusters: ClusterData[] = [];
  const childToCluster = new Map<string, string>();

  let clusterIdx = 0;
  for (const [key, groupNodes] of groups) {
    if (groupNodes.length <= 3) {
      // Small groups don't need clustering
      continue;
    }

    const clusterId = `cluster-${groupMode}-${clusterIdx++}`;
    const statusSummary: Record<string, number> = {};
    for (const n of groupNodes) {
      statusSummary[n.status] = (statusSummary[n.status] || 0) + 1;
    }

    // Determine cluster category and icon from majority
    const categoryCounts = new Map<string, number>();
    for (const n of groupNodes) {
      categoryCounts.set(n.category, (categoryCounts.get(n.category) || 0) + 1);
    }
    let maxCount = 0;
    let majorityCategory: TopologyCategory = 'compute';
    for (const [cat, count] of categoryCounts) {
      if (count > maxCount) {
        maxCount = count;
        majorityCategory = cat as TopologyCategory;
      }
    }

    // Label based on groupMode
    let label: string;
    switch (groupMode) {
      case 'hierarchy':
        label = `${groupNodes[0].type} (${groupNodes.length})`;
        break;
      case 'semantic': {
        const categoryLabels: Record<string, string> = {
          compute: '计算', storage: '存储', database: '数据库',
          network: '网络', security: '安全', cdn: 'CDN',
          container: '容器', ai: 'AI 服务',
        };
        label = `${categoryLabels[majorityCategory] || majorityCategory} (${groupNodes.length})`;
        break;
      }
      case 'team':
        label = `${key} (${groupNodes.length})`;
        break;
      case 'cost':
        label = `${key} (${groupNodes.length})`;
        break;
      default:
        label = `${key} (${groupNodes.length})`;
    }

    clusters.push({
      id: clusterId,
      label,
      groupMode,
      childNodeIds: groupNodes.map(n => n.id),
      collapsed: true,
      statusSummary,
      category: majorityCategory,
      icon: groupNodes[0].icon,
    });

    for (const n of groupNodes) {
      childToCluster.set(n.id, clusterId);
    }
  }

  return { clusters, childToCluster };
}

export function useTopologyCluster(
  nodes: TopologyNode[],
  edges: TopologyEdge[],
  groupMode: GroupMode,
  collapsedClusters: Set<string>
): { visibleNodes: TopologyNode[]; visibleEdges: TopologyEdge[]; clusters: ClusterData[] } {
  return useMemo(() => {
    const { clusters, childToCluster } = computeClusters(nodes, edges, groupMode);

    // Mark collapse state from the external set
    for (const c of clusters) {
      c.collapsed = collapsedClusters.has(c.id);
    }

    // Determine visible nodes: cluster nodes + unclustered children + expanded cluster children
    const visibleNodes: TopologyNode[] = [];
    const visibleNodeIds = new Set<string>();

    // Add cluster nodes
    for (const cluster of clusters) {
      visibleNodes.push({
        id: cluster.id,
        type: 'cluster',
        label: cluster.label,
        provider: '',
        region: '',
        status: 'active',
        category: cluster.category,
        icon: cluster.icon,
        data: cluster as unknown as Record<string, unknown>,
      });
      visibleNodeIds.add(cluster.id);
    }

    // Add original nodes (skip those inside collapsed clusters)
    for (const node of nodes) {
      const clusterId = childToCluster.get(node.id);
      if (clusterId) {
        const cluster = clusters.find(c => c.id === clusterId);
        if (cluster && cluster.collapsed) {
          continue; // Skip children of collapsed clusters
        }
      }
      visibleNodes.push(node);
      visibleNodeIds.add(node.id);
    }

    // Filter edges to only visible nodes
    const visibleEdges = edges.filter(
      e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
    );

    // Add cluster aggregation edges (from cluster to its parent's cluster or root)
    // For now, clusters connect to nodes that were connected to any of their children
    // This is handled by the edge filtering above since cluster nodes have the same ID space

    return { visibleNodes, visibleEdges, clusters };
  }, [nodes, edges, groupMode, collapsedClusters]);
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd web-console && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web-console/src/hooks/useTopologyCluster.ts
git commit -m "feat(topology): add cluster computation hook"
```

---

### Task 4: ClusterNode Component

**Files:**
- Create: `web-console/src/components/topology/ClusterNode.tsx`

- [ ] **Step 1: Create ClusterNode component**

```typescript
// web-console/src/components/topology/ClusterNode.tsx
import { memo, type CSSProperties } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { ChevronDown, ChevronRight, Server, Database, HardDrive, Share2, GitBranch, Shield, Globe, Boxes, Cpu, Zap, type LucideIcon } from 'lucide-react';
import { NODE_COLORS, type ClusterData, type TopologyCategory } from '@/types/topology';
import { cn } from '@/lib/utils';

const ICON_MAP: Record<string, LucideIcon> = {
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

type ClusterNodeData = Node<ClusterData & Record<string, unknown>>;

function ClusterNodeComponent({ data, selected }: NodeProps<ClusterNodeData>) {
  const clusterData = data as unknown as ClusterData;
  const Icon = ICON_MAP[clusterData.icon] || Boxes;
  const color = NODE_COLORS[clusterData.category as TopologyCategory] || '#6b7280';
  const totalChildren = clusterData.childNodeIds.length;
  const statusEntries = Object.entries(clusterData.statusSummary);

  return (
    <div
      className={cn(
        'relative flex flex-col rounded-lg border-2 bg-white shadow-sm transition-all cursor-pointer',
        selected ? 'border-primary shadow-md' : 'border-gray-200 hover:border-gray-300',
        'min-w-[160px] max-w-[220px]'
      )}
      style={{ borderColor: selected ? color : undefined }}
      aria-label={`Cluster: ${clusterData.label}`}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-400" />

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
        <div
          className="flex items-center justify-center w-6 h-6 rounded"
          style={{ backgroundColor: `${color}20` }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color } as CSSProperties} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold truncate">{clusterData.label}</div>
          <div className="text-[10px] text-muted-foreground">
            {totalChildren} 个节点
          </div>
        </div>
        {clusterData.collapsed ? (
          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
        )}
      </div>

      {/* Status summary dots */}
      <div className="flex items-center gap-1 px-3 py-2">
        {statusEntries.map(([status, count]) => (
          <div key={status} className="flex items-center gap-0.5" title={`${status}: ${count}`}>
            <div
              className={cn(
                'w-1.5 h-1.5 rounded-full',
                status === 'running' || status === 'active'
                  ? 'bg-green-500'
                  : status === 'stopped'
                  ? 'bg-gray-400'
                  : status === 'pending'
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
              )}
            />
            <span className="text-[9px] text-muted-foreground">{count}</span>
          </div>
        ))}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-gray-400" />
    </div>
  );
}

export const ClusterNode = memo(ClusterNodeComponent);
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd web-console && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web-console/src/components/topology/ClusterNode.tsx
git commit -m "feat(topology): add ClusterNode component"
```

---

### Task 5: GroupModeSwitcher Component

**Files:**
- Create: `web-console/src/components/topology/GroupModeSwitcher.tsx`

- [ ] **Step 1: Create GroupModeSwitcher**

```typescript
// web-console/src/components/topology/GroupModeSwitcher.tsx
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { GROUP_MODE_LABELS, type GroupMode } from '@/types/topology';
import { Network, Tag, Users, DollarSign } from 'lucide-react';

interface GroupModeSwitcherProps {
  currentMode: GroupMode;
  onChange: (mode: GroupMode) => void;
}

const GROUP_MODE_ICONS: Record<GroupMode, React.ComponentType<{ className?: string }>> = {
  hierarchy: Network,
  semantic: Tag,
  team: Users,
  cost: DollarSign,
};

export function GroupModeSwitcher({ currentMode, onChange }: GroupModeSwitcherProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-1">
      {(Object.keys(GROUP_MODE_LABELS) as GroupMode[]).map((mode) => {
        const Icon = GROUP_MODE_ICONS[mode];
        const isActive = currentMode === mode;

        return (
          <Button
            key={mode}
            variant={isActive ? 'default' : 'outline'}
            size="sm"
            onClick={() => onChange(mode)}
            className={cn(
              'flex items-center gap-1.5 text-xs h-8',
              isActive && 'bg-primary text-primary-foreground'
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {t(`topology.groupMode.${mode}`)}
          </Button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd web-console && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web-console/src/components/topology/GroupModeSwitcher.tsx
git commit -m "feat(topology): add GroupModeSwitcher component"
```

---

### Task 6: NodeDetailModal with Tabs

**Files:**
- Create: `web-console/src/components/topology/NodeDetailTabs/OverviewTab.tsx`
- Create: `web-console/src/components/topology/NodeDetailTabs/MetricsTab.tsx`
- Create: `web-console/src/components/topology/NodeDetailTabs/LogsTab.tsx`
- Create: `web-console/src/components/topology/NodeDetailTabs/ConnectionsTab.tsx`
- Create: `web-console/src/components/topology/NodeDetailModal.tsx`

- [ ] **Step 1: Create OverviewTab**

```typescript
// web-console/src/components/topology/NodeDetailTabs/OverviewTab.tsx
import { Badge } from '@/components/ui/badge';
import { TOPOLOGY_CATEGORY_LABELS, type TopologyNode, type TopologyCategory } from '@/types/topology';
import { getStatusColor } from '@/types/resource';

interface OverviewTabProps {
  node: TopologyNode;
}

export function OverviewTab({ node }: OverviewTabProps) {
  const categoryLabel = TOPOLOGY_CATEGORY_LABELS[node.category as TopologyCategory] || node.category;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div>
          <div className="font-semibold">{node.label}</div>
          <div className="text-sm text-muted-foreground">{node.type}</div>
        </div>
        <Badge variant={getStatusColor(node.status)}>{node.status}</Badge>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-muted-foreground">分类</span>
          <div className="font-medium">{categoryLabel}</div>
        </div>
        <div>
          <span className="text-muted-foreground">云厂商</span>
          <div className="font-medium">{node.provider}</div>
        </div>
        <div>
          <span className="text-muted-foreground">区域</span>
          <div className="font-medium">{node.region}</div>
        </div>
        {Object.keys(node.data).length > 0 && (
          <div className="col-span-2">
            <span className="text-muted-foreground">属性</span>
            <div className="mt-1 space-y-1">
              {Object.entries(node.data).map(([key, value]) => (
                <div key={key} className="flex justify-between text-xs">
                  <span className="text-muted-foreground">{key}</span>
                  <span className="truncate max-w-[180px]">{String(value)}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create MetricsTab placeholder**

```typescript
// web-console/src/components/topology/NodeDetailTabs/MetricsTab.tsx
import { Activity } from 'lucide-react';

export function MetricsTab() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <Activity className="h-8 w-8 mb-3 opacity-50" />
      <div className="text-sm">指标数据待接入</div>
      <div className="text-xs mt-1">将在后续版本中支持 CPU、内存、网络使用率</div>
    </div>
  );
}
```

- [ ] **Step 3: Create LogsTab placeholder**

```typescript
// web-console/src/components/topology/NodeDetailTabs/LogsTab.tsx
import { FileText } from 'lucide-react';

export function LogsTab() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <FileText className="h-8 w-8 mb-3 opacity-50" />
      <div className="text-sm">日志数据待接入</div>
      <div className="text-xs mt-1">将在后续版本中支持查看最近日志</div>
    </div>
  );
}
```

- [ ] **Step 4: Create ConnectionsTab**

```typescript
// web-console/src/components/topology/NodeDetailTabs/ConnectionsTab.tsx
import { ArrowRight, ArrowLeft, ArrowUpDown } from 'lucide-react';
import type { TopologyNode, TopologyEdge } from '@/types/topology';

interface ConnectionsTabProps {
  node: TopologyNode;
  allEdges: TopologyEdge[];
  allNodes: TopologyNode[];
}

export function ConnectionsTab({ node, allEdges, allNodes }: ConnectionsTabProps) {
  const incoming = allEdges.filter(e => e.target === node.id);
  const outgoing = allEdges.filter(e => e.source === node.id);

  const nodeMap = new Map(allNodes.map(n => [n.id, n]));

  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <ArrowUpDown className="h-8 w-8 mb-3 opacity-50" />
        <div className="text-sm">无连接关系</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {incoming.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> 上游 ({incoming.length})
          </div>
          <div className="space-y-1">
            {incoming.map(edge => {
              const sourceNode = nodeMap.get(edge.source);
              return (
                <div key={edge.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/50">
                  <span className="font-medium">{sourceNode?.label || edge.source}</span>
                  {edge.label && <span className="text-muted-foreground">({edge.label})</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {outgoing.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <ArrowRight className="h-3 w-3" /> 下游 ({outgoing.length})
          </div>
          <div className="space-y-1">
            {outgoing.map(edge => {
              const targetNode = nodeMap.get(edge.target);
              return (
                <div key={edge.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/50">
                  <span className="font-medium">{targetNode?.label || edge.target}</span>
                  {edge.label && <span className="text-muted-foreground">({edge.label})</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create NodeDetailModal**

```typescript
// web-console/src/components/topology/NodeDetailModal.tsx
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { X, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { OverviewTab } from './NodeDetailTabs/OverviewTab';
import { MetricsTab } from './NodeDetailTabs/MetricsTab';
import { LogsTab } from './NodeDetailTabs/LogsTab';
import { ConnectionsTab } from './NodeDetailTabs/ConnectionsTab';
import { type TopologyNode, type TopologyEdge, RESOURCE_TYPE_ROUTE_MAP } from '@/types/topology';
import { cn } from '@/lib/utils';

interface NodeDetailModalProps {
  node: TopologyNode | null;
  allEdges: TopologyEdge[];
  allNodes: TopologyNode[];
  onClose: () => void;
}

type TabKey = 'overview' | 'metrics' | 'logs' | 'connections';

const TABS: { key: TabKey; labelKey: string }[] = [
  { key: 'overview', labelKey: 'topology.detailModal.overview' },
  { key: 'metrics', labelKey: 'topology.detailModal.metrics' },
  { key: 'logs', labelKey: 'topology.detailModal.logs' },
  { key: 'connections', labelKey: 'topology.detailModal.connections' },
];

export function NodeDetailModal({ node, allEdges, allNodes, onClose }: NodeDetailModalProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<TabKey>('overview');

  if (!node) return null;

  function handleViewDetails() {
    const baseRoute = RESOURCE_TYPE_ROUTE_MAP[node.type] || '/resources';
    navigate(baseRoute);
  }

  return (
    <AnimatePresence>
      {node && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
          >
            <div
              className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b">
                <div>
                  <h2 className="text-lg font-semibold">{node.label}</h2>
                  <p className="text-sm text-muted-foreground">
                    {node.provider} / {node.region}
                  </p>
                </div>
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Tabs */}
              <div className="flex border-b px-6">
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px',
                      activeTab === tab.key
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {t(tab.labelKey)}
                  </button>
                ))}
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto px-6 py-4">
                {activeTab === 'overview' && <OverviewTab node={node} />}
                {activeTab === 'metrics' && <MetricsTab />}
                {activeTab === 'logs' && <LogsTab />}
                {activeTab === 'connections' && (
                  <ConnectionsTab node={node} allEdges={allEdges} allNodes={allNodes} />
                )}
              </div>

              {/* Footer */}
              <div className="border-t px-6 py-3 flex justify-end">
                <Button variant="outline" onClick={handleViewDetails}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  {t('topology.detailModal.viewDetails')}
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 6: Verify typecheck passes**

Run: `cd web-console && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add web-console/src/components/topology/NodeDetailTabs/ web-console/src/components/topology/NodeDetailModal.tsx
git commit -m "feat(topology): add NodeDetailModal with tabbed content"
```

---

### Task 7: Refactor TopologyCanvas

**Files:**
- Modify: `web-console/src/components/topology/TopologyCanvas.tsx`

- [ ] **Step 1: Rewrite TopologyCanvas to integrate ClusterNode, Worker, and Modal**

Replace the entire content of `web-console/src/components/topology/TopologyCanvas.tsx`:

```typescript
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ResourceNode } from './ResourceNode';
import { ResourceEdge } from './ResourceEdge';
import { ClusterNode } from './ClusterNode';
import { NodeDetailModal } from './NodeDetailModal';
import { useTopologyCluster } from '@/hooks/useTopologyCluster';
import { type TopologyNode, type TopologyEdge, type GroupMode, type ClusterData, RESOURCE_TYPE_ROUTE_MAP } from '@/types/topology';

const nodeTypes = {
  resource: ResourceNode,
  cluster: ClusterNode,
};

const edgeTypes = {
  resource: ResourceEdge,
};

interface TopologyCanvasProps {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  isLoading?: boolean;
  groupMode?: GroupMode;
}

export function TopologyCanvas({ nodes, edges, isLoading, groupMode = 'hierarchy' }: TopologyCanvasProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null);
  const [collapsedClusters, setCollapsedClusters] = useState<Set<string>>(new Set());
  const workerRef = useRef<Worker | null>(null);

  // Compute clusters
  const { visibleNodes, visibleEdges, clusters } = useTopologyCluster(
    nodes, edges, groupMode, collapsedClusters
  );

  // Reset collapsed clusters when groupMode changes
  useEffect(() => {
    setCollapsedClusters(new Set());
  }, [groupMode]);

  // Initialize Web Worker
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('@/workers/dagre-layout.worker.ts', import.meta.url),
      { type: 'module' }
    );
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // Layout with Worker
  const [layoutPositions, setLayoutPositions] = useState<Record<string, { x: number; y: number }>>({});

  useEffect(() => {
    const worker = workerRef.current;
    if (!worker || visibleNodes.length === 0) return;

    const handler = (e: MessageEvent) => {
      setLayoutPositions(e.data.positions);
    };

    worker.addEventListener('message', handler);
    worker.postMessage({
      nodes: visibleNodes.map(n => ({
        id: n.id,
        width: n.type === 'cluster' ? 180 : 120,
        height: n.type === 'cluster' ? 80 : 80,
      })),
      edges: visibleEdges.map(e => ({ source: e.source, target: e.target })),
    });

    return () => worker.removeEventListener('message', handler);
  }, [visibleNodes, visibleEdges]);

  // Convert to React Flow format
  const { flowNodes, flowEdges } = useMemo(() => {
    const fn: Node[] = visibleNodes.map((node) => {
      const pos = layoutPositions[node.id];
      return {
        id: node.id,
        type: node.type === 'cluster' ? 'cluster' : 'resource',
        position: pos
          ? { x: pos.x - (node.type === 'cluster' ? 90 : 60), y: pos.y - 40 }
          : { x: 0, y: 0 },
        data: node as unknown as Record<string, unknown>,
      };
    });

    const fe: Edge[] = visibleEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'resource',
      data: edge as unknown as Record<string, unknown>,
    }));

    return { flowNodes: fn, flowEdges: fe };
  }, [visibleNodes, visibleEdges, layoutPositions]);

  const [flowNodesState, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [flowEdgesState, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowNodes, flowEdges, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === 'cluster') {
        // Toggle cluster collapse on click
        const clusterData = node.data as unknown as ClusterData;
        setCollapsedClusters(prev => {
          const next = new Set(prev);
          if (next.has(clusterData.id)) {
            next.delete(clusterData.id);
          } else {
            next.add(clusterData.id);
          }
          return next;
        });
      } else {
        setSelectedNode(node.data as unknown as TopologyNode);
      }
    },
    []
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === 'cluster') return;
      const topologyNode = node.data as unknown as TopologyNode;
      const baseRoute = RESOURCE_TYPE_ROUTE_MAP[topologyNode.type] || '/resources';
      navigate(baseRoute);
    },
    [navigate]
  );

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="animate-pulse text-sm">{t('topology.loading')}</div>
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
          nodes={flowNodesState}
          edges={flowEdgesState}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
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

      <NodeDetailModal
        node={selectedNode}
        allEdges={edges}
        allNodes={nodes}
        onClose={() => setSelectedNode(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd web-console && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web-console/src/components/topology/TopologyCanvas.tsx
git commit -m "feat(topology): refactor canvas with ClusterNode, Worker, and Modal"
```

---

### Task 8: Integrate GroupModeSwitcher in Topology Page

**Files:**
- Modify: `web-console/src/pages/Topology.tsx`

- [ ] **Step 1: Add groupMode state and GroupModeSwitcher**

Replace the content of `web-console/src/pages/Topology.tsx`:

```typescript
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTopology } from '@/hooks/useTopology';
import { TopologyFilter } from '@/components/topology/TopologyFilter';
import { ViewSwitcher } from '@/components/topology/ViewSwitcher';
import { GroupModeSwitcher } from '@/components/topology/GroupModeSwitcher';
import { TopologyCanvas } from '@/components/topology/TopologyCanvas';
import { VIEW_CONFIG, type TopologyView, type TopologyFilters, type TopologyCategory, type GroupMode } from '@/types/topology';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { Button } from '@/components/ui/button';

export default function Topology() {
  const { t } = useTranslation();
  const [view, setView] = useState<TopologyView>('network');
  const [groupMode, setGroupMode] = useState<GroupMode>('hierarchy');
  const [filters, setFilters] = useState<TopologyFilters>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  const { data, isLoading, error } = useTopology(filters);

  const filteredNodes = useMemo(() => {
    if (!data) return [];
    const config = VIEW_CONFIG[view];
    return data.nodes.filter((node) =>
      config.categories.includes(node.category as TopologyCategory)
    );
  }, [data, view]);

  const filteredEdges = useMemo(() => {
    if (!data) return [];
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    return data.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  }, [data, filteredNodes]);

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Desktop sidebar */}
      {!isMobile && (
        <div className="w-60 border-r bg-card p-4 h-full overflow-y-auto flex-shrink-0">
          <TopologyFilter filters={filters} onChange={setFilters} />
        </div>
      )}

      {/* Mobile drawer */}
      {isMobile && (
        <>
          {sidebarOpen && (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/50"
                onClick={() => setSidebarOpen(false)}
              />
              <div className="fixed inset-y-0 left-0 z-50 w-72 max-w-[80vw] animate-in slide-in-from-left duration-200">
                <div className="h-full border-r bg-card p-4 overflow-y-auto">
                  <TopologyFilter filters={filters} onChange={setFilters} />
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between p-3 md:p-4 border-b gap-2">
          <div className="flex items-center gap-2">
            {isMobile && (
              <Button variant="ghost" size="icon" onClick={toggleSidebar} className="shrink-0">
                {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            )}
            <h1 className="text-lg md:text-xl font-bold">{t('topology.title')}</h1>
          </div>
          <div className="flex items-center gap-3">
            <GroupModeSwitcher currentMode={groupMode} onChange={setGroupMode} />
            <ViewSwitcher currentView={view} onChange={setView} />
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 h-full min-h-0">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive m-3 md:m-4">
              <AlertCircle className="h-4 w-4" />
              {t('topology.loadFailed')}：{(error as Error).message}
            </div>
          )}
          <TopologyCanvas
            nodes={filteredNodes}
            edges={filteredEdges}
            isLoading={isLoading}
            groupMode={groupMode}
          />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd web-console && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web-console/src/pages/Topology.tsx
git commit -m "feat(topology): integrate GroupModeSwitcher in page"
```

---

### Task 9: Add i18n Translations

**Files:**
- Modify: `web-console/src/i18n/locales/zh.json`
- Modify: `web-console/src/i18n/locales/en.json`

- [ ] **Step 1: Add Chinese translations**

In `web-console/src/i18n/locales/zh.json`, find the `"topology"` section and add the new keys. Insert after `"emptyHint"` line and before the closing `}` of the topology section:

```json
    "groupMode": {
      "hierarchy": "层级",
      "semantic": "语义",
      "team": "团队",
      "cost": "成本"
    },
    "detailModal": {
      "overview": "概览",
      "metrics": "指标",
      "logs": "日志",
      "connections": "连接",
      "viewDetails": "跳转详情"
    }
```

- [ ] **Step 2: Add English translations**

In `web-console/src/i18n/locales/en.json`, find the `"topology"` section and add the new keys. Insert after `"emptyHint"` line and before the closing `}` of the topology section:

```json
    "groupMode": {
      "hierarchy": "Hierarchy",
      "semantic": "Semantic",
      "team": "Team",
      "cost": "Cost"
    },
    "detailModal": {
      "overview": "Overview",
      "metrics": "Metrics",
      "logs": "Logs",
      "connections": "Connections",
      "viewDetails": "View Details"
    }
```

- [ ] **Step 3: Verify typecheck passes**

Run: `cd web-console && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add web-console/src/i18n/locales/zh.json web-console/src/i18n/locales/en.json
git commit -m "feat(topology): add i18n for group modes and detail modal"
```

---

### Task 10: Extend Demo Data

**Files:**
- Modify: `web-console/src/lib/demo/mock-data.ts`

- [ ] **Step 1: Add cloudAccountId and monthlyCost to demo nodes**

In `web-console/src/lib/demo/mock-data.ts`, find the `getDemoTopology` function. The `cloudAccountId` is already set on most nodes. Add `monthlyCost` to the instance data generation.

Find the instance creation block (around line 630-640) and modify the `data` field:

Change:
```typescript
data: { cpu: pick([1, 2, 4, 8], rand), memoryMb: pick([2048, 4096, 8192, 16384], rand), cloudAccountId: subnet.cloudAccountId },
```

To:
```typescript
data: { cpu: pick([1, 2, 4, 8], rand), memoryMb: pick([2048, 4096, 8192, 16384], rand), cloudAccountId: subnet.cloudAccountId, monthlyCost: Math.floor(rand() * 500 + 50) },
```

Similarly, add `monthlyCost` to database nodes (around line 720-730). Find the database data field and add:

Change:
```typescript
data: { engine: pick(['mysql', 'postgresql', 'mongodb'], rand), engineVersion: '8.0', cloudAccountId },
```

To:
```typescript
data: { engine: pick(['mysql', 'postgresql', 'mongodb'], rand), engineVersion: '8.0', cloudAccountId, monthlyCost: Math.floor(rand() * 2000 + 200) },
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd web-console && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add web-console/src/lib/demo/mock-data.ts
git commit -m "feat(topology): extend demo data with monthlyCost for cost grouping"
```

---

### Task 11: Final Verification and Build

- [ ] **Step 1: Full typecheck**

Run: `cd web-console && npx tsc -b --noEmit`
Expected: No errors

- [ ] **Step 2: Build**

Run: `cd web-console && npm run build`
Expected: Build succeeds

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(topology): address typecheck/build issues"
```

---

## Spec Coverage Check

| Spec Requirement | Task |
|-----------------|------|
| ClusterNode with collapse/expand | Task 4 (ClusterNode) + Task 7 (Canvas integration) |
| Multi-mode grouping (4 modes) | Task 3 (clustering hook) + Task 5 (switcher) + Task 8 (page) |
| Centered modal with tabs | Task 6 (Modal + 4 tabs) |
| Framer Motion animations | Task 6 (Modal uses motion.div) |
| Web Worker dagre layout | Task 2 (Worker) + Task 7 (Canvas integration) |
| Demo data extension | Task 10 |
| i18n | Task 9 |
| Type extensions | Task 1 |
