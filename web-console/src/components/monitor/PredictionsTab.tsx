// web-console/src/components/monitor/PredictionsTab.tsx
import { usePredictions, useRunPrediction } from '@/hooks/usePredictions';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Loader2, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react';

const METRIC_LABELS: Record<string, string> = {
  disk_utilization: '磁盘使用率',
  memory_utilization: '内存使用率',
};

export default function PredictionsTab() {
  const { data: predictions, isLoading } = usePredictions();
  const runMutation = useRunPrediction();

  const formatHours = (h: string) => {
    const hours = parseFloat(h);
    if (hours < 1) return `${Math.round(hours * 60)} 分钟`;
    if (hours < 24) return `${hours.toFixed(1)} 小时`;
    return `${(hours / 24).toFixed(1)} 天`;
  };

  const getConfidenceBadge = (confidence: string) => {
    const c = parseFloat(confidence);
    if (c >= 85) return <Badge variant="success">高置信度 {c.toFixed(0)}%</Badge>;
    if (c >= 70) return <Badge variant="warning">中置信度 {c.toFixed(0)}%</Badge>;
    return <Badge variant="secondary">低置信度 {c.toFixed(0)}%</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          基于最近 24 小时指标趋势，预测未来可能触发的告警
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${runMutation.isPending ? 'animate-spin' : ''}`} />
          立即分析
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !predictions || predictions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <TrendingUp className="h-8 w-8 mx-auto mb-2 opacity-50" />
              暂无预测数据。点击"立即分析"生成预测。
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>实例</TableHead>
                  <TableHead>厂商</TableHead>
                  <TableHead>指标</TableHead>
                  <TableHead>当前值</TableHead>
                  <TableHead>阈值</TableHead>
                  <TableHead>预计触达</TableHead>
                  <TableHead>趋势</TableHead>
                  <TableHead>置信度</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {predictions.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.instanceName || p.instanceId.slice(0, 8)}</TableCell>
                    <TableCell>{p.instanceProvider}</TableCell>
                    <TableCell>{METRIC_LABELS[p.metricName] || p.metricName}</TableCell>
                    <TableCell>{parseFloat(p.currentValue).toFixed(1)}%</TableCell>
                    <TableCell className="text-destructive font-medium">{parseFloat(p.threshold).toFixed(0)}%</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center gap-1 text-orange-600">
                        <AlertTriangle className="h-3 w-3" />
                        {formatHours(p.hoursToThreshold)}
                      </span>
                    </TableCell>
                    <TableCell className="text-red-600">+{parseFloat(p.slope).toFixed(2)}%/h</TableCell>
                    <TableCell>{getConfidenceBadge(p.confidence)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
