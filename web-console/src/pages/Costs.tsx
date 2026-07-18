import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useCostSummary, useInstanceCosts, useCollectCosts } from '@/hooks/useCosts';
import type { CostSummaryItem, InstanceCost } from '@/types/monitor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TableWithPagination, Column } from '@/components/ui/table-with-pagination';
import { ApiError } from '@/api/client';
import { getExchangeRate } from '@/api/exchange-rates';
import { RefreshCw } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartTooltip, Legend } from 'recharts';

const PROVIDER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function Costs() {
  const { t } = useTranslation();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const [startDate, setStartDate] = useState(monthStart.toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(monthEnd.toISOString().slice(0, 10));
  const navigate = useNavigate();

  const { data: summary, isLoading: summaryLoading } = useCostSummary({
    start: new Date(startDate).toISOString(),
    end: new Date(endDate + 'T23:59:59').toISOString(),
  });
  const { data: instanceCosts, isLoading: instLoading } = useInstanceCosts();
  const collect = useCollectCosts();

  const providerTotals = useMemo(() => {
    const map = new Map<string, { total: number; currency: string }>();
    (summary || []).forEach((item) => {
      const amount = Number(item.totalAmount) || 0;
      const existing = map.get(item.provider);
      if (existing) {
        existing.total += amount;
      } else {
        map.set(item.provider, { total: amount, currency: item.currency });
      }
    });
    return Array.from(map.entries()).map(([provider, { total, currency }]) => ({ provider, total, currency }));
  }, [summary]);

  const [grandTotalUsd, setGrandTotalUsd] = useState<number>(0);
  const [converting, setConverting] = useState(false);

  useEffect(() => {
    if (providerTotals.length === 0) {
      setGrandTotalUsd(0);
      return;
    }
    setConverting(true);
    Promise.all(
      providerTotals.map(async (p) => {
        if (p.currency === 'USD') return p.total;
        const rate = await getExchangeRate(p.currency, 'USD');
        return p.total / rate;
      })
    )
      .then((converted) => {
        setGrandTotalUsd(converted.reduce((s, v) => s + v, 0));
      })
      .catch(() => {
        setGrandTotalUsd(providerTotals.reduce((s, p) => s + p.total, 0));
      })
      .finally(() => setConverting(false));
  }, [providerTotals]);

  const summaryColumns: Column<CostSummaryItem>[] = [
    { key: 'provider', header: t('common.provider'), accessor: 'provider', className: 'w-[140px]', sortable: true },
    { key: 'service', header: t('costs.service'), accessor: 'service', className: 'w-[180px]', sortable: true },
    {
      key: 'totalAmount',
      header: t('costs.amount'),
      accessor: 'totalAmount',
      className: 'w-[100px]',
      sortable: true,
      sortValue: (row) => Number(row.totalAmount) || 0,
      cell: (value) => <span className="font-medium">{Number(value).toFixed(2)}</span>,
    },
    {
      key: 'currency',
      header: t('costs.currency'),
      accessor: 'currency',
      className: 'w-[100px]',
      cell: (value) => <span className="text-muted-foreground">{value as string}</span>,
    },
  ];

  const instanceColumns: Column<InstanceCost>[] = [
    {
      key: 'name',
      header: t('costs.instanceName'),
      accessor: (row) => row.name || row.id.slice(0, 8),
      className: 'w-[180px]',
      sortable: true,
      sortValue: (row) => row.name || row.id,
      cell: (value) => <span className="font-medium">{value as string}</span>,
    },
    { key: 'provider', header: t('common.provider'), accessor: 'provider', className: 'w-[120px]', sortable: true },
    {
      key: 'region',
      header: t('common.region'),
      accessor: 'region',
      className: 'w-[120px]',
      sortable: true,
      cell: (value) => <span className="text-muted-foreground">{value as string}</span>,
    },
    {
      key: 'monthlyCost',
      header: t('instances.monthlyCost'),
      accessor: 'monthlyCost',
      className: 'w-[120px]',
      sortable: true,
      sortValue: (row) => parseFloat(row.monthlyCost || '') || 0,
      cell: (value, row) => {
        const cost = value as string | null;
        if (!cost) return '-';
        const symbol = (row as InstanceCost).currency === 'CNY' ? '¥' : '$';
        return `${symbol}${parseFloat(cost).toFixed(2)}`;
      },
    },
  ];

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
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
          <span className="text-muted-foreground">-</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
          <Button variant="outline" size="sm" onClick={handleCollect} disabled={collect.isPending}>
            <RefreshCw className={`h-4 w-4 mr-1 ${collect.isPending ? 'animate-spin' : ''}`} />
            {t('costs.collect')}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{t('costs.totalCost')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{converting ? '...' : `$${grandTotalUsd.toFixed(2)}`}</div>
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
          <h2 className="text-lg font-semibold mb-4">{t('costs.byProvider')}</h2>
          {providerTotals.length > 0 ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={providerTotals}
                    dataKey="total"
                    nameKey="provider"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    innerRadius={50}
                    paddingAngle={2}
                  >
                    {providerTotals.map((_entry, index) => (
                      <Cell key={index} fill={PROVIDER_COLORS[index % PROVIDER_COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartTooltip
                    formatter={(value) => [`$${Number(value).toFixed(2)}`, t('costs.amount')]}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground py-8 text-center">{t('costs.noCostData')}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold mb-4">{t('costs.serviceBreakdown')}</h2>
          <TableWithPagination
            data={summary || []}
            columns={summaryColumns}
            loading={summaryLoading}
            rowKey={(row) => `${row.provider}-${row.service}`}
            emptyTitle={t('costs.noCostData')}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold mb-4">{t('costs.instanceMonthly')}</h2>
          <TableWithPagination
            data={instanceCosts || []}
            columns={instanceColumns}
            loading={instLoading}
            rowKey="id"
            emptyTitle={t('costs.noInstanceCost')}
            onRowClick={(row) => navigate(`/instances/${row.id}`)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
