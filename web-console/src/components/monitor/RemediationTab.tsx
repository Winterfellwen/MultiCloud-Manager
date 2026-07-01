// web-console/src/components/monitor/RemediationTab.tsx
import React, { useState } from 'react';
import { useRemediationRuns, useApproveRemediation } from '@/hooks/useRemediation';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Loader2, ChevronDown, ChevronRight as ChevronR, CheckCircle, XCircle, Clock, Zap } from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; variant: 'warning' | 'info' | 'success' | 'destructive' | 'secondary'; icon: typeof Clock }> = {
  pending: { label: '待审批', variant: 'warning', icon: Clock },
  approved: { label: '已批准', variant: 'info', icon: CheckCircle },
  executing: { label: '执行中', variant: 'info', icon: Zap },
  success: { label: '已恢复', variant: 'success', icon: CheckCircle },
  failed: { label: '失败', variant: 'destructive', icon: XCircle },
  skipped: { label: '已跳过', variant: 'secondary', icon: XCircle },
};

const ACTION_LABELS: Record<string, string> = {
  reboot_instance: '重启实例',
  stop_instance: '停止实例',
  scale_up: '扩容实例',
};

export default function RemediationTab() {
  const { data: runs, isLoading } = useRemediationRuns();
  const approve = useApproveRemediation();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <Card>
      <CardContent className="pt-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !runs || runs.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">暂无自愈记录</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>实例</TableHead>
                <TableHead>告警</TableHead>
                <TableHead>根因</TableHead>
                <TableHead>动作</TableHead>
                <TableHead>环境</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>触发时间</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.map((run) => {
                const StatusIcon = STATUS_CONFIG[run.status]?.icon || Clock;
                return (
                  <React.Fragment key={run.id}>
                    <TableRow>
                      <TableCell>
                        <button
                          onClick={() => setExpandedId(expandedId === run.id ? null : run.id)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {expandedId === run.id ? <ChevronDown className="h-4 w-4" /> : <ChevronR className="h-4 w-4" />}
                        </button>
                      </TableCell>
                      <TableCell className="font-medium">{run.instanceName || '未命名'}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{run.alertMessage || '-'}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">{run.rootCause || '-'}</TableCell>
                      <TableCell>{run.actionExecuted ? ACTION_LABELS[run.actionExecuted] || run.actionExecuted : '-'}</TableCell>
                      <TableCell><Badge variant="secondary">{run.env || '-'}</Badge></TableCell>
                      <TableCell>
                        <Badge variant={STATUS_CONFIG[run.status]?.variant || 'secondary'}>
                          <StatusIcon className="h-3 w-3 mr-1" />
                          {STATUS_CONFIG[run.status]?.label || run.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(run.triggeredAt).toLocaleString('zh-CN')}
                      </TableCell>
                      <TableCell>
                        {run.status === 'pending' && (
                          <Button
                            size="sm"
                            variant="default"
                            onClick={() => approve.mutate(run.id)}
                            disabled={approve.isPending}
                          >
                            批准执行
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                    {expandedId === run.id && (
                      <TableRow key={`${run.id}-detail`}>
                        <TableCell colSpan={9} className="bg-muted/30">
                          <div className="space-y-3 py-2">
                            {run.actionPlan && (
                              <div className="space-y-1">
                                <div className="text-xs font-medium text-muted-foreground">AI 修复计划</div>
                                <div className="text-sm"><strong>根因：</strong>{run.actionPlan.rootCause}</div>
                                <div className="text-sm"><strong>动作：</strong>{ACTION_LABELS[run.actionPlan.recommendedAction] || run.actionPlan.recommendedAction}</div>
                                <div className="text-sm"><strong>理由：</strong>{run.actionPlan.reasoning}</div>
                                <div className="text-sm"><strong>预期效果：</strong>{run.actionPlan.expectedEffect}</div>
                              </div>
                            )}
                            {run.verificationResult && (
                              <div className="text-sm"><strong>验证结果：</strong>{run.verificationResult}</div>
                            )}
                            {run.errorMessage && (
                              <div className="text-sm text-destructive"><strong>错误：</strong>{run.errorMessage}</div>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
