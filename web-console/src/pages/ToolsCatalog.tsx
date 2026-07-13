// 工具目录浏览页：按分组展示所有可用工具，支持搜索和风险级别筛选
import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Search, Loader2, AlertCircle, Wrench } from 'lucide-react';
import { useToolsCatalog } from '@/hooks/useToolsCatalog';
import { useToolExecutions } from '@/hooks/useToolExecutions';
import { ExecutionTable } from '@/components/execution/ExecutionTable';
import type { ToolCatalogEntry } from '@/hooks/useToolsCatalog';
import { useChatStore } from '@/stores/chat';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type RiskFilter = 'all' | 'low' | 'medium' | 'high';

const RISK_BADGE: Record<string, { labelKey: string; variant: 'success' | 'warning' | 'destructive' }> = {
  low: { labelKey: 'tools.riskLow', variant: 'success' },
  medium: { labelKey: 'tools.riskMedium', variant: 'warning' },
  high: { labelKey: 'tools.riskHigh', variant: 'destructive' },
};

export default function ToolsCatalog() {
  const { t } = useTranslation();
  const connect = useChatStore((s) => s.connect);
  const connectionStatus = useChatStore((s) => s.connectionStatus);
  const { data, isLoading, error } = useToolsCatalog();

  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');
  const [providerFilter, setProviderFilter] = useState<string>('all');

  // 页面挂载时确保 WebSocket 已连接
  useEffect(() => {
    connect();
  }, [connect]);

  // 提取所有 unique 云厂商
  const allProviders = useMemo(() => {
    if (!data?.groups) return [];
    const set = new Set<string>();
    data.groups.forEach(g => g.providerSet?.forEach(p => set.add(p)));
    return [...set].sort();
  }, [data]);

  // 按搜索词、风险级别和云厂商过滤工具
  const filteredGroups = useMemo(() => {
    if (!data?.groups) return [];
    const keyword = search.trim().toLowerCase();

    return data.groups
      .map((group) => ({
        ...group,
        tools: group.tools.filter((tool) => {
          if (riskFilter !== 'all' && tool.risk !== riskFilter) return false;
          if (providerFilter !== 'all' && (!tool.supportedProviders || !tool.supportedProviders.includes(providerFilter))) return false;
          if (!keyword) return true;
          return (
            tool.label.toLowerCase().includes(keyword) ||
            tool.description.toLowerCase().includes(keyword) ||
            tool.id.toLowerCase().includes(keyword)
          );
        }),
      }))
      .filter((group) => group.tools.length > 0);
  }, [data, search, riskFilter, providerFilter]);

  const totalTools = data?.groups?.reduce((sum, g) => sum + g.tools.length, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">{t('tools.title')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('tools.total', { count: totalTools })}
          </p>
        </div>
      </div>

      {/* 搜索和筛选栏 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <div className="w-full sm:flex-1 sm:min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('tools.searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value as RiskFilter)}
              className="w-full sm:w-[140px]"
            >
              <option value="all">{t('tools.allRisk')}</option>
              <option value="low">{t('tools.riskLow')}</option>
              <option value="medium">{t('tools.riskMedium')}</option>
              <option value="high">{t('tools.riskHigh')}</option>
            </Select>
            <Select
              value={providerFilter}
              onChange={(e) => setProviderFilter(e.target.value)}
              className="w-full sm:w-[160px]"
            >
              <option value="all">{t('tools.allProviders')}</option>
              {allProviders.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 连接状态提示 */}
      {connectionStatus !== 'connected' && (
        <div className="flex items-center gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          {t('tools.connecting', { status: connectionStatus })}
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {t('tools.loadFailed')}：{(error as Error).message}
        </div>
      )}

      {/* 加载中 */}
      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* 工具分组列表 */}
      {!isLoading && !error && filteredGroups.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <Wrench className="h-10 w-10 mb-2 opacity-50" />
          <p>{t('tools.noMatch')}</p>
        </div>
      )}

      {!isLoading && !error && filteredGroups.length > 0 && (
        <div className="space-y-6">
          {filteredGroups.map((group) => (
            <div key={group.id}>
              <h2 className="text-lg font-semibold mb-3">{group.label}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.tools.map((tool) => (
                  <ToolCard key={tool.id} tool={tool} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 全局最近执行区域 */}
      {!isLoading && !error && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold mb-3">{t('tools.recentExecutions')}</h2>
          <Card>
            <CardContent className="pt-4">
              <ExecutionTable providerFilter={providerFilter} />
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/** 工具卡片：展示名称、描述、风险级别、云厂商标签、执行记录 */
function ToolCard({ tool }: { tool: ToolCatalogEntry }) {
  const { t } = useTranslation();
  const riskConfig = tool.risk ? RISK_BADGE[tool.risk] : null;
  const [showHistory, setShowHistory] = useState(false);
  const { data: executions } = useToolExecutions(showHistory ? tool.id : undefined, 10);

  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Wrench className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="truncate">{tool.label}</span>
          </CardTitle>
          {riskConfig && (
            <Badge variant={riskConfig.variant} className="shrink-0">
              {t(riskConfig.labelKey)}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-3">
          {tool.description}
        </p>

        {/* 云厂商标签 */}
        {tool.supportedProviders && tool.supportedProviders.length > 0 ? (
          <div className="mt-2 flex flex-wrap gap-1">
            {tool.supportedProviders.map(p => (
              <span key={p} className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {p}
              </span>
            ))}
          </div>
        ) : (
          <span className="mt-2 inline-flex items-center rounded-full border px-2 py-0.5 text-xs text-muted-foreground/60">
            {t('tools.genericProvider')}
          </span>
        )}

        <p className="mt-3 font-mono text-xs text-muted-foreground/70">{tool.id}</p>

        {/* 执行记录按钮 */}
        <button
          className="mt-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={() => setShowHistory(!showHistory)}
        >
          {t('tools.execHistory')} ({executions?.length ?? 0})
        </button>

        {/* 执行记录列表 */}
        {showHistory && (
          <div className="mt-2 space-y-1 border-t pt-2">
            {(!executions || executions.length === 0) && (
              <p className="text-xs text-muted-foreground">{t('tools.noExecutions')}</p>
            )}
            {executions?.map(ex => (
              <div key={ex.id} className="flex items-center justify-between text-xs">
                <span>{new Date(ex.timestamp).toLocaleString()}</span>
                <span className={ex.result === 'success' ? 'text-green-600' : 'text-red-600'}>
                  {ex.result === 'success' ? '✓' : '✗'}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
