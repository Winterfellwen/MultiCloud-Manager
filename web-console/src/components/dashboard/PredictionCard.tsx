// web-console/src/components/dashboard/PredictionCard.tsx
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { usePredictions } from '@/hooks/usePredictions';
import { AlertTriangle, Loader2, ChevronRight } from 'lucide-react';

export default function PredictionCard() {
  const navigate = useNavigate();
  const { data: predictions, isLoading } = usePredictions();

  const topPredictions = (predictions || []).slice(0, 3);

  const formatHours = (h: string) => {
    const hours = parseFloat(h);
    if (hours < 1) return `${Math.round(hours * 60)} 分钟后`;
    if (hours < 24) return `${hours.toFixed(0)} 小时后`;
    return `${(hours / 24).toFixed(1)} 天后`;
  };

  return (
    <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate('/monitor')}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground">预测预警</CardTitle>
          <AlertTriangle className="h-4 w-4 text-orange-500" />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : topPredictions.length === 0 ? (
          <div className="text-sm text-muted-foreground">暂无预测告警</div>
        ) : (
          <div className="space-y-2">
            {topPredictions.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.instanceName || '未命名实例'}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.metricName === 'disk_utilization' ? '磁盘' : '内存'} {parseFloat(p.currentValue).toFixed(0)}% → {parseFloat(p.threshold).toFixed(0)}%
                  </div>
                </div>
                <Badge variant="warning" className="ml-2 shrink-0">
                  {formatHours(p.hoursToThreshold)}
                </Badge>
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
