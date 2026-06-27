import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, ChevronLeft, ChevronRight, Network, GitBranch, Search, X } from 'lucide-react';
import { ReactFlowProvider } from '@xyflow/react';
import { useTopology } from '@/hooks/useTopology';
import { useTopologyTree, getTreeChildren } from '@/hooks/useTopologyTree';
import { useSyncedState } from '@/hooks/useSyncedState';
import { TopologyFilter } from '@/components/topology/TopologyFilter';
import { ViewSwitcher } from '@/components/topology/ViewSwitcher';
import { GroupModeSwitcher } from '@/components/topology/GroupModeSwitcher';
import { TopologyCanvas } from '@/components/topology/TopologyCanvas';
import { DrilldownView } from '@/components/topology/DrilldownView';
import { VIEW_CONFIG, type TopologyView, type TopologyFilters, type TopologyCategory, type GroupMode } from '@/types/topology';
import { useIsMobile } from '@/hooks/useMediaQuery';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type TopologyMode = 'tree' | 'graph';

export default function Topology() {
  const { t } = useTranslation();
  const [view, setView] = useSyncedState<TopologyView>('view', 'network');
  const [filters, setFilters] = useState<TopologyFilters>({});
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const isMobile = useIsMobile();

  // Tree drilldown state
  const [mode, setMode] = useSyncedState<TopologyMode>('mode', 'tree');
  const [drillPath, setDrillPath] = useState<string[]>([]);
  const [groupMode, setGroupMode] = useSyncedState<GroupMode>('group', 'hierarchy');
  const [searchQuery, setSearchQuery] = useState('');

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

  // Build tree from view-filtered nodes (so view toggle affects tree mode too)
  const { tree, nodeMap } = useTopologyTree(
    mode === 'tree' ? filteredNodes : (data?.nodes || []),
    mode === 'tree' ? filteredEdges : (data?.edges || []),
    groupMode
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
        count: treeNode?.children?.length || 0,
      };
    });
  }, [drillPath, nodeMap, tree]);

  const handleDrilldown = useCallback((nodeId: string) => {
    setDrillPath((prev) => [...prev, nodeId]);
  }, []);

  const handlePathClick = useCallback((index: number) => {
    if (index < 0) {
      setDrillPath([]);
    } else {
      setDrillPath((prev) => prev.slice(0, index + 1));
    }
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
          <div className="flex items-center gap-2 shrink-0">
            {isMobile && (
              <Button variant="ghost" size="icon" onClick={toggleSidebar} className="shrink-0">
                {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            )}
            <h1 className="text-lg md:text-xl font-bold whitespace-nowrap">{t('topology.title')}</h1>
          </div>

          <div className="flex items-center gap-2 overflow-x-auto">
            {/* Mode toggle */}
            <div className="flex bg-muted rounded-lg p-0.5 text-xs">
              <button
                onClick={() => { setMode('tree'); setDrillPath([]); }}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-md transition-all font-medium',
                  mode === 'tree'
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                aria-label={t('topology.modeTree', 'Tree view')}
                aria-pressed={mode === 'tree'}
              >
                <GitBranch className="h-3 w-3" aria-hidden="true" />
                {t('topology.modeTree', '树形')}
              </button>
              <button
                onClick={() => setMode('graph')}
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-md transition-all font-medium',
                  mode === 'graph'
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
                aria-label={t('topology.modeGraph', 'Graph view')}
                aria-pressed={mode === 'graph'}
              >
                <Network className="h-3 w-3" aria-hidden="true" />
                {t('topology.modeGraph', '关系图')}
              </button>
            </div>

            <div className="hidden md:block w-px h-6 bg-border" />
            <ViewSwitcher currentView={view} onChange={setView} />
            <div className="hidden md:block w-px h-6 bg-border" />
            {mode === 'graph' && <GroupModeSwitcher currentMode={groupMode} onChange={setGroupMode} />}
            {mode === 'graph' && <div className="hidden md:block w-px h-6 bg-border" />}
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('topology.search', 'Search...')}
                className="pl-7 pr-7 py-1.5 text-xs border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring w-40"
                aria-label={t('topology.search', 'Search topology')}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
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
                searchQuery={searchQuery}
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
                searchQuery={searchQuery}
              />
            </ReactFlowProvider>
          ) : mode === 'graph' ? (
            <ReactFlowProvider>
              <TopologyCanvas
                nodes={filteredNodes}
                edges={filteredEdges}
                isLoading={isLoading}
                groupMode={groupMode}
              />
            </ReactFlowProvider>
          ) : null}
        </div>
      </div>
    </div>
  );
}
