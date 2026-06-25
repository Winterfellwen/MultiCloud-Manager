import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ChevronLeft, ChevronRight, Network, GitBranch } from 'lucide-react';
import { ReactFlowProvider } from '@xyflow/react';
import { useTopology } from '@/hooks/useTopology';
import { useTopologyTree, getTreeChildren } from '@/hooks/useTopologyTree';
import { TopologyFilter } from '@/components/topology/TopologyFilter';
import { ViewSwitcher } from '@/components/topology/ViewSwitcher';
import { TopologyCanvas } from '@/components/topology/TopologyCanvas';
import { DrilldownView } from '@/components/topology/DrilldownView';
import { VIEW_CONFIG, type TopologyView, type TopologyFilters, type TopologyCategory } from '@/types/topology';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type TopologyMode = 'tree' | 'graph';

export default function Topology() {
  const { t } = useTranslation();
  const [view, setView] = useState<TopologyView>('network');
  const [filters, setFilters] = useState<TopologyFilters>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  // Tree drilldown state
  const [mode, setMode] = useState<TopologyMode>('tree');
  const [drillPath, setDrillPath] = useState<string[]>([]);

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

  // Build tree from ALL nodes (not filtered by view, so the hierarchy is complete)
  const { tree, nodeMap } = useTopologyTree(
    data?.nodes || [],
    data?.edges || []
  );

  // Current node in drilldown
  const currentNode = useMemo(
    () => getTreeChildren(tree, drillPath),
    [tree, drillPath]
  );

  // Breadcrumb segments
  const breadcrumbSegments = useMemo(() => {
    if (drillPath.length === 0) return [];
    return drillPath.map((id) => {
      const node = nodeMap.get(id);
      const treeNode = getTreeChildren(tree, drillPath.slice(0, drillPath.indexOf(id) + 1));
      return {
        id,
        label: node?.label || id,
        count: treeNode?.children.length || 0,
      };
    });
  }, [drillPath, nodeMap, tree]);

  const handleDrilldown = useCallback((nodeId: string) => {
    setDrillPath((prev) => [...prev, nodeId]);
  }, []);

  const handlePathClick = useCallback((index: number) => {
    setDrillPath((prev) => prev.slice(0, index));
  }, []);

  const toggleSidebar = () => setSidebarOpen(!sidebarOpen);

  return (
    <div className="flex h-full flex-col md:flex-row">
      {!isMobile && (
        <div className="w-60 border-r bg-card p-4 h-full overflow-y-auto flex-shrink-0">
          <TopologyFilter filters={filters} onChange={setFilters} />
        </div>
      )}

      {isMobile && (
        <>
          {sidebarOpen && (
            <>
              <div
                className="fixed inset-0 z-40 bg-black/50"
                onClick={() => setSidebarOpen(false)}
                onKeyDown={(e) => { if (e.key === 'Escape') setSidebarOpen(false); }}
                style={{ overscrollBehavior: 'contain' }}
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

      <div className="flex-1 flex flex-col h-full">
        <div className="flex items-center justify-between p-3 md:p-4 border-b gap-2">
          <div className="flex items-center gap-2">
            {isMobile && (
              <Button variant="ghost" size="icon" onClick={toggleSidebar} className="shrink-0">
                {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            )}
            <h1 className="text-lg md:text-xl font-bold">{t('topology.title')}</h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Mode toggle */}
            <div className="flex bg-gray-100 rounded-lg p-0.5 text-xs">
              <button
                onClick={() => { setMode('tree'); setDrillPath([]); }}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-md transition-all font-medium',
                  mode === 'tree'
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                )}
                aria-label={t('topology.modeTree', 'Hierarchy')}
                aria-pressed={mode === 'tree'}
              >
                <GitBranch className="h-3 w-3" aria-hidden="true" />
                {t('topology.modeTree', '层级')}
              </button>
              <button
                onClick={() => setMode('graph')}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-md transition-all font-medium',
                  mode === 'graph'
                    ? 'bg-white shadow-sm text-gray-900'
                    : 'text-gray-500 hover:text-gray-700'
                )}
                aria-label={t('topology.modeGraph', 'Graph')}
                aria-pressed={mode === 'graph'}
              >
                <Network className="h-3 w-3" aria-hidden="true" />
                {t('topology.modeGraph', '关系')}
              </button>
            </div>

            {mode === 'graph' && <ViewSwitcher currentView={view} onChange={setView} />}
          </div>
        </div>

        <div className="flex-1 h-full min-h-0">
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive m-3 md:m-4">
              <AlertCircle className="h-4 w-4" />
              {t('topology.loadFailed')}：{(error as Error).message}
            </div>
          )}

          {mode === 'tree' && currentNode ? (
            <ReactFlowProvider>
              <DrilldownView
                currentNode={currentNode}
                path={breadcrumbSegments}
                onDrilldown={handleDrilldown}
                onPathClick={handlePathClick}
                allEdges={data?.edges || []}
                allNodes={data?.nodes || []}
              />
            </ReactFlowProvider>
          ) : mode === 'tree' && tree.length > 0 ? (
            <ReactFlowProvider>
              <DrilldownView
                currentNode={{
                  id: 'root',
                  node: { id: 'root', type: 'provider', label: 'Cloud Providers', provider: '', region: '', status: 'active', category: 'network', icon: 'globe', data: {} },
                  children: tree,
                  descendantCount: tree.reduce((s, c) => s + 1 + c.descendantCount, 0),
                  instanceCount: tree.reduce((s, c) => s + c.instanceCount, 0),
                }}
                path={[]}
                onDrilldown={handleDrilldown}
                onPathClick={handlePathClick}
                allEdges={data?.edges || []}
                allNodes={data?.nodes || []}
              />
            </ReactFlowProvider>
          ) : mode === 'graph' ? (
            <ReactFlowProvider>
              <TopologyCanvas
                nodes={filteredNodes}
                edges={filteredEdges}
                isLoading={isLoading}
              />
            </ReactFlowProvider>
          ) : null}
        </div>
      </div>
    </div>
  );
}
