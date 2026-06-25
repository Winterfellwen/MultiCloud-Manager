import { useMemo } from 'react';
import { getDemoLogs, type DemoLogEntry } from '@/lib/demo/mock-data';
import { AlertTriangle, Info, XCircle } from 'lucide-react';

interface Props {
  instanceId?: string;
}

const LEVEL_CONFIG = {
  info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-50' },
  warn: { icon: AlertTriangle, color: 'text-amber-500', bg: 'bg-amber-50' },
  error: { icon: XCircle, color: 'text-red-500', bg: 'bg-red-50' },
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function LogsTab({ instanceId = 'demo-instance-0' }: Props) {
  const logs = useMemo(() => getDemoLogs(instanceId, 30), [instanceId]);

  return (
    <div className="space-y-1 max-h-80 overflow-y-auto font-mono text-xs">
      {logs.map((log, i) => {
        const cfg = LEVEL_CONFIG[log.level];
        const Icon = cfg.icon;
        return (
          <div key={i} className={`flex items-start gap-2 px-2 py-1.5 rounded ${cfg.bg}`}>
            <Icon className={`h-3.5 w-3.5 mt-0.5 shrink-0 ${cfg.color}`} />
            <span className="text-gray-400 shrink-0">{formatTime(log.timestamp)}</span>
            <span className="text-gray-700">{log.message}</span>
          </div>
        );
      })}
    </div>
  );
}
