// web-console/src/components/dashboard/RemediationCard.tsx
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useRemediationRuns } from '@/hooks/useRemediation';
import { Zap, Loader2, ChevronRight, CheckCircle, XCircle } from 'lucide-react';

export default function RemediationCard() {
  const navigate = useNavigate();
  const { data: runs, isLoading } = useRemediationRuns();

  const recentRuns = (runs || []).slice(0, 5);
  const pendingCount = (runs || []).filter(r => r.status === 'pending').length;

  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/monitor')}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">最近自愈</CardTitle>
          <Zap className="h-4 w-4 text-blue-500" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : recentRuns.length === 0 ? (
          <div className="text-sm text-muted-foreground">暂无自愈记录</div>
        ) : (
          <div className="space-y-2">
            {pendingCount > 0 && (
              <div className="text-xs text-orange-600 font-medium">
                {pendingCount} 条待审批
              </div>
            )}
            {recentRuns.map((run) => (
              <div key={run.id} className="flex items-center justify-between text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{run.instanceName || '未命名实例'}</div>
                  <div className="text-xs text-muted-foreground">
                    {run.actionExecuted === 'reboot_instance' ? '重启' : run.actionExecuted === 'stop_instance' ? '停止' : '扩容'}
                  </div>
                </div>
                {run.status === 'success' ? (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                ) : run.status === 'failed' ? (
                  <XCircle className="h-4 w-4 text-red-500" />
                ) : (
                  <Badge variant="warning" className="ml-2 shrink-0">{run.status}</Badge>
                )}
              </div>
            ))}
            <div className="flex items-center justify-end text-xs text-muted-foreground pt-1">
              查看全部 <ChevronRight className="h-3 w-3" />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
