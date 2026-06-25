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
  useReactFlow,
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
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
  const { fitView } = useReactFlow();
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null);
  const [collapsedClusters, setCollapsedClusters] = useState<Set<string>>(new Set());
  const [expandedClusterId, setExpandedClusterId] = useState<string | null>(null);
  const dagreWorkerRef = useRef<Worker | null>(null);
  const forceWorkerRef = useRef<Worker | null>(null);
  const [layoutPositions, setLayoutPositions] = useState<Record<string, { x: number; y: number }>>({});

  // Compute clusters
  const { visibleNodes, visibleEdges, clusters } = useTopologyCluster(
    nodes, edges, groupMode, collapsedClusters
  );

  useEffect(() => {
    setCollapsedClusters(new Set());
    setExpandedClusterId(null);
  }, [groupMode]);

  const expandedCluster = useMemo(() => {
    if (!expandedClusterId) return null;
    return clusters.find(c => c.id === expandedClusterId) || null;
  }, [expandedClusterId, clusters]);

  const isContainmentView = !!expandedCluster;

  // Determine which nodes/edges to display
  const { displayNodes, displayEdges } = useMemo(() => {
    if (expandedCluster) {
      const childIds = new Set(expandedCluster.childNodeIds);
      const childNodes = nodes.filter(n => childIds.has(n.id));
      const childEdges = edges.filter(e => childIds.has(e.source) && childIds.has(e.target));
      return { displayNodes: childNodes, displayEdges: childEdges };
    }
    return { displayNodes: visibleNodes, displayEdges: visibleEdges };
  }, [expandedCluster, nodes, edges, visibleNodes, visibleEdges]);

  // Initialize both workers
  useEffect(() => {
    dagreWorkerRef.current = new Worker(
      new URL('@/workers/dagre-layout.worker.ts', import.meta.url),
      { type: 'module' }
    );
    forceWorkerRef.current = new Worker(
      new URL('@/workers/force-layout.worker.ts', import.meta.url),
      { type: 'module' }
    );
    return () => {
      dagreWorkerRef.current?.terminate();
      forceWorkerRef.current?.terminate();
    };
  }, []);

  // Run layout: dagre for overview, force for containment
  useEffect(() => {
    setLayoutPositions({});

    if (displayNodes.length === 0) return;

    if (isContainmentView) {
      // Force-directed for containment exploration
      const worker = forceWorkerRef.current;
      if (!worker) return;

      const handler = (e: MessageEvent) => {
        setLayoutPositions(e.data.positions);
      };
      worker.addEventListener('message', handler);
      worker.postMessage({
        nodes: displayNodes.map(n => ({ id: n.id })),
        edges: displayEdges.map(e => ({ source: e.source, target: e.target })),
        width: 1200,
        height: 800,
      });
      return () => worker.removeEventListener('message', handler);
    } else {
      // Dagre hierarchical for overview
      const worker = dagreWorkerRef.current;
      if (!worker) return;

      const handler = (e: MessageEvent) => {
        setLayoutPositions(e.data.positions);
      };
      worker.addEventListener('message', handler);
      worker.postMessage({
        nodes: displayNodes.map(n => ({
          id: n.id,
          width: n.type === 'cluster' ? 200 : 120,
          height: n.type === 'cluster' ? 100 : 80,
        })),
        edges: displayEdges.map(e => ({ source: e.source, target: e.target })),
        rankdir: 'TB',
        nodesep: 80,
        ranksep: 120,
      });
      return () => worker.removeEventListener('message', handler);
    }
  }, [displayNodes, displayEdges, isContainmentView]);

  // Convert to React Flow format
  const { flowNodes, flowEdges } = useMemo(() => {
    const fn: Node[] = displayNodes.map((node) => {
      const pos = layoutPositions[node.id];
      const isCluster = node.type === 'cluster';
      return {
        id: node.id,
        type: isCluster ? 'cluster' : 'resource',
        position: pos
          ? { x: pos.x - (isCluster ? 100 : 60), y: pos.y - (isCluster ? 50 : 40) }
          : { x: 0, y: 0 },
        data: isCluster
          ? (node.data as unknown as Record<string, unknown>)
          : (node as unknown as Record<string, unknown>),
      };
    });

    const fe: Edge[] = displayEdges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'resource',
      data: edge as unknown as Record<string, unknown>,
    }));

    return { flowNodes: fn, flowEdges: fe };
  }, [displayNodes, displayEdges, layoutPositions]);

  const [flowNodesState, setNodes, onNodesChange] = useNodesState(flowNodes);
  const [flowEdgesState, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  useEffect(() => {
    setNodes(flowNodes);
    setEdges(flowEdges);
  }, [flowNodes, flowEdges, setNodes, setEdges]);

  useEffect(() => {
    if (Object.keys(layoutPositions).length > 0) {
      const timer = setTimeout(() => fitView({ padding: 0.15, duration: 500 }), 150);
      return () => clearTimeout(timer);
    }
  }, [layoutPositions, fitView]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      if (node.type === 'cluster') {
        if (expandedClusterId) {
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
          const clusterData = node.data as unknown as ClusterData;
          setExpandedClusterId(clusterData.id);
        }
      } else {
        setSelectedNode(node.data as unknown as TopologyNode);
      }
    },
    [expandedClusterId]
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

  const handleBackToOverview = useCallback(() => {
    setExpandedClusterId(null);
  }, []);

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
    <div className="flex-1 flex h-full relative">
      {/* Breadcrumb / back button */}
      <AnimatePresence>
        {expandedCluster && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute top-3 left-3 z-10 flex items-center gap-2"
          >
            <Button
              variant="outline"
              size="sm"
              onClick={handleBackToOverview}
              className="gap-1.5 bg-white/90 backdrop-blur-sm shadow-md border-white/40 hover:bg-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              总览
            </Button>
            <div className="flex items-center gap-1.5 bg-white/90 backdrop-blur-sm shadow-md border border-white/40 rounded-lg px-3 py-1.5 text-xs text-gray-600">
              <Layers className="h-3.5 w-3.5 text-gray-400" />
              <span className="font-medium">{expandedCluster.label}</span>
              <span className="text-gray-400">·</span>
              <span>{expandedCluster.childNodeIds.length} 个节点</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

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
          fitViewOptions={{ padding: 0.15 }}
          attributionPosition="bottom-left"
          minZoom={0.1}
          maxZoom={3}
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
