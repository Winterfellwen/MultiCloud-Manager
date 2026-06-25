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

  const { visibleNodes, visibleEdges } = useTopologyCluster(
    nodes, edges, groupMode, collapsedClusters
  );

  useEffect(() => {
    setCollapsedClusters(new Set());
  }, [groupMode]);

  useEffect(() => {
    workerRef.current = new Worker(
      new URL('@/workers/dagre-layout.worker.ts', import.meta.url),
      { type: 'module' }
    );
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

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
