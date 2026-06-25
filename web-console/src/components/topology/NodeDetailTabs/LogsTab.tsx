import { FileText } from 'lucide-react';

export function LogsTab() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <FileText className="h-8 w-8 mb-3 opacity-50" />
      <div className="text-sm">日志数据待接入</div>
      <div className="text-xs mt-1">将在后续版本中支持查看最近日志</div>
    </div>
  );
}
