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
 * Each level only shows its direct children in the next hierarchy level.
 * Providers are virtual nodes that group VPCs.
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

    // Group VPCs by provider (cloudAccountId)
    const vpcNodes = nodes.filter(n => n.type === 'vpc');
    const providerGroups = new Map<string, TopologyNode[]>();
    for (const vpc of vpcNodes) {
      const provider = String(vpc.data?.cloudAccountId || vpc.provider || 'unknown');
      if (!providerGroups.has(provider)) providerGroups.set(provider, []);
      providerGroups.get(provider)!.push(vpc);
    }

    // Build tree for a single VPC: vpc → subnet → instance
    function buildSubtree(nodeId: string, visited: Set<string>): TreeNode | null {
      if (visited.has(nodeId)) return null;
      visited.add(nodeId);

      const node = nodeMap.get(nodeId);
      if (!node) return null;

      const myLevel = getHierarchyLevel(node.type);
      const nextLevel = myLevel + 1;

      const allChildIds = childrenOf.get(nodeId) || [];
      const children: TreeNode[] = [];
      let instanceCount = 0;

      for (const childId of allChildIds) {
        const childNode = nodeMap.get(childId);
        if (!childNode) continue;

        const childLevel = getHierarchyLevel(childNode.type);

        if (childNode.type === 'instance') {
          instanceCount++;
          continue;
        }

        // Only include children at the next hierarchy level
        if (childLevel === nextLevel) {
          const childTree = buildSubtree(childId, visited);
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

    // Build provider-level tree: provider → vpc → subnet → instance
    const tree: TreeNode[] = [];
    for (const [provider, vpcs] of providerGroups) {
      const vpcTrees: TreeNode[] = [];
      let totalInstances = 0;
      const visited = new Set<string>();

      for (const vpc of vpcs) {
        const vpcTree = buildSubtree(vpc.id, visited);
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
