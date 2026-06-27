import { useMemo } from 'react';
import type { TopologyNode, TopologyEdge, GroupMode } from '@/types/topology';

function getCostBracket(cost: number): string {
  if (cost <= 0) return 'free';
  if (cost <= 100) return 'low';
  if (cost <= 300) return 'mid';
  return 'high';
}

const COST_BRACKET_LABELS: Record<string, string> = {
  free: 'Free ($0)',
  low: 'Low ($1-100)',
  mid: 'Mid ($101-300)',
  high: 'High ($300+)',
};

const COST_BRACKET_COLORS: Record<string, string> = {
  free: '#9ca3af',
  low: '#10b981',
  mid: '#f59e0b',
  high: '#ef4444',
};

export interface TreeNode {
  id: string;
  node: TopologyNode;
  children: TreeNode[];
  descendantCount: number;
  instanceCount: number;
}

const HIERARCHY = ['provider', 'vpc', 'subnet', 'instance'] as const;

function getHierarchyLevel(type: string): number {
  return HIERARCHY.indexOf(type as typeof HIERARCHY[number]);
}

/**
 * Build a strict hierarchy tree:
 * provider → vpc → subnet → instance
 *
 * - Providers are virtual nodes grouping VPCs
 * - Each level shows only children at the next hierarchy level
 * - Instances are children of subnets (so subnet click drills down to instances)
 */
