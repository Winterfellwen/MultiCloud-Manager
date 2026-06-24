import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle } from 'lucide-react';
import { useTopology } from '@/hooks/useTopology';
import { TopologyFilter } from '@/components/topology/TopologyFilter';
import { ViewSwitcher } from '@/components/topology/ViewSwitcher';
import { TopologyCanvas } from '@/components/topology/TopologyCanvas';
import { VIEW_CONFIG, type TopologyView, type TopologyFilters, type TopologyCategory } from '@/types/topology';

export default function Topology() {
  const { t } = useTranslation();
  const [view, setView] = useState<TopologyView>('network');
  const [filters, setFilters] = useState<TopologyFilters>({});

  const { data, isLoading, error } = useTopology(filters);

  const filteredNodes = useMemo(() => {
    if (!data) return [];
    const config = VIEW_CONFIG[view];
    return data.nodes.filter((node) =>
      config.categories.includes(node.category as TopologyCategory)
    );
  }, [data, view]);

  const filteredEdges = useMemo(() => {
    if (!data) return [];
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    return data.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  }, [data, filteredNodes]);

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* 左侧筛选面板 */}
      <div className="w-60 border-r bg-card p-4 h-full overflow-y-auto">
        <TopologyFilter filters={filters} onChange={setFilters} />
      </div>

      {/* 右侧主内容区 */}
      <div className="flex-1 flex flex-col h-full">
        {/* 顶部标题和视角切换 */}
        <div className="flex items-center justify-between p-4 border-b">
          <h1 className="text-xl font-bold">{t('topology.title')}</h1>
          <ViewSwitcher currentView={view} onChange={setView} />
        </div>

        {/* 拓扑画布 */}
        <div className="flex-1 h-full">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive m-4">
              <AlertCircle className="h-4 w-4" />
              {t('topology.loadFailed')}：{(error as Error).message}
            </div>
          )}
          <TopologyCanvas
            nodes={filteredNodes}
            edges={filteredEdges}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
