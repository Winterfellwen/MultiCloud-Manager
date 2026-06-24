import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useTopology } from '@/hooks/useTopology';
import { TopologyFilter } from '@/components/topology/TopologyFilter';
import { ViewSwitcher } from '@/components/topology/ViewSwitcher';
import { TopologyCanvas } from '@/components/topology/TopologyCanvas';
import { Card, CardContent } from '@/components/ui/card';
import { TOPOLOGY_CATEGORY_LABELS, VIEW_CONFIG, type TopologyView, type TopologyFilters, type TopologyCategory } from '@/types/topology';

export default function Topology() {
  const { t } = useTranslation();
  const [view, setView] = useState<TopologyView>('network');
  const [filters, setFilters] = useState<TopologyFilters>({});

  const { data, isLoading } = useTopology(filters);

  // 根据视角过滤节点
  const filteredNodes = data?.nodes.filter((node) => {
    const config = VIEW_CONFIG[view];
    return config.categories.includes(node.category as TopologyCategory);
  }) || [];

  // 过滤边（只保留两端节点都在过滤后节点中的边）
  const nodeIds = new Set(filteredNodes.map((n) => n.id));
  const filteredEdges = data?.edges.filter((e) => {
    return nodeIds.has(e.source) && nodeIds.has(e.target);
  }) || [];

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
          <TopologyCanvas
            nodes={filteredNodes}
            edges={filteredEdges}
            view={view}
            isLoading={isLoading}
          />
        </div>
      </div>
    </div>
  );
}
