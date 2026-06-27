import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toPng } from 'html-to-image';
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
import { NodeDetailModal } from './NodeDetailModal';
import { ClusterNode } from './ClusterNode';
import { useTopologySummary, useTopologyCluster } from '@/hooks/useTopologyCluster';
import { type TopologyNode, type TopologyEdge, type GroupMode, RESOURCE_TYPE_ROUTE_MAP } from '@/types/topology';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Server, Download } from 'lucide-react';
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
  const [expandedNodeId, setExpandedNodeId] = useState<string | null>(null);
  const [collapsedClusters, setCollapsedClusters] = useState<Set<string>>(new Set());
  const dagreWorkerRef = useRef<Worker | null>(null);
  const forceWorkerRef = useRef<Worker | null>(null);
  const [layoutPositions, setLayoutPositions] = useState<Record<string, { x: number; y: number }>>({});
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  const handleDownload = useCallback(async () => {
    if (!reactFlowWrapper.current || isDownloading) return;
    setIsDownloading(true);
    try {
      const dataUrl = await toPng(reactFlowWrapper.current, {
        backgroundColor: '#ffffff',
        quality: 0.95,
        pixelRatio: 2,
      });
      const link = document.createElement('a');
      link.download = `topology-${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Download failed:', err);
    } finally {
      setIsDownloading(false);
    }
  }, [isDownloading]);

  const { summaryNodes, summaryEdges, expandedChildren, expandedChildEdges } = useTopologySummary(
    nodes, edges, expandedNodeId
  );

  const { visibleNodes, visibleEdges } = useTopologyCluster(
    nodes, edges, groupMode, collapsedClusters
  );

  const isExpandedView = !!expandedNodeId;

  // Determine display data
  const { displayNodes, displayEdges } = useMemo(() => {
    if (isExpandedView && expandedChildren.length > 0) {
      // Find the parent node to show as anchor
      const parentNode = summaryNodes.find(n => n.id === expandedNodeId);
      const allNodes = parentNode ? [parentNode, ...expandedChildren] : expandedChildren;
      const allEdges = [...expandedChildEdges];

      // Add edges between expanded children
      for (const e of edges) {
        if (expandedChildren.some(n => n.id === e.source) && expandedChildren.some(n => n.id === e.target)) {
          allEdges.push(e);
        }
      }

      return { displayNodes: allNodes, displayEdges: allEdges };
    }
    if (groupMode !== 'hierarchy') {
      return { displayNodes: visibleNodes, displayEdges: visibleEdges };
    }
    return { displayNodes: summaryNodes, displayEdges: summaryEdges };
  }, [isExpandedView, expandedNodeId, expandedChildren, expandedChildEdges, summaryNodes, summaryEdges, edges, groupMode, visibleNodes, visibleEdges]);

  // Initialize workers
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

  // Run layout
  useEffect(() => {
    setLayoutPositions({});
    if (displayNodes.length === 0) return;

    if (isExpandedView) {
      const worker = forceWorkerRef.current;
      if (!worker) return;
      const handler = (e: MessageEvent) => setLayoutPositions(e.data.positions);
      worker.addEventListener('message', handler);
      worker.postMessage({
        nodes: displayNodes.map(n => ({ id: n.id })),
        edges: displayEdges.map(e => ({ source: e.source, target: e.target })),
        width: 1200,
        height: 800,
      });
      return () => worker.removeEventListener('message', handler);
    } else {
      const worker = dagreWorkerRef.current;
      if (!worker) return;
      const handler = (e: MessageEvent) => setLayoutPositions(e.data.positions);
      worker.addEventListener('message', handler);
      worker.postMessage({
        nodes: displayNodes.map(n => ({
          id: n.id,
          width: 140,
          height: 90,
        })),
        edges: displayEdges.map(e => ({ source: e.source, target: e.target })),
        rankdir: 'TB',
        nodesep: 100,
        ranksep: 140,
      });
      return () => worker.removeEventListener('message', handler);
    }
  }, [displayNodes, displayEdges, isExpandedView]);

  // Convert to React Flow format
  const { flowNodes, flowEdges } = useMemo(() => {
    const fn: Node[] = displayNodes.map((node) => {
      const pos = layoutPositions[node.id];
      return {
        id: node.id,
        type: node.type === 'cluster' ? 'cluster' : 'resource',
        position: pos ? { x: pos.x - 70, y: pos.y - 45 } : { x: 0, y: 0 },
        data: node as unknown as Record<string, unknown>,
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
      if (isExpandedView) {
        // In expanded view, click shows detail modal
        setSelectedNode(node.data as unknown as TopologyNode);
      } else {
        // In overview, check if this node has instances to expand
        const topologyNode = node.data as unknown as TopologyNode;
        
        // Handle cluster node toggle
        if (node.type === 'cluster') {
          setCollapsedClusters(prev => {
            const next = new Set(prev);
            if (next.has(node.id)) {
              next.delete(node.id);
            } else {
              next.add(node.id);
            }
            return next;
          });
          return;
        }
        
        const count = topologyNode.data?.instanceCount as number;
        if (count && count > 0) {
          setExpandedNodeId(topologyNode.id);
        } else {
          setSelectedNode(topologyNode);
        }
      }
    },
    [isExpandedView]
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const onNodeDoubleClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      const topologyNode = node.data as unknown as TopologyNode;
      const baseRoute = RESOURCE_TYPE_ROUTE_MAP[topologyNode.type] || '/resources';
      navigate(baseRoute);
    },
    [navigate]
  );

  const handleBackToOverview = useCallback(() => {
    setExpandedNodeId(null);
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

  const parentNode = expandedNodeId ? summaryNodes.find(n => n.id === expandedNodeId) : null;

  return (
    <div ref={reactFlowWrapper} className="flex-1 flex h-full relative">
      {/* Download button */}
      <Button
        variant="outline"
        size="sm"
        onClick={handleDownload}
        disabled={isDownloading}
        className="absolute top-3 right-3 z-10 gap-1.5 bg-background/90 backdrop-blur-sm shadow-md border-border/40 hover:bg-background"
      >
        <Download className="h-3.5 w-3.5" />
        {isDownloading ? t('common.downloading') : t('topology.download')}
      </Button>

      {/* Back button + breadcrumb */}
      <AnimatePresence>
        {isExpandedView && parentNode && (
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
                className="gap-1.5 bg-background/90 backdrop-blur-sm shadow-md border-border/40 hover:bg-background"
                aria-label={t('topology.backToOverview', 'Back to overview')}
              >
                <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
                {t('topology.backToOverview', 'Back to overview')}
              </Button>
              <div className="flex items-center gap-1.5 bg-background/90 backdrop-blur-sm shadow-md border border-border/40 rounded-lg px-3 py-1.5 text-xs text-muted-foreground">
                <Server className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                <span className="font-medium">{parentNode.label}</span>
                <span className="text-muted-foreground">·</span>
                <span>{expandedChildren.length} {t('topology.instances', 'instances')}</span>
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