export function useTopologyTree(
  nodes: TopologyNode[],
  edges: TopologyEdge[],
  groupMode: GroupMode = 'hierarchy'
): { tree: TreeNode[]; nodeMap: Map<string, TopologyNode> } {
  return useMemo(() => {
    const nodeMap = new Map(nodes.map(n => [n.id, n]));

    // Build parent→children from 'contains' edges (child.source → parent.target)
    const childrenOf = new Map<string, string[]>();
    for (const e of edges) {
      if (e.type === 'contains') {
        if (!childrenOf.has(e.target)) childrenOf.set(e.target, []);
        childrenOf.get(e.target)!.push(e.source);
      }
    }

    // Build subtree recursively
    function buildSubtree(nodeId: string, myLevel: number, visited: Set<string>): TreeNode | null {
      if (visited.has(nodeId)) return null;
      visited.add(nodeId);

      const node = nodeMap.get(nodeId);
      if (!node) return null;

      const nextLevel = myLevel + 1;
      const allChildIds = childrenOf.get(nodeId) || [];
      const children: TreeNode[] = [];
      let instanceCount = 0;

      for (const childId of allChildIds) {
        const childNode = nodeMap.get(childId);
        if (!childNode) continue;

        const childLevel = getHierarchyLevel(childNode.type);

        if (childNode.type === 'instance') {
          // Instances are always children of their parent subnet
          instanceCount++;
          children.push({
            id: childId,
            node: childNode,
            children: [],
            descendantCount: 0,
            instanceCount: 0,
          });
          continue;
        }

        // Only include children at the next hierarchy level
        if (childLevel === nextLevel) {
          const childTree = buildSubtree(childId, myLevel + 1, visited);
          if (childTree) {
            children.push(childTree);
            instanceCount += childTree.instanceCount;
          }
        }
      }

      return {
        id: nodeId,
        node,
        children,
        descendantCount: children.reduce((sum, c) => sum + 1 + c.descendantCount, 0),
        instanceCount,
      };
    }

    // Group ALL nodes by provider (cloudAccountId) to find all providers
    const providerGroups = new Map<string, TopologyNode[]>();
    for (const node of nodes) {
      const provider = String(node.data?.cloudAccountId || node.provider || 'unknown');
      if (!providerGroups.has(provider)) providerGroups.set(provider, []);
      providerGroups.get(provider)!.push(node);
    }

    // Build provider-level tree: provider → vpc → subnet → instance
    const tree: TreeNode[] = [];
    for (const [provider, providerNodes] of providerGroups) {
      // Find VPCs under this provider
      const vpcNodes = providerNodes.filter(n => n.type === 'vpc');
      const vpcTrees: TreeNode[] = [];
      let totalInstances = 0;
      const visited = new Set<string>();

      for (const vpc of vpcNodes) {
        const vpcTree = buildSubtree(vpc.id, getHierarchyLevel('vpc'), visited);
        if (vpcTree) {
          vpcTrees.push(vpcTree);
          totalInstances += vpcTree.instanceCount;
        }
      }

      const providerNode: TopologyNode = {
        id: `provider-${provider}`,
        type: 'provider',
        label: provider.replace('demo-', '').replace('-account', ''),
        provider: '',
        region: '',
        status: 'active',
        category: 'network',
        icon: 'globe',
        data: { cloudAccountId: provider },
      };

      tree.push({
        id: `provider-${provider}`,
        node: providerNode,
        children: vpcTrees,
        descendantCount: vpcTrees.reduce((sum, c) => sum + 1 + c.descendantCount, 0),
        instanceCount: totalInstances,
      });
    }

    if (groupMode === 'cost') {
      const groups = new Map<string, TopologyNode[]>();
      for (const node of nodes) {
        if (node.type === 'instance') {
          const cost = (node.data?.monthlyCost as number) || 0;
          const bracket = getCostBracket(cost);
          if (!groups.has(bracket)) groups.set(bracket, []);
          groups.get(bracket)!.push(node);
        }
      }
      const tree: TreeNode[] = [];
      for (const [bracket, bracketNodes] of groups) {
        const providerNode: TopologyNode = {
          id: `cost-${bracket}`,
          type: 'provider',
          label: COST_BRACKET_LABELS[bracket],
          provider: '',
          region: '',
          status: 'active',
          category: 'network',
          icon: 'globe',
          data: { costBracket: bracket, color: COST_BRACKET_COLORS[bracket] },
        };
        tree.push({
          id: `cost-${bracket}`,
          node: providerNode,
          children: bracketNodes.map(n => ({
            id: n.id, node: n, children: [], descendantCount: 0, instanceCount: 0,
          })),
          descendantCount: bracketNodes.length,
          instanceCount: bracketNodes.length,
        });
      }
      return { tree, nodeMap };
    }

    if (groupMode === 'resourceType') {
      const groups = new Map<string, TopologyNode[]>();
      for (const node of nodes) {
        if (node.type === 'instance') {
          const svc = (node.data?.service as string) || 'other';
          if (!groups.has(svc)) groups.set(svc, []);
          groups.get(svc)!.push(node);
        }
      }
      const tree: TreeNode[] = [];
      for (const [svc, svcNodes] of groups) {
        const providerNode: TopologyNode = {
          id: `svc-${svc}`,
          type: 'provider',
          label: svc,
          provider: '',
          region: '',
          status: 'active',
          category: 'network',
          icon: 'layers',
          data: {},
        };
        tree.push({
          id: `svc-${svc}`,
          node: providerNode,
          children: svcNodes.map(n => ({
            id: n.id, node: n, children: [], descendantCount: 0, instanceCount: 0,
          })),
          descendantCount: svcNodes.length,
          instanceCount: svcNodes.length,
        });
      }
      return { tree, nodeMap };
    }

    if (groupMode === 'team') {
      const groups = new Map<string, TopologyNode[]>();
      for (const node of nodes) {
        if (node.type === 'instance') {
          const team = (node.data?.team as string) || 'unassigned';
          if (!groups.has(team)) groups.set(team, []);
          groups.get(team)!.push(node);
        }
      }
      const tree: TreeNode[] = [];
      for (const [team, teamNodes] of groups) {
        const providerNode: TopologyNode = {
          id: `team-${team}`,
          type: 'provider',
          label: team,
          provider: '',
          region: '',
          status: 'active',
          category: 'network',
          icon: 'users',
          data: {},
        };
        tree.push({
          id: `team-${team}`,
          node: providerNode,
          children: teamNodes.map(n => ({
            id: n.id, node: n, children: [], descendantCount: 0, instanceCount: 0,
          })),
          descendantCount: teamNodes.length,
          instanceCount: teamNodes.length,
        });
      }
      return { tree, nodeMap };
    }

    return { tree, nodeMap };
  }, [nodes, edges, groupMode]);
}

/**
 * Get children of a node in the tree for drill-down view.
 */
export function getTreeChildren(
  tree: TreeNode[],
  currentPath: string[]
): TreeNode | null {
  let current: TreeNode | null = null;

  for (const treeNode of tree) {
    if (treeNode.id === currentPath[0]) {
      current = treeNode;
      break;
    }
  }

  if (!current) return null;

  for (let i = 1; i < currentPath.length; i++) {
    const next: TreeNode | undefined = current!.children.find((c: TreeNode) => c.id === currentPath[i]);
    if (!next) return null;
    current = next;
  }

  return current;
}
