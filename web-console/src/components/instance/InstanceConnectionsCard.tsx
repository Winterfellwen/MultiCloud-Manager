import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowRight, ArrowLeft, ArrowUpDown, Cable } from 'lucide-react';

interface Props {
  instanceId: string;
  incoming: Array<{ id: string; source: string; label?: string }>;
  outgoing: Array<{ id: string; target: string; label?: string }>;
}

export function InstanceConnectionsCard({ instanceId: _instanceId, incoming, outgoing }: Props) {
  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Cable className="h-4 w-4" />
            Connections
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <ArrowUpDown className="h-8 w-8 mb-3 opacity-50" />
            <div className="text-sm">No connections</div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cable className="h-4 w-4" />
          Connections
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {incoming.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <ArrowLeft className="h-3 w-3" /> Upstream ({incoming.length})
              </div>
              <div className="space-y-1">
                {incoming.map((edge) => (
                  <div key={edge.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/50">
                    <span className="font-medium">{edge.source}</span>
                    {edge.label && <span className="text-muted-foreground">({edge.label})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {outgoing.length > 0 && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                <ArrowRight className="h-3 w-3" /> Downstream ({outgoing.length})
              </div>
              <div className="space-y-1">
                {outgoing.map((edge) => (
                  <div key={edge.id} className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/50">
                    <span className="font-medium">{edge.target}</span>
                    {edge.label && <span className="text-muted-foreground">({edge.label})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
