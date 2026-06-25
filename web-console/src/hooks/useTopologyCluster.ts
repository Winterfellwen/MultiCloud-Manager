import { useMemo } from 'react';
import type { TopologyNode, TopologyEdge, GroupMode, ClusterData } from '@/types/topology';

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
    if (groupNodes.length <= 3) continue;

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
    let majorityCategory = 'compute';
    for (const [cat, count] of categoryCounts) {
      if (count > maxCount) { maxCount = count; majorityCategory = cat; }
    }

    let label: string;
    switch (groupMode) {
      case 'hierarchy':
        label = `${groupNodes[0].type} (${groupNodes.length})`;
        break;
      case 'semantic': {
        const m: Record<string, string> = { compute: '计算', storage: '存储', database: '数据库', network: '网络', security: '安全', cdn: 'CDN', container: '容器', ai: 'AI 服务' };
        label = `${m[majorityCategory] || majorityCategory} (${groupNodes.length})`;
        break;
      }
      default:
        label = `${key} (${groupNodes.length})`;
    }

    clusters.push({
      id: clusterId, label, groupMode,
      childNodeIds: groupNodes.map(n => n.id),
      collapsed: true, statusSummary,
      category: majorityCategory as any,
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
        if (cluster && cluster.collapsed) continue;
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

/**
 * Summarized view: show only infrastructure nodes (non-instance),
 * annotate each with connected instance count.
 */
export function useTopologySummary(
  nodes: TopologyNode[],
  edges: TopologyEdge[],
  expandedNodeId: string | null
): { summaryNodes: TopologyNode[]; summaryEdges: TopologyEdge[]; expandedChildren: TopologyNode[]; expandedChildEdges: TopologyEdge[] } {
  return useMemo(() => {
    // Instance types that get summarized
    const instanceTypes = new Set(['instance']);

    // Find parent→children mapping via edges (source=child, target=parent for 'contains')
    const childToParents = new Map<string, string[]>();
    for (const e of edges) {
      if (e.type === 'contains') {
        if (!childToParents.has(e.source)) childToParents.set(e.source, []);
        childToParents.get(e.source)!.push(e.target);
      }
    }

    // Find which nodes are instances
    const instanceNodes = new Set(nodes.filter(n => instanceTypes.has(n.type)).map(n => n.id));

    // For each non-instance node, count connected instances
    const instanceCountMap = new Map<string, number>();
    for (const instId of instanceNodes) {
      const parents = childToParents.get(instId) || [];
      for (const parentId of parents) {
        instanceCountMap.set(parentId, (instanceCountMap.get(parentId) || 0) + 1);
      }
      // Also count via edges (LB → instance, etc.)
      for (const e of edges) {
        if (e.source === instId && !instanceTypes.has(nodes.find(n => n.id === e.target)?.type || '')) {
          instanceCountMap.set(e.target, (instanceCountMap.get(e.target) || 0) + 1);
        }
        if (e.target === instId && !instanceTypes.has(nodes.find(n => n.id === e.source)?.type || '')) {
          instanceCountMap.set(e.source, (instanceCountMap.get(e.source) || 0) + 1);
        }
      }
    }

    // Summary nodes: all non-instance nodes
    const summaryNodes: TopologyNode[] = [];
    const summaryNodeIds = new Set<string>();

    for (const node of nodes) {
      if (instanceNodes.has(node.id)) continue;

      const count = instanceCountMap.get(node.id) || 0;
      const enrichedNode: TopologyNode = {
        ...node,
        data: {
          ...node.data,
          instanceCount: count,
        },
      };
      summaryNodes.push(enrichedNode);
      summaryNodeIds.add(node.id);
    }

    // Summary edges: only between summary nodes
    const summaryEdges = edges.filter(
      e => summaryNodeIds.has(e.source) && summaryNodeIds.has(e.target)
    );

    // Expanded children: instances connected to the expanded node
    let expandedChildren: TopologyNode[] = [];
    let expandedChildEdges: TopologyEdge[] = [];

    if (expandedNodeId && summaryNodeIds.has(expandedNodeId)) {
      // Find all instances that connect to this node (directly or via contains)
      const connectedInstanceIds = new Set<string>();

      // Direct contains edges
      for (const e of edges) {
        if (e.type === 'contains' && e.target === expandedNodeId && instanceNodes.has(e.source)) {
          connectedInstanceIds.add(e.source);
        }
        if (e.type === 'contains' && e.source === expandedNodeId && instanceNodes.has(e.target)) {
          connectedInstanceIds.add(e.target);
        }
      }

      // Other edge types (routes-to, protected-by, etc.)
      for (const e of edges) {
        if (e.source === expandedNodeId && instanceNodes.has(e.target)) {
          connectedInstanceIds.add(e.target);
        }
        if (e.target === expandedNodeId && instanceNodes.has(e.source)) {
          connectedInstanceIds.add(e.source);
        }
      }

      expandedChildren = nodes.filter(n => connectedInstanceIds.has(n.id));
      expandedChildEdges = edges.filter(
        e => (connectedInstanceIds.has(e.source) || connectedInstanceIds.has(e.target))
          && e.source !== expandedNodeId && e.target !== expandedNodeId
      );

      // Also add edges from instances back to the parent
      for (const instId of connectedInstanceIds) {
        expandedChildEdges.push({
          id: `expanded-${expandedNodeId}-${instId}`,
          source: instId,
          target: expandedNodeId,
          type: 'contains',
          label: '位于',
        });
      }
    }

    return { summaryNodes, summaryEdges, expandedChildren, expandedChildEdges };
  }, [nodes, edges, expandedNodeId]);
}
