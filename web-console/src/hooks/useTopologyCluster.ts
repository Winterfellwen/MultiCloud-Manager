import { useMemo } from 'react';
import type { TopologyNode, TopologyEdge, TopologyCategory, GroupMode, ClusterData } from '@/types/topology';

interface ClusterResult {
  clusters: ClusterData[];
  childToCluster: Map<string, string>;
}

export function computeClusters(
  nodes: TopologyNode[],
  groupMode: GroupMode,
  clusterThreshold: number = 50
): ClusterResult {
  if (nodes.length <= clusterThreshold) {
    return { clusters: [], childToCluster: new Map() };
  }

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
      continue;
    }

    const clusterId = `cluster-${groupMode}-${clusterIdx++}`;
    const statusSummary: Record<string, number> = {};
    for (const n of groupNodes) {
      statusSummary[n.status] = (statusSummary[n.status] || 0) + 1;
    }

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
    const { clusters, childToCluster } = computeClusters(nodes, groupMode);

    for (const c of clusters) {
      c.collapsed = collapsedClusters.has(c.id);
    }

    const visibleNodes: TopologyNode[] = [];
    const visibleNodeIds = new Set<string>();

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

    for (const node of nodes) {
      const clusterId = childToCluster.get(node.id);
      if (clusterId) {
        const cluster = clusters.find(c => c.id === clusterId);
        if (cluster && cluster.collapsed) {
          continue;
        }
      }
      visibleNodes.push(node);
      visibleNodeIds.add(node.id);
    }

    const visibleEdges = edges.filter(
      e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
    );

    return { visibleNodes, visibleEdges, clusters };
  }, [nodes, edges, groupMode, collapsedClusters]);
}
