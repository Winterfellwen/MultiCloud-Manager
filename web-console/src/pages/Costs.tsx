import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { useCostSummary, useInstanceCosts, useCollectCosts } from '@/hooks/useCosts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { ApiError } from '@/api/client';
import { RefreshCw } from 'lucide-react';

export default function Costs() {
  const { t } = useTranslation();
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
      toast.error(err instanceof ApiError ? err.message : t('costs.collectFailed'));
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl sm:text-2xl font-bold">{t('costs.title')}</h1>
        <Button variant="outline" size="sm" onClick={handleCollect} disabled={collect.isPending}>
          <RefreshCw className={`h-4 w-4 mr-1 ${collect.isPending ? 'animate-spin' : ''}`} />
          {t('costs.collect')}
        </Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('costs.totalCost')}</CardTitle>
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
          <h2 className="text-lg font-semibold mb-4">{t('costs.serviceBreakdown')}</h2>
          {summaryLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
          ) : (summary || []).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">{t('costs.noCostData')}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('common.provider')}</TableHead>
                  <TableHead>{t('costs.service')}</TableHead>
                  <TableHead>{t('costs.amount')}</TableHead>
                  <TableHead>{t('costs.currency')}</TableHead>
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
          <h2 className="text-lg font-semibold mb-4">{t('costs.instanceMonthly')}</h2>
          {instLoading ? (
            <div className="text-center py-8 text-muted-foreground">{t('common.loading')}</div>
          ) : (instanceCosts || []).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">{t('costs.noInstanceCost')}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('costs.instanceName')}</TableHead>
                  <TableHead>{t('common.provider')}</TableHead>
                  <TableHead>{t('common.region')}</TableHead>
                  <TableHead>{t('instances.monthlyCost')}</TableHead>
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
