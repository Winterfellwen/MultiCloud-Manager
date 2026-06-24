import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import dagre from 'dagre';
import { ResourceNode } from './ResourceNode';
import { ResourceEdge } from './ResourceEdge';
import { NodeDetailPanel } from './NodeDetailPanel';
import { type TopologyNode, type TopologyEdge } from '@/types/topology';

const nodeTypes = {
  resource: ResourceNode,
};

const edgeTypes = {
  resource: ResourceEdge,
};

interface TopologyCanvasProps {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  isLoading?: boolean;
}

export function TopologyCanvas({ nodes, edges, isLoading }: TopologyCanvasProps) {
  const { t } = useTranslation();
  const [selectedNode, setSelectedNode] = useState<TopologyNode | null>(null);

  // 使用 dagre 计算自动布局
  const { layoutNodes, layoutEdges } = useMemo(() => {
    const g = new dagre.graphlib.Graph();
    g.setDefaultEdgeLabel(() => ({}));
    g.setGraph({ rankdir: 'TB', nodesep: 50, ranksep: 80 });

    // 添加节点
    for (const node of nodes) {
      g.setNode(node.id, { width: 120, height: 80 });
    }

    // 添加边
    for (const edge of edges) {
      g.setEdge(edge.source, edge.target);
    }

    // 计算布局
    dagre.layout(g);

    // 转换为 React Flow 格式
    const layoutNodes: Node[] = nodes.map((node) => {
      const pos = g.node(node.id);
      return {
        id: node.id,
        type: 'resource',
        position: { x: pos.x - 60, y: pos.y - 40 },
        data: node as unknown as Record<string, unknown>,
      };
    });

    const layoutEdges: Edge[] = edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'resource',
      data: edge as unknown as Record<string, unknown>,
    }));

    return { layoutNodes, layoutEdges };
  }, [nodes, edges]);

  const [flowNodes, setNodes, onNodesChange] = useNodesState(layoutNodes);
  const [flowEdges, setEdges, onEdgesChange] = useEdgesState(layoutEdges);

  // 更新节点和边当数据变化时
  useMemo(() => {
    setNodes(layoutNodes);
    setEdges(layoutEdges);
  }, [layoutNodes, layoutEdges, setNodes, setEdges]);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNode(node.data as unknown as TopologyNode);
    },
    []
  );

  const onPaneClick = useCallback(() => {
    setSelectedNode(null);
  }, []);

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        {t('topology.loading')}
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
          nodes={flowNodes}
          edges={flowEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
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
      <NodeDetailPanel node={selectedNode} onClose={() => setSelectedNode(null)} />
    </div>
  );
}
