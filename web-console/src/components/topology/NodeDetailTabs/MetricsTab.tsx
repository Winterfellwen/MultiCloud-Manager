import { Activity } from 'lucide-react';

export function MetricsTab() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <Activity className="h-8 w-8 mb-3 opacity-50" />
      <div className="text-sm">指标数据待接入</div>
      <div className="text-xs mt-1">将在后续版本中支持 CPU、内存、网络使用率</div>
    </div>
  );
}
