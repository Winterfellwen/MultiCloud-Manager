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
 * Each level only shows its direct children in the next level.
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

    // Find root nodes: never a child in 'contains' edge
    const childIds = new Set(edges.filter(e => e.type === 'contains').map(e => e.source));
    const rootNodes = nodes.filter(n => !childIds.has(n.id));

    // Group roots by provider
    const providerGroups = new Map<string, TopologyNode[]>();
    for (const root of rootNodes) {
      const provider = String(root.data?.cloudAccountId || root.provider || 'unknown');
      if (!providerGroups.has(provider)) providerGroups.set(provider, []);
      providerGroups.get(provider)!.push(root);
    }

    // Build tree: each level only shows children at the NEXT hierarchy level
    function buildTree(nodeId: string, parentLevel: number, visited = new Set<string>()): TreeNode | null {
      if (visited.has(nodeId)) return null;
      visited.add(nodeId);

      const node = nodeMap.get(nodeId);
      if (!node) return null;

      const myLevel = getHierarchyLevel(node.type);
      const nextLevel = parentLevel + 1;

      const allChildIds = childrenOf.get(nodeId) || [];
      const children: TreeNode[] = [];
      let instanceCount = 0;

      for (const childId of allChildIds) {
        const childNode = nodeMap.get(childId);
        if (!childNode) continue;

        const childLevel = getHierarchyLevel(childNode.type);

        // Count instances regardless of whether they appear as children
        if (childNode.type === 'instance') {
          instanceCount++;
          continue;
        }

        // Only include children that match the next hierarchy level
        if (childLevel === nextLevel) {
          const childTree = buildTree(childId, myLevel, visited);
          if (childTree) {
            children.push(childTree);
            instanceCount += childTree.instanceCount;
          }
        } else if (childLevel > nextLevel) {
          // Skip: too deep for this level
          continue;
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

    // Build provider-level tree nodes
    const tree: TreeNode[] = [];
    for (const [provider, roots] of providerGroups) {
      const childTrees: TreeNode[] = [];
      let totalInstances = 0;

      for (const root of roots) {
        // Provider level (parentLevel=-1) → children at level 0 (provider/vpc)
        const treeNode = buildTree(root.id, -1);
        if (treeNode) {
          // Only include VPCs at provider level, not other resource types
          if (treeNode.node.type === 'vpc') {
            childTrees.push(treeNode);
            totalInstances += treeNode.instanceCount;
          }
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
        children: childTrees,
        descendantCount: childTrees.reduce((sum, c) => sum + 1 + c.descendantCount, 0),
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
