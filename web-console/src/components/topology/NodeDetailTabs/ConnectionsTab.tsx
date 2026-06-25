import { ArrowRight, ArrowLeft, ArrowUpDown } from 'lucide-react';
import type { TopologyNode, TopologyEdge } from '@/types/topology';

interface ConnectionsTabProps {
  node: TopologyNode;
  allEdges: TopologyEdge[];
  allNodes: TopologyNode[];
}

export function ConnectionsTab({ node, allEdges, allNodes }: ConnectionsTabProps) {
  const incoming = allEdges.filter(e => e.target === node.id);
  const outgoing = allEdges.filter(e => e.source === node.id);

  const nodeMap = new Map(allNodes.map(n => [n.id, n]));

  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <ArrowUpDown className="h-8 w-8 mb-3 opacity-50" />
        <div className="text-sm">无连接关系</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {incoming.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <ArrowLeft className="h-3 w-3" /> 上游 ({incoming.length})
          </div>
          <div className="space-y-1">
            {incoming.map(edge => {
              const sourceNode = nodeMap.get(edge.source);
              return (
                <div key={edge.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/50">
                  <span className="font-medium">{sourceNode?.label || edge.source}</span>
                  {edge.label && <span className="text-muted-foreground">({edge.label})</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {outgoing.length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
            <ArrowRight className="h-3 w-3" /> 下游 ({outgoing.length})
          </div>
          <div className="space-y-1">
            {outgoing.map(edge => {
              const targetNode = nodeMap.get(edge.target);
              return (
                <div key={edge.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/50">
                  <span className="font-medium">{targetNode?.label || edge.target}</span>
                  {edge.label && <span className="text-muted-foreground">({edge.label})</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
