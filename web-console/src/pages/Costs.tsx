import { useMemo, useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useCostSummary, useInstanceCosts, useCollectCosts, useCostForecast } from '@/hooks/useCosts';
import type { CostSummaryItem, InstanceCost } from '@/types/monitor';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TableWithPagination, Column } from '@/components/ui/table-with-pagination';
import { ApiError } from '@/api/client';
import { getExchangeRate } from '@/api/exchange-rates';
import { RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartTooltip, Legend, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartTooltip2 } from 'recharts';

const PROVIDER_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

export default function Costs() {
  const { t } = useTranslation();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const [startDate, setStartDate] = useState(monthStart.toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(monthEnd.toISOString().slice(0, 10));

  type TimePreset = '7d' | '30d' | '90d' | 'month';

  const timePresets: { key: TimePreset; label: string }[] = [
    { key: '7d', label: t('common.last7Days') },
    { key: '30d', label: t('common.last30Days') },
    { key: '90d', label: t('common.last90Days') },
    { key: 'month', label: t('common.thisMonth') },
  ];

  const [activePreset, setActivePreset] = useState<TimePreset>('month');

  function applyPreset(preset: TimePreset) {
    setActivePreset(preset);
    const now = new Date();
    switch (preset) {
      case '7d': {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        setStartDate(d.toISOString().slice(0, 10));
        setEndDate(now.toISOString().slice(0, 10));
        break;
      }
      case '30d': {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        setStartDate(d.toISOString().slice(0, 10));
        setEndDate(now.toISOString().slice(0, 10));
        break;
      }
      case '90d': {
        const d = new Date(now);
        d.setDate(d.getDate() - 90);
        setStartDate(d.toISOString().slice(0, 10));
        setEndDate(now.toISOString().slice(0, 10));
        break;
      }
      case 'month': {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        setStartDate(monthStart.toISOString().slice(0, 10));
        setEndDate(monthEnd.toISOString().slice(0, 10));
        break;
      }
    }
  }

  const navigate = useNavigate();

  const { data: summary, isLoading: summaryLoading } = useCostSummary({
    start: new Date(startDate).toISOString(),
    end: new Date(endDate + 'T23:59:59').toISOString(),
  });
  const { data: instanceCosts, isLoading: instLoading } = useInstanceCosts();
  const { data: forecast, isLoading: forecastLoading } = useCostForecast();
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
    {
      key: 'tags',
      header: t('instances.tags', '标签'),
      accessor: (row) => row.tags && Object.keys(row.tags).length > 0
        ? Object.entries(row.tags).slice(0, 3).map(([k, v]) => `${k}=${v}`).join(', ') + (Object.keys(row.tags).length > 3 ? '...' : '')
        : '-',
      className: 'w-[160px]',
      cell: (_value, row) => {
        const tags = (row as InstanceCost).tags as Record<string, string> | null;
        if (!tags || Object.keys(tags).length === 0) return <span className="text-muted-foreground">-</span>;
        const entries = Object.entries(tags);
        return (
          <div className="flex flex-wrap gap-1">
            {entries.slice(0, 3).map(([k, v]) => (
              <span key={k} className="inline-flex items-center rounded-sm bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                {k}:{v}
              </span>
            ))}
            {entries.length > 3 && (
              <span className="text-xs text-muted-foreground">+{entries.length - 3}</span>
            )}
          </div>
        );
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
          <div className="flex gap-1">
            {timePresets.map((p) => (
              <Button
                key={p.key}
                variant={activePreset === p.key ? 'default' : 'outline'}
                size="sm"
                onClick={() => applyPreset(p.key)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <input
            type="date"
            value={startDate}
            onChange={(e) => { setStartDate(e.target.value); setActivePreset(null as any); }}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-sm"
          />
          <span className="text-muted-foreground">-</span>
          <input
            type="date"
            value={endDate}
            onChange={(e) => { setEndDate(e.target.value); setActivePreset(null as any); }}
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

      {/* Cost Forecast */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">{t('costs.forecast', '成本预测')}</CardTitle>
          {forecast && (
            <div className="flex items-center gap-1 text-sm">
              {forecast.trend === 'increasing' && <TrendingUp className="h-4 w-4 text-red-500" />}
              {forecast.trend === 'decreasing' && <TrendingDown className="h-4 w-4 text-green-500" />}
              {forecast.trend === 'stable' && <Minus className="h-4 w-4 text-muted-foreground" />}
              <span className="text-muted-foreground">
                {forecast.trend === 'increasing' ? t('costs.trendUp', '上涨趋势') :
                 forecast.trend === 'decreasing' ? t('costs.trendDown', '下降趋势') :
                 forecast.trend === 'stable' ? t('costs.trendStable', '平稳') :
                 t('costs.insufficientData', '数据不足')}
              </span>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {forecastLoading ? (
            <div className="flex items-center justify-center h-48"><span className="text-muted-foreground">Loading...</span></div>
          ) : forecast && forecast.historical.length > 0 ? (
            <ResponsiveContainer width="100%" height={240}>
              <AreaChart data={[...forecast.historical, ...forecast.forecast.map(f => ({ month: f.month, total: null, predicted: f.predicted }))]}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <RechartTooltip2 />
                <Area type="monotone" dataKey="total" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.1} name={t('costs.actual', '实际')} strokeWidth={2} connectNulls />
                <Area type="monotone" dataKey="predicted" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.1} name={t('costs.forecast', '预测')} strokeWidth={2} strokeDasharray="5 5" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-48">
              <span className="text-muted-foreground">{t('costs.noData', '暂无成本数据')}</span>
            </div>
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
