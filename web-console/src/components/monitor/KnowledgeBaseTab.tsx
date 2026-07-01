// web-console/src/components/monitor/KnowledgeBaseTab.tsx
import React, { useState } from 'react';
import { useKnowledgeBase } from '@/hooks/useKnowledgeBase';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Loader2, BookOpen, ChevronDown, ChevronRight as ChevronR } from 'lucide-react';

const ACTION_LABELS: Record<string, string> = {
  reboot_instance: '重启实例',
  stop_instance: '停止实例',
  scale_up: '扩容实例',
};

const METRIC_LABELS: Record<string, string> = {
  disk_utilization: '磁盘使用率',
  memory_utilization: '内存使用率',
  cpu_utilization: 'CPU使用率',
};

export default function KnowledgeBaseTab() {
  const { data: entries, isLoading } = useKnowledgeBase();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const filtered = (entries || []).filter((e) =>
    !search || e.symptom.toLowerCase().includes(search.toLowerCase()) || (e.rootCause || '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          AI 运维知识库：每次自愈经验自动积累，新告警时 RAG 检索相似案例辅助决策
        </p>
      </div>

      <Input
        placeholder="搜索症状或根因..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-sm"
      />

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              暂无知识库条目。完成自愈后经验会自动积累。
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[40px]"></TableHead>
                  <TableHead>症状</TableHead>
                  <TableHead>指标</TableHead>
                  <TableHead>根因</TableHead>
                  <TableHead>动作</TableHead>
                  <TableHead>结果</TableHead>
                  <TableHead>恢复耗时</TableHead>
                  <TableHead>引用次数</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((entry) => (
                  <React.Fragment key={entry.id}>
                    <TableRow>
                      <TableCell>
                        <button
                          onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          {expandedId === entry.id ? <ChevronDown className="h-4 w-4" /> : <ChevronR className="h-4 w-4" />}
                        </button>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs">{entry.symptom}</TableCell>
                      <TableCell>{METRIC_LABELS[entry.metricName] || entry.metricName}</TableCell>
                      <TableCell className="max-w-[200px] truncate text-xs">{entry.rootCause || '-'}</TableCell>
                      <TableCell>{entry.actionTaken ? ACTION_LABELS[entry.actionTaken] || entry.actionTaken : '-'}</TableCell>
                      <TableCell>
                        <Badge variant={entry.outcome === 'success' ? 'success' : 'destructive'}>
                          {entry.outcome === 'success' ? '成功' : '失败'}
                        </Badge>
                      </TableCell>
                      <TableCell>{entry.resolutionTimeMinutes ? `${entry.resolutionTimeMinutes}分钟` : '-'}</TableCell>
                      <TableCell>{entry.helpfulCount}</TableCell>
                    </TableRow>
                    {expandedId === entry.id && (
                      <TableRow key={`${entry.id}-detail`}>
                        <TableCell colSpan={8} className="bg-muted/30">
                          <div className="space-y-2 py-2">
                            <div><strong className="text-xs">完整症状：</strong> {entry.symptom}</div>
                            <div><strong className="text-xs">根因分析：</strong> {entry.rootCause}</div>
                            {entry.instanceProvider && <div><strong className="text-xs">云厂商：</strong> {entry.instanceProvider}</div>}
                            {entry.instanceEnv && <div><strong className="text-xs">环境：</strong> {entry.instanceEnv}</div>}
                            <div><strong className="text-xs">记录时间：</strong> {new Date(entry.createdAt).toLocaleString('zh-CN')}</div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </React.Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
