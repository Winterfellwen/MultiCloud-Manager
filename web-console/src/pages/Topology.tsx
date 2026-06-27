import { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { AlertCircle, ChevronLeft, ChevronRight, Network, Search, X, FolderOpen, Server, ExternalLink } from 'lucide-react';
import { ReactFlowProvider } from '@xyflow/react';
import { useTopology } from '@/hooks/useTopology';
import { useTopologyTree, getTreeChildren } from '@/hooks/useTopologyTree';
import { useSyncedState } from '@/hooks/useSyncedState';
import { TopologyFilter } from '@/components/topology/TopologyFilter';
import { ViewSwitcher } from '@/components/topology/ViewSwitcher';
import { GroupModeSwitcher } from '@/components/topology/GroupModeSwitcher';
import { TopologyCanvas } from '@/components/topology/TopologyCanvas';
import { DrilldownView } from '@/components/topology/DrilldownView';
import { VIEW_CONFIG, type TopologyView, type TopologyFilters, type TopologyCategory, type GroupMode, type TopologyNode } from '@/types/topology';
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
  const [searchResults, setSearchResults] = useState<TopologyNode[]>([]);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error } = useTopology(filters);

  // Global search across all nodes
  useEffect(() => {
    if (!searchQuery || !data) {
      setSearchResults([]);
      return;
    }
    const q = searchQuery.toLowerCase();
    const results = data.nodes.filter((node) =>
      node.label.toLowerCase().includes(q) ||
      node.provider.toLowerCase().includes(q) ||
      node.region.toLowerCase().includes(q) ||
      node.type.toLowerCase().includes(q)
    ).slice(0, 10);
    setSearchResults(results);
  }, [searchQuery, data]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function handleSearchResultClick(node: TopologyNode) {
    // Set search query to highlight the resource in current view
    setSearchQuery(node.label);
    setShowResults(false);
    // Reset drill path to show from root
    setDrillPath([]);
  }

  const filteredNodes = useMemo(() => {
    if (!data) return [];
    const config = VIEW_CONFIG[view];
    // First pass: get nodes matching the view categories
    const matchingNodes = data.nodes.filter((node) =>
      config.categories.includes(node.category as TopologyCategory)
    );
    // Second pass: include parent nodes (vpc, subnet) needed for hierarchy
    const matchingIds = new Set(matchingNodes.map(n => n.id));
    const parentIds = new Set<string>();
    for (const edge of data.edges) {
      if (edge.type === 'contains' && matchingIds.has(edge.source)) {
        parentIds.add(edge.target);
      }
    }
    // Include all parent nodes in the hierarchy chain
    const allNeededIds = new Set([...matchingIds, ...parentIds]);
    return data.nodes.filter((node) => allNeededIds.has(node.id));
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
        {/* Header: title + mode toggle + search */}
        <div className="flex items-center justify-between p-3 md:p-4 border-b gap-2">
          <div className="flex items-center gap-3 shrink-0">
            {isMobile && (
              <Button variant="ghost" size="icon" onClick={toggleSidebar} className="shrink-0">
                {sidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            )}
            <h1 className="text-lg md:text-xl font-bold whitespace-nowrap">{t('topology.title')}</h1>
            <div className="hidden sm:flex items-center gap-1 bg-muted rounded-lg p-0.5">
              <button
                onClick={() => { setMode('tree'); setDrillPath([]); }}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all font-medium text-xs',
                  mode === 'tree'
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <FolderOpen className="h-3.5 w-3.5" />
                {t('topology.modeTree', '浏览')}
              </button>
              <button
                onClick={() => setMode('graph')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md transition-all font-medium text-xs',
                  mode === 'graph'
                    ? 'bg-background shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Network className="h-3.5 w-3.5" />
                {t('topology.modeGraph', '关系图')}
              </button>
            </div>
          </div>
          <div className="relative" ref={searchRef}>
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setShowResults(true); }}
              onFocus={() => searchQuery && setShowResults(true)}
              placeholder={t('topology.searchPlaceholder', '搜索所有资源...')}
              className="pl-7 pr-7 py-1.5 text-xs border rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring w-48"
              aria-label={t('topology.search', 'Search resources')}
            />
            {searchQuery && (
              <button
                onClick={() => { setSearchQuery(''); setShowResults(false); }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
            {/* Search results dropdown */}
            {showResults && searchResults.length > 0 && (
              <div className="absolute top-full right-0 mt-1 w-72 bg-background border rounded-lg shadow-lg z-50 max-h-64 overflow-auto">
                <div className="px-3 py-1.5 text-[10px] text-muted-foreground border-b">
                  {t('topology.searchResults', { count: searchResults.length })}
                </div>
                {searchResults.map((node) => (
                  <button
                    key={node.id}
                    onClick={() => handleSearchResultClick(node)}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                  >
                    <Server className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{node.label}</div>
                      <div className="text-xs text-muted-foreground truncate">
                        {node.provider} · {node.region} · {node.type}
                      </div>
                    </div>
                    <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                  </button>
                ))}
              </div>
            )}
            {showResults && searchQuery && searchResults.length === 0 && (
              <div className="absolute top-full right-0 mt-1 w-72 bg-background border rounded-lg shadow-lg z-50 p-3 text-center text-sm text-muted-foreground">
                {t('topology.noResults')}
              </div>
            )}
          </div>
        </div>

        {/* Controls: view + group mode */}
        <div className="flex items-center gap-3 px-3 md:px-4 py-2 border-b bg-muted/30">
        </div>

        {/* Mode-specific controls */}
        <div className="flex items-center gap-3 px-3 md:px-4 py-2 border-b bg-muted/30">
          <ViewSwitcher currentView={view} onChange={setView} />
          {mode === 'graph' && (
            <>
              <div className="w-px h-5 bg-border" />
              <GroupModeSwitcher currentMode={groupMode} onChange={setGroupMode} />
            </>
          )}
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
