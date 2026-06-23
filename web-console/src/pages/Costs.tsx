import { useMemo } from 'react';
import { useCostSummary, useInstanceCosts, useCollectCosts } from '@/hooks/useCosts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { ApiError } from '@/api/client';
import { RefreshCw } from 'lucide-react';

export default function Costs() {
  const { data: summary, isLoading: summaryLoading } = useCostSummary();
  const { data: instanceCosts, isLoading: instLoading } = useInstanceCosts();
  const collect = useCollectCosts();

  const providerTotals = useMemo(() => {
    const map = new Map<string, { total: number; currency: string }>();
    (summary || []).forEach((item) => {
      const existing = map.get(item.provider);
      if (existing) {
        existing.total += item.totalAmount;
      } else {
        map.set(item.provider, { total: item.totalAmount, currency: item.currency });
      }
    });
    return Array.from(map.entries()).map(([provider, { total, currency }]) => ({ provider, total, currency }));
  }, [summary]);

  const grandTotal = providerTotals.reduce((sum, p) => sum + p.total, 0);

  async function handleCollect() {
    try {
      await collect.mutateAsync();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '采集失败');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl sm:text-2xl font-bold">成本分析</h1>
        <Button variant="outline" size="sm" onClick={handleCollect} disabled={collect.isPending}>
          <RefreshCw className={`h-4 w-4 mr-1 ${collect.isPending ? 'animate-spin' : ''}`} />
          采集成本
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">总成本</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥{grandTotal.toFixed(2)}</div>
          </CardContent>
        </Card>
        {providerTotals.map((p) => (
          <Card key={p.provider}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{p.provider}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{p.currency === 'CNY' ? '¥' : '$'}{p.total.toFixed(2)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold mb-4">服务成本分解</h2>
          {summaryLoading ? (
            <div className="text-center py-8 text-muted-foreground">加载中...</div>
          ) : (summary || []).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">暂无成本数据</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>云厂商</TableHead>
                  <TableHead>服务</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>币种</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(summary || []).map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{item.provider}</TableCell>
                    <TableCell>{item.service}</TableCell>
                    <TableCell className="font-medium">{item.totalAmount.toFixed(2)}</TableCell>
                    <TableCell className="text-muted-foreground">{item.currency}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold mb-4">实例月度成本</h2>
          {instLoading ? (
            <div className="text-center py-8 text-muted-foreground">加载中...</div>
          ) : (instanceCosts || []).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">暂无实例成本数据</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>实例名称</TableHead>
                  <TableHead>云厂商</TableHead>
                  <TableHead>区域</TableHead>
                  <TableHead>月费用</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(instanceCosts || []).map((inst) => (
                  <TableRow key={inst.id}>
                    <TableCell className="font-medium">{inst.name || inst.id.slice(0, 8)}</TableCell>
                    <TableCell>{inst.provider}</TableCell>
                    <TableCell className="text-muted-foreground">{inst.region}</TableCell>
                    <TableCell>
                      {inst.monthlyCost ? `¥${parseFloat(inst.monthlyCost).toFixed(2)}` : '-'}
                    </TableCell>
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
