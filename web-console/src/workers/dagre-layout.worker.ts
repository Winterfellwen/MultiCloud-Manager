import dagre from 'dagre';

interface LayoutRequest {
  nodes: Array<{ id: string; width?: number; height?: number }>;
  edges: Array<{ source: string; target: string }>;
  rankdir?: 'TB' | 'BT' | 'LR' | 'RL';
  nodesep?: number;
  ranksep?: number;
}

interface LayoutResult {
  positions: Record<string, { x: number; y: number }>;
}

self.onmessage = (e: MessageEvent<LayoutRequest>) => {
  const { nodes, edges, rankdir = 'TB', nodesep = 50, ranksep = 80 } = e.data;

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir, nodesep, ranksep });

  for (const node of nodes) {
    g.setNode(node.id, { width: node.width ?? 120, height: node.height ?? 80 });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of nodes) {
    const pos = g.node(node.id);
    if (pos) {
      positions[node.id] = { x: pos.x, y: pos.y };
    }
  }

  const result: LayoutResult = { positions };
  self.postMessage(result);
};
