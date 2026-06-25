import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force';

interface ForceRequest {
  nodes: Array<{ id: string; x?: number; y?: number; fx?: number; fy?: number; mass?: number }>;
  edges: Array<{ source: string; target: string }>;
  width: number;
  height: number;
}

interface ForceResult {
  positions: Record<string, { x: number; y: number }>;
  converged: boolean;
}

interface SimNode extends SimulationNodeDatum {
  id: string;
}

self.onmessage = (e: MessageEvent<ForceRequest>) => {
  const { nodes, edges, width, height } = e.data;

  if (nodes.length === 0) {
    self.postMessage({ positions: {}, converged: true } as ForceResult);
    return;
  }

  const simNodes: SimNode[] = nodes.map((n) => ({
    id: n.id,
    x: n.x ?? width / 2 + (Math.random() - 0.5) * 200,
    y: n.y ?? height / 2 + (Math.random() - 0.5) * 200,
    fx: n.fx,
    fy: n.fy,
  }));

  const simEdges: SimulationLinkDatum<SimNode>[] = edges.map((e) => ({
    source: e.source,
    target: e.target,
  }));

  const sim = forceSimulation(simNodes)
    .force(
      'link',
      forceLink<SimNode, SimulationLinkDatum<SimNode>>(simEdges)
        .id((d) => d.id)
        .distance(120)
        .strength(0.3)
    )
    .force('charge', forceManyBody().strength(-300).distanceMax(500))
    .force('center', forceCenter(width / 2, height / 2).strength(0.05))
    .force('collision', forceCollide<SimNode>().radius(60).strength(0.8))
    .force('x', forceX(width / 2).strength(0.02))
    .force('y', forceY(height / 2).strength(0.02))
    .alphaDecay(0.02)
    .velocityDecay(0.4);

  // Run simulation synchronously
  for (let i = 0; i < 300; i++) {
    sim.tick();
  }

  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of simNodes) {
    positions[node.id] = {
      x: node.x ?? 0,
      y: node.y ?? 0,
    };
  }

  self.postMessage({ positions, converged: true } as ForceResult);
};
