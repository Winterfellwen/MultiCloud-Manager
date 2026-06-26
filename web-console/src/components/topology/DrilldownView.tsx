import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ResourceNode } from './ResourceNode';
import { ResourceEdge } from './ResourceEdge';
import { NodeDetailModal } from './NodeDetailModal';
import { ClusterNode } from './ClusterNode';
import { KeyboardShortcutOverlay } from './KeyboardShortcutOverlay';
import { type TopologyNode, type TopologyEdge } from '@/types/topology';
import type { TreeNode } from '@/hooks/useTopologyTree';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

const nodeTypes = { resource: ResourceNode, cluster: ClusterNode };
const edgeTypes = { resource: ResourceEdge };

interface DrilldownViewProps {
  currentNode: TreeNode;
  path: Array<{ id: string; label: string; count: number }>;
  onDrilldown: (nodeId: string) => void;
  onPathClick: (index: number) => void;
  allEdges: TopologyEdge[];
  allNodes: TopologyNode[];
  searchQuery?: string;
}

const NODE_W = 160;
const NODE_H = 100;
const GRID_GAP_X = 36;
const GRID_GAP_Y = 28;
const GRID_COLS = 5;
const PARENT_X = -200;

export function DrilldownView({ currentNode, path, onDrilldown, onPathClick, allEdges, allNodes, searchQuery = '' }: DrilldownViewProps) {
  const { fitView } = useReactFlow();
  const [layoutPositions, setLayoutPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null);
  const [focusedIdx, setFocusedIdx] = useState<number>(-1);
  const [showShortcuts, setShowShortcuts] = useState(false);

  const isRoot = path.length === 0;
  const displayNodes = useMemo(() => currentNode?.children.map(c => c.node) ?? [], [currentNode]);

  const filteredNodes = useMemo(() => {
    if (!searchQuery) return displayNodes;
    const q = searchQuery.toLowerCase();
    return displayNodes.filter(n =>
      (n.label || '').toLowerCase().includes(q) ||
      (n.type || '').toLowerCase().includes(q) ||
      (n.provider || '').toLowerCase().includes(q)
    );
  }, [displayNodes, searchQuery]);

  const matchedIds = useMemo(() => {
    return new Set(filteredNodes.map(n => n.id));
  }, [filteredNodes]);

  // All levels: horizontal grid
  useEffect(() => {
    const positions: Record<string, { x: number; y: number }> = {};
    displayNodes.forEach((node, i) => {
      const col = i % GRID_COLS;
      const row = Math.floor(i / GRID_COLS);
      positions[node.id] = {
        x: col * (NODE_W + GRID_GAP_X),
        y: row * (NODE_H + GRID_GAP_Y),
      };
    });
    setLayoutPositions(positions);
  }, [displayNodes]);

  useEffect(() => {
    if (Object.keys(layoutPositions).length > 0) {
      const timer = setTimeout(() => fitView({ padding: 0.15, duration: 400 }), 80);
      return () => clearTimeout(timer);
    }
  }, [layoutPositions, fitView]);

  const { flowNodes, flowEdges } = useMemo(() => {
    const fn: Node[] = displayNodes.map((node, idx) => {
      const pos = layoutPositions[node.id];
      const treeNode = currentNode?.children.find(c => c.id === node.id);
      return {
        id: node.id,
        type: 'resource',
        position: pos ? { x: pos.x, y: pos.y } : { x: 0, y: 0 },
        data: {
          ...node,
          data: {
            ...node.data,
            instanceCount: treeNode?.instanceCount || 0,
            descendantCount: treeNode?.descendantCount || 0,
            hasChildren: (treeNode?.children.length || 0) > 0,
          },
        } as unknown as Record<string, unknown>,
        style: {
          opacity: searchQuery && !matchedIds.has(node.id) ? 0.2 : 1,
          outline: idx === focusedIdx ? '2px solid #3b82f6' : 'none',
          outlineOffset: '2px',
          borderRadius: '16px',
          transition: 'opacity 0.2s, outline 0.1s',
        },
      };
    });

    // Virtual parent Y: center of all child nodes
    const parentY = displayNodes.length > 0
      ? Math.max(...displayNodes.map((_, i) => {
          const row = Math.floor(i / GRID_COLS);
          return row * (NODE_H + GRID_GAP_Y) + NODE_H / 2;
        })) / 2
      : 0;

    // Virtual parent node (not rendered, just for edge anchor)
    const virtualParentNode: Node = {
      id: 'virtual-parent',
      type: 'resource',
      position: { x: PARENT_X, y: parentY },
      data: { label: '', type: 'virtual' },
      selectable: false,
      draggable: false,
    };

    // Add virtual parent to nodes
    const fnWithParent = [virtualParentNode, ...fn];

    // Edge array: virtual parent → each child
    const fe: Edge[] = displayNodes.map(node => ({
      id: `edge-parent-${node.id}`,
      source: 'virtual-parent',
      target: node.id,
      type: 'resource',
      data: { type: 'contains', label: '' } as unknown as Record<string, unknown>,
    }));

    return { flowNodes: fnWithParent, flowEdges: fe };
  }, [displayNodes, layoutPositions, currentNode, searchQuery, matchedIds, focusedIdx]);

  const [flowNodesState, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [flowEdgesState, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowNodes, flowEdges, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.id === 'virtual-parent') return;
      const topologyNode = node.data as unknown as TopologyNode;
      const treeNode = currentNode?.children.find(c => c.id === topologyNode.id);

      if (topologyNode.type === 'instance') {
        setSelectedNode(topologyNode);
      } else if (treeNode && treeNode.children.length > 0) {
        onDrilldown(topologyNode.id);
      } else {
        setSelectedNode(topologyNode);
      }
    },
    [currentNode, onDrilldown]
  );

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const cols = GRID_COLS;
    const total = displayNodes.length;

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        setFocusedIdx(prev => Math.min(prev + 1, total - 1));
        break;
      case 'ArrowLeft':
        e.preventDefault();
        setFocusedIdx(prev => Math.max(prev - 1, 0));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIdx(prev => Math.min(prev + cols, total - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIdx(prev => Math.max(prev - cols, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (focusedIdx >= 0 && focusedIdx < total) {
          const node = displayNodes[focusedIdx];
          const treeNode = currentNode?.children.find(c => c.id === node.id);
          if (node.type === 'instance') {
            setSelectedNode(node);
          } else if (treeNode && treeNode.children.length > 0) {
            onDrilldown(node.id);
          }
        }
        break;
      case 'Escape':
        e.preventDefault();
        if (path.length > 0) onPathClick(path.length - 1);
        break;
      case '?':
        e.preventDefault();
        setShowShortcuts(prev => !prev);
        break;
    }
  }, [displayNodes, focusedIdx, currentNode, path, onDrilldown, onPathClick]);

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-4 py-2 border-b bg-gray-50/80 text-sm overflow-x-auto">
        {isRoot ? (
          <div className="flex items-center gap-1.5 text-gray-900 font-medium">
            <Globe className="h-3.5 w-3.5 text-blue-500" />
            <span>{currentNode.node.label}</span>
            <span className="text-[10px] text-gray-400 font-normal">
              ({currentNode?.children.length ?? 0})
            </span>
          </div>
        ) : (
          <>
            {/* Root breadcrumb */}
            <motion.div
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center gap-1 shrink-0"
            >
              <button
                onClick={() => onPathClick(-1)}
                className="px-2 py-0.5 rounded-md transition-colors font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                aria-label="Navigate to root"
              >
                <Globe className="inline h-3 w-3 mr-1 -mt-0.5" />
                Cloud Providers
              </button>
            </motion.div>
            {path.map((segment, i) => (
              <motion.div
                key={segment.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: (i + 1) * 0.05 }}
                className="flex items-center gap-1 shrink-0"
              >
                <ChevronRight className="h-3 w-3 text-gray-300" />
                <button
                  onClick={() => onPathClick(i)}
                  className={cn(
                    'px-2 py-0.5 rounded-md transition-colors font-medium',
                    i === path.length - 1
                      ? 'text-gray-900 bg-white shadow-sm border border-gray-200'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
                  )}
                  aria-label={`Navigate to ${segment.label}`}
                >
                  {segment.label}
                  {segment.count > 0 && (
                    <span className="ml-1 text-[10px] text-gray-400">({segment.count})</span>
                  )}
                </button>
              </motion.div>
            ))}
          </>
        )}
      </div>

      {/* Canvas */}
      <AnimatePresence mode="wait">
        <motion.div
          key={currentNode.id}
          className="flex-1 h-full"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          role="tree"
          aria-label="Topology hierarchy"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
        >
          <ReactFlow
            nodes={flowNodesState}
            edges={flowEdgesState}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.3}
            maxZoom={2}
            nodesDraggable={false}
          />
        </motion.div>
      </AnimatePresence>

      {/* Instance detail modal */}
      <NodeDetailModal
        node={selectedNode}
        allEdges={allEdges}
        allNodes={allNodes}
        onClose={() => setSelectedNode(null)}
      />

      {/* Keyboard shortcut overlay */}
      <KeyboardShortcutOverlay open={showShortcuts} onClose={() => setShowShortcuts(false)} />
    </div>
  );
}
