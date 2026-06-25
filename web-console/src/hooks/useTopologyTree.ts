import { useMemo } from 'react';
import type { TopologyNode, TopologyEdge } from '@/types/topology';

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
  edges: TopologyEdge[]
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

    return { tree, nodeMap };
  }, [nodes, edges]);
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
