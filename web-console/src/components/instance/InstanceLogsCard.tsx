import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getDemoLogs } from '@/lib/demo/mock-data';
import { AlertTriangle, Info, XCircle, ScrollText } from 'lucide-react';

interface Props {
  instanceId: string;
}

const LEVEL_CONFIG = {
  info: { icon: Info, color: 'text-blue-500', bg: 'bg-info-50 dark:bg-info-950/30' },
  warn: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-warning-50 dark:bg-warning-950/30' },
  error: { icon: XCircle, color: 'text-red-500', bg: 'bg-destructive-50 dark:bg-destructive-950/30' },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function InstanceLogsCard({ instanceId }: Props) {
  const logs = useMemo(() => getDemoLogs(instanceId, 30), [instanceId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="h-4 w-4" />
          Logs (30)
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-1 max-h-80 overflow-y-auto font-mono text-xs">
          {logs.map((log, i) => {
            const cfg = LEVEL_CONFIG[log.level];
            const Icon = cfg.icon;
            return (
              <div key={i} className={`flex items-start gap-2 px-2 py-1.5 rounded ${cfg.bg}`}>
                <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${cfg.color}`} />
                <span className="text-muted-foreground shrink-0">{formatTime(log.timestamp)}</span>
                <span className="text-foreground">{log.message}</span>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
