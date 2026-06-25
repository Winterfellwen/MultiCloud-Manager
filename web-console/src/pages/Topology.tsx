import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTopology } from '@/hooks/useTopology';
import { TopologyFilter } from '@/components/topology/TopologyFilter';
import { ViewSwitcher } from '@/components/topology/ViewSwitcher';
import { TopologyCanvas } from '@/components/topology/TopologyCanvas';
import { VIEW_CONFIG, type TopologyView, type TopologyFilters, type TopologyCategory } from '@/types/topology';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { Button } from '@/components/ui/button';

export default function Topology() {
  const { t } = useTranslation();
  const [view, setView] = useState<TopologyView>('network');
  const [filters, setFilters] = useState<TopologyFilters>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

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

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* 桌面端：固定侧边栏 */}
      {!isMobile && (
        <div className="w-60 border-r bg-card p-4 h-full overflow-y-auto flex-shrink-0">
          <TopologyFilter filters={filters} onChange={setFilters} />
        </div>
      )}

      {/* 移动端：抽屉式侧边栏 */}
      {isMobile && (
        <>
          {sidebarOpen && (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/50"
                onClick={() => setSidebarOpen(false)}
              />
              <div className="fixed inset-y-0 left-0 z-50 w-72 max-w-[80vw] animate-in slide-in-from-left duration-200">
                <div className="h-full border-r bg-card p-4 overflow-y-auto">
                  <TopologyFilter filters={filters} onChange={setFilters} />
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* 右侧主内容区 */}
      <div className="flex-1 flex flex-col h-full">
        {/* 顶部标题和视角切换 */}
        <div className="flex items-center justify-between p-3 md:p-4 border-b">
          <div className="flex items-center gap-2">
            {isMobile && (
              <Button variant="ghost" size="icon" onClick={toggleSidebar} className="shrink-0">
                {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            )}
            <h1 className="text-lg md:text-xl font-bold">{t('topology.title')}</h1>
          </div>
          <ViewSwitcher currentView={view} onChange={setView} />
        </div>

        {/* 拓扑画布 */}
        <div className="flex-1 h-full min-h-0">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive m-3 md:m-4">
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
