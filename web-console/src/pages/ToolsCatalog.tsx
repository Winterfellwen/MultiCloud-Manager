// 工具目录浏览页：按分组展示所有可用工具，支持搜索和风险级别筛选
import { useState, useMemo, useEffect } from 'react';
import { Search, Loader2, AlertCircle, Wrench } from 'lucide-react';
import { useToolsCatalog } from '@/hooks/useToolsCatalog';
import type { ToolCatalogEntry } from '@/hooks/useToolsCatalog';
import { useChatStore } from '@/stores/chat';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type RiskFilter = 'all' | 'low' | 'medium' | 'high';

const RISK_BADGE: Record<string, { label: string; variant: 'success' | 'warning' | 'destructive' }> = {
  low: { label: '低风险', variant: 'success' },
  medium: { label: '中风险', variant: 'warning' },
  high: { label: '高风险', variant: 'destructive' },
};

export default function ToolsCatalog() {
  const connect = useChatStore((s) => s.connect);
  const connectionStatus = useChatStore((s) => s.connectionStatus);
  const { data, isLoading, error } = useToolsCatalog();

  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');

  // 页面挂载时确保 WebSocket 已连接
  useEffect(() => {
    connect();
  }, [connect]);

  // 按搜索词和风险级别过滤工具
  const filteredGroups = useMemo(() => {
    if (!data?.groups) return [];
    const keyword = search.trim().toLowerCase();

    return data.groups
      .map((group) => ({
        ...group,
        tools: group.tools.filter((tool) => {
          // 风险级别筛选
          if (riskFilter !== 'all' && tool.risk !== riskFilter) return false;
          // 关键词搜索（匹配名称或描述）
          if (!keyword) return true;
          return (
            tool.label.toLowerCase().includes(keyword) ||
            tool.description.toLowerCase().includes(keyword) ||
            tool.id.toLowerCase().includes(keyword)
          );
        }),
      }))
      .filter((group) => group.tools.length > 0);
  }, [data, search, riskFilter]);

  const totalTools = data?.groups?.reduce((sum, g) => sum + g.tools.length, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">工具目录</h1>
          <p className="text-sm text-muted-foreground mt-1">
            共 {totalTools} 个可用工具
          </p>
        </div>
      </div>

      {/* 搜索和筛选栏 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜索工具名称或描述..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select
              value={riskFilter}
              onChange={(e) => setRiskFilter(e.target.value as RiskFilter)}
              className="w-[140px]"
            >
              <option value="all">全部风险级别</option>
              <option value="low">低风险</option>
              <option value="medium">中风险</option>
              <option value="high">高风险</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 连接状态提示 */}
      {connectionStatus !== 'connected' && (
        <div className="flex items-center gap-2 rounded-md border border-yellow-500/50 bg-yellow-500/10 p-3 text-sm text-yellow-700 dark:text-yellow-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          正在连接服务（{connectionStatus}）...
        </div>
      )}

      {/* 错误提示 */}
      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          加载失败：{(error as Error).message}
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
          <p>暂无匹配的工具</p>
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
    </div>
  );
}

/** 工具卡片：展示名称、描述、风险级别 */
function ToolCard({ tool }: { tool: ToolCatalogEntry }) {
  const riskConfig = tool.risk ? RISK_BADGE[tool.risk] : null;

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
              {riskConfig.label}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground line-clamp-3">
          {tool.description}
        </p>
        <p className="mt-3 font-mono text-xs text-muted-foreground/70">{tool.id}</p>
      </CardContent>
    </Card>
  );
}
