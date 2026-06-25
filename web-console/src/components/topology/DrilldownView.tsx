import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { ResourceNode } from './ResourceNode';
import { ResourceEdge } from './ResourceEdge';
import { type TopologyNode, RESOURCE_TYPE_ROUTE_MAP } from '@/types/topology';
import type { TreeNode } from '@/hooks/useTopologyTree';
import { ChevronRight, Globe } from 'lucide-react';
import { cn } from '@/lib/utils';

const nodeTypes = { resource: ResourceNode };
const edgeTypes = { resource: ResourceEdge };

interface DrilldownViewProps {
  currentNode: TreeNode;
  path: Array<{ id: string; label: string; count: number }>;
  onDrilldown: (nodeId: string) => void;
  onPathClick: (index: number) => void;
}

export function DrilldownView({ currentNode, path, onDrilldown, onPathClick }: DrilldownViewProps) {
  const navigate = useNavigate();
  const [layoutPositions, setLayoutPositions] = useState<Record<string, { x: number; y: number }>>({});
  const workerRef = useRef<Worker | null>(null);

  // Display children
  const displayNodes = useMemo(() => {
    return currentNode.children.map(c => c.node);
  }, [currentNode]);

  // Create virtual tree edges from parent to each child for dagre layout
  const virtualEdges = useMemo(() => {
    return currentNode.children.map(child => ({
      id: `tree-${currentNode.id}-${child.id}`,
      source: currentNode.id,
      target: child.id,
    }));
  }, [currentNode]);

  // Initialize dagre worker
  useEffect(() => {
    workerRef.current = new Worker(
      new URL('@/workers/dagre-layout.worker.ts', import.meta.url),
      { type: 'module' }
    );
    return () => workerRef.current?.terminate();
  }, []);

  // Layout: left-to-right tree
  useEffect(() => {
    setLayoutPositions({});
    const worker = workerRef.current;
    if (!worker || displayNodes.length === 0) return;

    // Add a virtual root node for layout purposes
    const allNodes = [
      { id: currentNode.id, width: 120, height: 60 },
      ...displayNodes.map(n => ({ id: n.id, width: 160, height: 90 })),
    ];

    const handler = (e: MessageEvent) => {
      const { [currentNode.id]: _rootPos, ...positions } = e.data.positions;
      setLayoutPositions(positions);
    };
    worker.addEventListener('message', handler);
    worker.postMessage({
      nodes: allNodes,
      edges: virtualEdges,
      rankdir: 'LR',
      nodesep: 50,
      ranksep: 160,
    });
    return () => worker.removeEventListener('message', handler);
  }, [displayNodes, virtualEdges, currentNode.id]);

  // Convert to React Flow format
  const { flowNodes, flowEdges } = useMemo(() => {
    const fn: Node[] = displayNodes.map((node) => {
      const pos = layoutPositions[node.id];
      const treeNode = currentNode.children.find(c => c.id === node.id);
      return {
        id: node.id,
        type: 'resource',
        position: pos ? { x: pos.x - 80, y: pos.y - 45 } : { x: 0, y: 0 },
        data: {
          ...node,
          data: {
            ...node.data,
            instanceCount: treeNode?.instanceCount || 0,
            descendantCount: treeNode?.descendantCount || 0,
            hasChildren: (treeNode?.children.length || 0) > 0,
          },
        } as unknown as Record<string, unknown>,
      };
    });

    // Visual edges between siblings (through their common parent)
    // Skip for root level - no visible parent
    const fe: Edge[] = path.length > 0
      ? virtualEdges.map(e => ({
          id: e.id,
          source: e.source,
          target: e.target,
          type: 'resource',
          data: { type: 'contains', label: '' } as unknown as Record<string, unknown>,
        }))
      : [];

    return { flowNodes: fn, flowEdges: fe };
  }, [displayNodes, virtualEdges, layoutPositions, currentNode, path.length]);

  const [flowNodesState, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [flowEdgesState, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowNodes, flowEdges, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const topologyNode = node.data as unknown as TopologyNode;
      const treeNode = currentNode.children.find(c => c.id === topologyNode.id);

      if (treeNode && treeNode.children.length > 0) {
        onDrilldown(topologyNode.id);
      } else if (treeNode && treeNode.instanceCount > 0) {
        // Has instances - show instance detail page
        navigate(RESOURCE_TYPE_ROUTE_MAP[topologyNode.type] || '/resources');
      } else {
        navigate(RESOURCE_TYPE_ROUTE_MAP[topologyNode.type] || '/resources');
      }
    },
    [currentNode, onDrilldown, navigate]
  );

  return (
    <div className="flex-1 flex flex-col h-full">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 px-4 py-2 border-b bg-gray-50/80 text-sm overflow-x-auto">
        {path.length === 0 ? (
          <div className="flex items-center gap-1.5 text-gray-900 font-medium">
            <Globe className="h-3.5 w-3.5 text-blue-500" />
            <span>{currentNode.node.label}</span>
            <span className="text-[10px] text-gray-400 font-normal">
              ({currentNode.instanceCount} instances, {currentNode.children.length} children)
            </span>
          </div>
        ) : (
          path.map((segment, i) => (
            <div key={segment.id} className="flex items-center gap-1 shrink-0">
              {i > 0 && <ChevronRight className="h-3 w-3 text-gray-300" />}
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
                {i === 0 && <Globe className="inline h-3 w-3 mr-1 -mt-0.5" />}
                {segment.label}
                {segment.count > 0 && (
                  <span className="ml-1 text-[10px] text-gray-400">({segment.count})</span>
                )}
              </button>
            </div>
          ))
        )}
      </div>

      {/* Tree canvas */}
      <div className="flex-1 h-full">
        <ReactFlow
          nodes={flowNodesState}
          edges={flowEdgesState}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={2}
          nodesDraggable={false}
        />
      </div>
    </div>
  );
}
