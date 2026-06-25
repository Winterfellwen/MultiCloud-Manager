# Topology Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Comprehensive overhaul of topology visualization — edges, clustering, search, charts, cost view, URL state, expanded data.

**Architecture:** 7 independent layers, each building on existing code. Additive changes only — no rewrites of working code.

**Tech Stack:** React 18, @xyflow/react v12, framer-motion v11, recharts, Tailwind CSS, react-i18next

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/pages/Topology.tsx` | Page orchestrator, state management, URL sync |
| `src/components/topology/DrilldownView.tsx` | Tree mode canvas with grid + edges |
| `src/components/topology/TopologyCanvas.tsx` | Graph mode canvas with clustering |
| `src/components/topology/ResourceNode.tsx` | Node rendering (glass UI, cost scale, focus) |
| `src/components/topology/ResourceEdge.tsx` | Edge rendering (gradient styling) |
| `src/components/topology/ClusterNode.tsx` | Collapsed cluster rendering (already built) |
| `src/components/topology/GroupModeSwitcher.tsx` | Group mode toggle (already built) |
| `src/components/topology/NodeDetailModal.tsx` | Detail modal with tabs |
| `src/components/topology/NodeDetailTabs/MetricsTab.tsx` | Sparkline charts |
| `src/components/topology/NodeDetailTabs/LogsTab.tsx` | Log list with filters |
| `src/components/topology/KeyboardShortcutOverlay.tsx` | Keyboard shortcuts modal (new) |
| `src/hooks/useTopologyTree.ts` | Tree builder with group modes |
| `src/hooks/useTopologyCluster.ts` | Clustering logic (already built) |
| `src/hooks/useSyncedState.ts` | URL-backed state hook (new) |
| `src/lib/demo/mock-data.ts` | Expanded mock data |
| `src/i18n/locales/{zh,en}.json` | Translations |

---

## L1: Tree Edges + Animations

### Task 1.1: Add virtual parent node and edges to DrilldownView

**Files:**
- Modify: `src/components/topology/DrilldownView.tsx`

- [ ] **Step 1: Add virtual parent node constant and edge generation**

In `DrilldownView.tsx`, add after the `GRID_COLS` constant:

```tsx
const PARENT_X = -200;
```

- [ ] **Step 2: Compute virtual parent Y position and create edge array**

In the `useMemo` that creates `flowNodes`/`flowEdges`, replace the `flowEdges` empty array with:

```tsx
// Virtual parent Y: center of all child nodes
const parentY = displayNodes.length > 0
  ? Math.max(...displayNodes.map((_, i) => {
      const row = Math.floor(i / GRID_COLS);
      return row * (NODE_H + GRID_GAP_Y) + NODE_H / 2;
    })) / 2
  : 0;

// Virtual parent node (not rendered, just for edge anchor)
const virtualParentNode: Node = {
  id: 'virtual-parent',
  type: 'resource',
  position: { x: PARENT_X, y: parentY },
  data: { label: '', type: 'virtual' },
  selectable: false,
  draggable: false,
};

// Add virtual parent to nodes
const fnWithParent = [virtualParentNode, ...fn];

// Edge array: virtual parent → each child
const fe: Edge[] = displayNodes.map(node => ({
  id: `edge-parent-${node.id}`,
  source: 'virtual-parent',
  target: node.id,
  type: 'resource',
  data: { type: 'contains', label: '' } as unknown as Record<string, unknown>,
}));
```

Update the return to use `fnWithParent` and `fe`.

- [ ] **Step 3: Build and verify edges render**

Run: `cd web-console && npm run build`
Expected: Build succeeds. Refresh browser — edges should appear from left side to each node.

- [ ] **Step 4: Commit**

```bash
git add web-console/src/components/topology/DrilldownView.tsx
git commit -m "feat(topology): L1 - add virtual parent edges to tree mode"
```

### Task 1.2: Add framer-motion transitions

**Files:**
- Modify: `src/components/topology/DrilldownView.tsx`

- [ ] **Step 1: Import AnimatePresence and motion**

Add to imports:

```tsx
import { motion, AnimatePresence } from 'framer-motion';
```

- [ ] **Step 2: Wrap ReactFlow in AnimatePresence with key**

Replace the `<div className="flex-1 h-full">` wrapping ReactFlow with:

```tsx
<AnimatePresence mode="wait">
  <motion.div
    key={currentNode.id}
    className="flex-1 h-full"
    initial={{ opacity: 0, x: 20 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -20 }}
    transition={{ duration: 0.25, ease: 'easeOut' }}
  >
    <ReactFlow ... />
  </motion.div>
</AnimatePresence>
```

- [ ] **Step 3: Add breadcrumb stagger animation**

Wrap breadcrumb items in `motion.div` with stagger:

```tsx
{path.map((segment, i) => (
  <motion.div
    key={segment.id}
    initial={{ opacity: 0, x: -10 }}
    animate={{ opacity: 1, x: 0 }}
    transition={{ delay: i * 0.05 }}
    className="flex items-center gap-1 shrink-0"
  >
    ...
  </motion.div>
))}
```

- [ ] **Step 4: Build and verify transitions**

Run: `cd web-console && npm run build`
Expected: Build succeeds. Click to drill — smooth fade/slide transitions between levels.

- [ ] **Step 5: Commit**

```bash
git add web-console/src/components/topology/DrilldownView.tsx
git commit -m "feat(topology): L1 - add framer-motion transitions to tree drilldown"
```

---

## L2: Clustering Integration

### Task 2.1: Wire GroupModeSwitcher into Topology page

**Files:**
- Modify: `src/pages/Topology.tsx`

- [ ] **Step 1: Add groupMode state and import**

Add import:

```tsx
import { GroupModeSwitcher } from '@/components/topology/GroupModeSwitcher';
import { type GroupMode } from '@/types/topology';
```

Add state:

```tsx
const [groupMode, setGroupMode] = useState<GroupMode>('hierarchy');
```

- [ ] **Step 2: Add GroupModeSwitcher to header**

In the header `<div className="flex items-center gap-2">` section, add after mode toggle:

```tsx
<GroupModeSwitcher currentMode={groupMode} onChange={setGroupMode} />
```

- [ ] **Step 3: Build and verify**

Run: `cd web-console && npm run build`
Expected: Build succeeds. Group mode buttons appear in header.

- [ ] **Step 4: Commit**

```bash
git add web-console/src/pages/Topology.tsx
git commit -m "feat(topology): L2 - wire GroupModeSwitcher into page header"
```

### Task 2.2: Wire ClusterNode into TopologyCanvas

**Files:**
- Modify: `src/components/topology/TopologyCanvas.tsx`

- [ ] **Step 1: Import ClusterNode and useTopologyCluster**

Add imports:

```tsx
import { ClusterNode } from './ClusterNode';
import { useTopologyCluster } from '@/hooks/useTopologyCluster';
```

- [ ] **Step 2: Register ClusterNode in nodeTypes**

Update nodeTypes:

```tsx
const nodeTypes = {
  resource: ResourceNode,
  cluster: ClusterNode,
};
```

- [ ] **Step 3: Add groupMode and collapsedClusters props**

Update the `TopologyCanvasProps` interface:

```tsx
interface TopologyCanvasProps {
  nodes: TopologyNode[];
  edges: TopologyEdge[];
  isLoading?: boolean;
  groupMode?: GroupMode;
}
```

Update the function signature:

```tsx
export function TopologyCanvas({ nodes, edges, isLoading, groupMode = 'hierarchy' }: TopologyCanvasProps) {
```

- [ ] **Step 4: Add collapsedClusters state and wire useTopologyCluster**

Add state:

```tsx
const [collapsedClusters, setCollapsedClusters] = useState<Set<string>>(new Set());
```

Add clustering logic before the existing `useTopologySummary` call:

```tsx
const { visibleNodes, visibleEdges } = useTopologyCluster(
  nodes, edges, groupMode, collapsedClusters
);
```

Update `displayNodes`/`displayEdges` to use `visibleNodes`/`visibleEdges` instead of `nodes`/`edges` when `groupMode !== 'hierarchy'`.

- [ ] **Step 5: Build and verify**

Run: `cd web-console && npm run build`
Expected: Build succeeds. Switching group modes shows clustered nodes in graph mode.

- [ ] **Step 6: Commit**

```bash
git add web-console/src/components/topology/TopologyCanvas.tsx
git commit -m "feat(topology): L2 - wire ClusterNode and useTopologyCluster into graph mode"
```

### Task 2.3: Wire ClusterNode into DrilldownView

**Files:**
- Modify: `src/components/topology/DrilldownView.tsx`

- [ ] **Step 1: Import ClusterNode**

Add import:

```tsx
import { ClusterNode } from './ClusterNode';
```

- [ ] **Step 2: Register in nodeTypes**

Update:

```tsx
const nodeTypes = { resource: ResourceNode, cluster: ClusterNode };
```

- [ ] **Step 3: Build and verify**

Run: `cd web-console && npm run build`

- [ ] **Step 4: Commit**

```bash
git add web-console/src/components/topology/DrilldownView.tsx
git commit -m "feat(topology): L2 - register ClusterNode in DrilldownView"
```

---

## L3: Search + Keyboard Navigation

### Task 3.1: Add search bar to Topology page

**Files:**
- Modify: `src/pages/Topology.tsx`

- [ ] **Step 1: Add search state and import**

```tsx
import { Search, X } from 'lucide-react';
```

Add state:

```tsx
const [searchQuery, setSearchQuery] = useState('');
```

- [ ] **Step 2: Add search input to header**

In header, after GroupModeSwitcher:

```tsx
<div className="relative">
  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
  <input
    type="text"
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
    placeholder={t('topology.search', 'Search...')}
    className="pl-7 pr-7 py-1.5 text-xs border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 w-40"
    aria-label={t('topology.search', 'Search topology')}
  />
  {searchQuery && (
    <button
      onClick={() => setSearchQuery('')}
      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
      aria-label="Clear search"
    >
      <X className="h-3 w-3" />
    </button>
  )}
</div>
```

- [ ] **Step 3: Pass searchQuery to DrilldownView**

Add `searchQuery` prop to DrilldownView:

```tsx
<DrilldownView
  ...
  searchQuery={searchQuery}
/>
```

- [ ] **Step 4: Build and verify**

Run: `cd web-console && npm run build`

- [ ] **Step 5: Commit**

```bash
git add web-console/src/pages/Topology.tsx
git commit -m "feat(topology): L3 - add search bar to topology header"
```

### Task 3.2: Implement search filtering in DrilldownView

**Files:**
- Modify: `src/components/topology/DrilldownView.tsx`

- [ ] **Step 1: Add searchQuery prop**

Update `DrilldownViewProps`:

```tsx
interface DrilldownViewProps {
  currentNode: TreeNode;
  path: Array<{ id: string; label: string; count: number }>;
  onDrilldown: (nodeId: string) => void;
  onPathClick: (index: number) => void;
  allEdges: TopologyEdge[];
  allNodes: TopologyNode[];
  searchQuery?: string;
}
```

Update function signature to accept `searchQuery = ''`.

- [ ] **Step 2: Add search filtering logic**

After `displayNodes` useMemo, add:

```tsx
const filteredNodes = useMemo(() => {
  if (!searchQuery) return displayNodes;
  const q = searchQuery.toLowerCase();
  return displayNodes.filter(n =>
    n.label.toLowerCase().includes(q) ||
    n.type.toLowerCase().includes(q) ||
    n.provider.toLowerCase().includes(q)
  );
}, [displayNodes, searchQuery]);

const matchedIds = useMemo(() => {
  return new Set(filteredNodes.map(n => n.id));
}, [filteredNodes]);
```

- [ ] **Step 3: Apply opacity dimming to non-matching nodes**

In the `flowNodes` useMemo, add style to nodes:

```tsx
style: {
  opacity: searchQuery && !matchedIds.has(node.id) ? 0.2 : 1,
  transition: 'opacity 0.2s',
}
```

- [ ] **Step 4: Build and verify**

Run: `cd web-console && npm run build`
Expected: Typing in search dims non-matching nodes.

- [ ] **Step 5: Commit**

```bash
git add web-console/src/components/topology/DrilldownView.tsx
git commit -m "feat(topology): L3 - search filtering with opacity dimming"
```

### Task 3.3: Add keyboard navigation

**Files:**
- Modify: `src/components/topology/DrilldownView.tsx`

- [ ] **Step 1: Add focusedNodeId state and keyboard handler**

```tsx
const [focusedIdx, setFocusedIdx] = useState<number>(-1);

const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
  const cols = GRID_COLS;
  const total = displayNodes.length;

  switch (e.key) {
    case 'ArrowRight':
      e.preventDefault();
      setFocusedIdx(prev => Math.min(prev + 1, total - 1));
      break;
    case 'ArrowLeft':
      e.preventDefault();
      setFocusedIdx(prev => Math.max(prev - 1, 0));
      break;
    case 'ArrowDown':
      e.preventDefault();
      setFocusedIdx(prev => Math.min(prev + cols, total - 1));
      break;
    case 'ArrowUp':
      e.preventDefault();
      setFocusedIdx(prev => Math.max(prev - cols, 0));
      break;
    case 'Enter':
      e.preventDefault();
      if (focusedIdx >= 0 && focusedIdx < total) {
        const node = displayNodes[focusedIdx];
        const treeNode = currentNode.children.find(c => c.id === node.id);
        if (topologyNode.type === 'instance') {
          setSelectedNode(node);
        } else if (treeNode && treeNode.children.length > 0) {
          onDrilldown(node.id);
        }
      }
      break;
    case 'Escape':
      e.preventDefault();
      if (path.length > 0) onPathClick(path.length - 1);
      break;
  }
}, [displayNodes, focusedIdx, currentNode, path, onDrilldown, onPathClick]);
```

- [ ] **Step 2: Add tabIndex and onKeyDown to canvas container**

Update the canvas `<div>`:

```tsx
<div
  className="flex-1 h-full"
  tabIndex={0}
  onKeyDown={handleKeyDown}
  role="tree"
  aria-label="Topology hierarchy"
>
```

- [ ] **Step 3: Add focus ring to focused node**

In `flowNodes` useMemo, add highlight for focused node:

```tsx
style: {
  opacity: searchQuery && !matchedIds.has(node.id) ? 0.2 : 1,
  outline: idx === focusedIdx ? '2px solid #3b82f6' : 'none',
  outlineOffset: '2px',
  borderRadius: '16px',
  transition: 'opacity 0.2s, outline 0.1s',
}
```

- [ ] **Step 4: Build and verify**

Run: `cd web-console && npm run build`
Expected: Tab to focus canvas, arrow keys move blue outline, Enter drills.

- [ ] **Step 5: Commit**

```bash
git add web-console/src/components/topology/DrilldownView.tsx
git commit -m "feat(topology): L3 - keyboard navigation with arrow keys, Enter, Escape"
```

### Task 3.4: Add keyboard shortcut overlay

**Files:**
- Create: `src/components/topology/KeyboardShortcutOverlay.tsx`

- [ ] **Step 1: Create KeyboardShortcutOverlay component**

```tsx
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Props {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS = [
  { keys: ['←', '→', '↑', '↓'], description: 'Navigate between nodes' },
  { keys: ['Enter'], description: 'Drill into node / Open modal' },
  { keys: ['Esc'], description: 'Go back one level' },
  { keys: ['?'], description: 'Toggle this overlay' },
];

export function KeyboardShortcutOverlay({ open, onClose }: Props) {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40"
            onClick={onClose}
          />
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
          >
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-gray-900">{t('topology.shortcuts.title', 'Keyboard Shortcuts')}</h3>
                <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-3">
                {SHORTCUTS.map((s) => (
                  <div key={s.description} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600">{s.description}</span>
                    <div className="flex gap-1">
                      {s.keys.map((k) => (
                        <kbd key={k} className="px-2 py-0.5 text-xs font-mono bg-gray-100 border rounded">
                          {k}
                        </kbd>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
```

- [ ] **Step 2: Wire into DrilldownView**

Import and add state:

```tsx
const [showShortcuts, setShowShortcuts] = useState(false);
```

Add `?` key handler in `handleKeyDown`:

```tsx
case '?':
  e.preventDefault();
  setShowShortcuts(prev => !prev);
  break;
```

Add overlay before closing `</div>`:

```tsx
<KeyboardShortcutOverlay open={showShortcuts} onClose={() => setShowShortcuts(false)} />
```

- [ ] **Step 3: Build and verify**

Run: `cd web-console && npm run build`

- [ ] **Step 4: Commit**

```bash
git add web-console/src/components/topology/KeyboardShortcutOverlay.tsx web-console/src/components/topology/DrilldownView.tsx
git commit -m "feat(topology): L3 - keyboard shortcut overlay (? to toggle)"
```

---

## L4: Metrics/Logs Tabs

### Task 4.1: Install recharts

**Files:**
- Modify: `web-console/package.json`

- [ ] **Step 1: Install recharts**

Run: `cd web-console && npm install recharts`

- [ ] **Step 2: Verify build**

Run: `cd web-console && npm run build`
Expected: Build succeeds with recharts installed.

- [ ] **Step 3: Commit**

```bash
git add web-console/package.json web-console/package-lock.json
git commit -m "deps: add recharts for topology metrics charts"
```

### Task 4.2: Rewrite MetricsTab with sparklines

**Files:**
- Modify: `src/components/topology/NodeDetailTabs/MetricsTab.tsx`

- [ ] **Step 1: Rewrite MetricsTab with recharts**

Replace entire file:

```tsx
import { useMemo } from 'react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getDemoMetrics } from '@/lib/demo/mock-data';

interface Props {
  instanceId?: string;
}

const CHARTS = [
  { key: 'cpu', label: 'CPU Usage', unit: '%', color: '#3b82f6', gradient: ['#93c5fd', '#3b82f6'] },
  { key: 'memory', label: 'Memory', unit: 'MB', color: '#8b5cf6', gradient: ['#c4b5fd', '#8b5cf6'] },
  { key: 'network', label: 'Network I/O', unit: 'KB/s', color: '#10b981', gradient: ['#6ee7b7', '#10b981'] },
  { key: 'disk', label: 'Disk I/O', unit: 'MB/s', color: '#f59e0b', gradient: ['#fcd34d', '#f59e0b'] },
];

export function MetricsTab({ instanceId = 'demo-instance-0' }: Props) {
  const metrics = useMemo(() => {
    const raw = getDemoMetrics(instanceId, 24);
    return {
      cpu: raw.map((p, i) => ({ time: i, value: p.value })),
      memory: raw.map((p, i) => ({ time: i, value: p.value * 0.7 + 10 })),
      network: raw.map((p, i) => ({ time: i, value: Math.max(0, p.value - 30 + Math.sin(i) * 20) })),
      disk: raw.map((p, i) => ({ time: i, value: Math.max(0, p.value * 0.4 + Math.cos(i) * 10) })),
    };
  }, [instanceId]);

  return (
    <div className="grid grid-cols-2 gap-4">
      {CHARTS.map((chart) => (
        <div key={chart.key} className="border rounded-xl p-3">
          <div className="text-xs font-medium text-gray-600 mb-2">{chart.label}</div>
          <ResponsiveContainer width="100%" height={80}>
            {chart.key === 'network' ? (
              <LineChart data={metrics[chart.key as keyof typeof metrics]}>
                <defs>
                  <linearGradient id={`grad-${chart.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chart.gradient[0]} />
                    <stop offset="100%" stopColor={chart.gradient[1]} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" hide />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  formatter={(v: number) => [`${v.toFixed(1)} ${chart.unit}`, chart.label]}
                />
                <Line type="monotone" dataKey="value" stroke={chart.color} strokeWidth={1.5} dot={false} />
              </LineChart>
            ) : (
              <AreaChart data={metrics[chart.key as keyof typeof metrics]}>
                <defs>
                  <linearGradient id={`grad-${chart.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chart.gradient[0]} stopOpacity={0.3} />
                    <stop offset="100%" stopColor={chart.gradient[1]} stopOpacity={0.05} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" hide />
                <YAxis hide />
                <Tooltip
                  contentStyle={{ fontSize: 11, borderRadius: 8 }}
                  formatter={(v: number) => [`${v.toFixed(1)} ${chart.unit}`, chart.label]}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={chart.color}
                  strokeWidth={1.5}
                  fill={`url(#grad-${chart.key})`}
                />
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Build and verify**

Run: `cd web-console && npm run build`
Expected: MetricsTab shows 4 sparkline charts with gradient fills.

- [ ] **Step 4: Commit**

```bash
git add web-console/src/components/topology/NodeDetailTabs/MetricsTab.tsx
git commit -m "feat(topology): L4 - rewrite MetricsTab with recharts sparklines"
```

### Task 4.3: Add getDemoLogs and rewrite LogsTab

**Files:**
- Modify: `src/lib/demo/mock-data.ts`
- Modify: `src/components/topology/NodeDetailTabs/LogsTab.tsx`

- [ ] **Step 1: Add getDemoLogs to mock-data.ts**

Add after `getDemoMetrics`:

```tsx
export interface DemoLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

const LOG_MESSAGES = {
  info: [
    'Health check passed',
    'Instance started successfully',
    'Configuration reloaded',
    'Connection pool resized',
    'Cache invalidated',
    'Request processed successfully',
  ],
  warn: [
    'High memory usage detected (>85%)',
    'Connection pool near capacity',
    'Disk usage above 70%',
    'Response time elevated (>500ms)',
    'Certificate expiring in 30 days',
  ],
  error: [
    'Connection timeout to database',
    'Failed to bind to port',
    'Out of memory killed',
    'Disk write failed',
    'Authentication failed',
  ],
};

const _logsCache = new Map<string, DemoLogEntry[]>();

export function getDemoLogs(nodeId: string, count: number = 50): DemoLogEntry[] {
  const key = `${nodeId}:${count}`;
  if (!_logsCache.has(key)) {
    const rand = seededRandom(nodeId.charCodeAt(nodeId.length - 1) * 13);
    const entries: DemoLogEntry[] = [];
    const now = Date.now();
    for (let i = 0; i < count; i++) {
      const levelRand = rand();
      const level = levelRand < 0.7 ? 'info' : levelRand < 0.9 ? 'warn' : 'error';
      const msgs = LOG_MESSAGES[level];
      entries.push({
        timestamp: new Date(now - i * (30000 + rand() * 120000)).toISOString(),
        level,
        message: msgs[Math.floor(rand() * msgs.length)],
      });
    }
    _logsCache.set(key, entries);
  }
  return _logsCache.get(key)!;
}
```

- [ ] **Step 2: Rewrite LogsTab**

Replace entire file:

```tsx
import { useState, useMemo } from 'react';
import { getDemoLogs, type DemoLogEntry } from '@/lib/demo/mock-data';
import { cn } from '@/lib/utils';

interface Props {
  nodeId?: string;
}

type LevelFilter = 'all' | 'info' | 'warn' | 'error';

const LEVEL_COLORS: Record<string, string> = {
  info: 'bg-blue-400',
  warn: 'bg-amber-400',
  error: 'bg-red-400',
};

export function LogsTab({ nodeId = 'demo-instance-0' }: Props) {
  const [filter, setFilter] = useState<LevelFilter>('all');
  const logs = useMemo(() => getDemoLogs(nodeId, 50), [nodeId]);

  const filtered = useMemo(() => {
    if (filter === 'all') return logs;
    return logs.filter(l => l.level === filter);
  }, [logs, filter]);

  return (
    <div className="space-y-3">
      {/* Filter buttons */}
      <div className="flex gap-1.5">
        {(['all', 'info', 'warn', 'error'] as LevelFilter[]).map((level) => (
          <button
            key={level}
            onClick={() => setFilter(level)}
            className={cn(
              'px-2.5 py-1 text-xs font-medium rounded-lg transition-colors',
              filter === level
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {level === 'all' ? 'All' : level.charAt(0).toUpperCase() + level.slice(1)}
          </button>
        ))}
      </div>

      {/* Log list */}
      <div className="max-h-[300px] overflow-y-auto space-y-1 font-mono text-xs">
        {filtered.length === 0 ? (
          <div className="text-center py-8 text-gray-400">No logs found</div>
        ) : (
          filtered.map((log, i) => (
            <div key={i} className="flex items-start gap-2 py-1 hover:bg-gray-50 rounded px-2">
              <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', LEVEL_COLORS[log.level])} />
              <span className="text-gray-400 shrink-0">
                {new Date(log.timestamp).toLocaleTimeString()}
              </span>
              <span className="text-gray-700">{log.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Build and verify**

Run: `cd web-console && npm run build`
Expected: LogsTab shows 50 log entries with level filter buttons.

- [ ] **Step 4: Commit**

```bash
git add web-console/src/lib/demo/mock-data.ts web-console/src/components/topology/NodeDetailTabs/LogsTab.tsx
git commit -m "feat(topology): L4 - add getDemoLogs and rewrite LogsTab with filters"
```

---

## L5: Cost View

### Task 5.1: Add cost bracket grouping to useTopologyTree

**Files:**
- Modify: `src/hooks/useTopologyTree.ts`

- [ ] **Step 1: Add cost bracket helper and groupMode parameter**

Add after imports:

```tsx
function getCostBracket(cost: number): string {
  if (cost <= 0) return 'free';
  if (cost <= 100) return 'low';
  if (cost <= 300) return 'mid';
  return 'high';
}

const COST_BRACKET_LABELS: Record<string, string> = {
  free: 'Free ($0)',
  low: 'Low ($1-100)',
  mid: 'Mid ($101-300)',
  high: 'High ($300+)',
};

const COST_BRACKET_COLORS: Record<string, string> = {
  free: '#9ca3af',
  low: '#10b981',
  mid: '#f59e0b',
  high: '#ef4444',
};
```

- [ ] **Step 2: Update useTopologyTree to accept groupMode**

Update the function signature:

```tsx
export function useTopologyTree(
  nodes: TopologyNode[],
  edges: TopologyEdge[],
  groupMode: GroupMode = 'hierarchy'
): { tree: TreeNode[]; nodeMap: Map<string, TopologyNode> }
```

- [ ] **Step 3: Add cost/semantic/team grouping branches**

After the existing hierarchy tree builder, add:

```tsx
if (groupMode === 'cost') {
  // Group by cost brackets
  const groups = new Map<string, TopologyNode[]>();
  for (const node of nodes) {
    if (node.type === 'instance') {
      const cost = (node.data?.monthlyCost as number) || 0;
      const bracket = getCostBracket(cost);
      if (!groups.has(bracket)) groups.set(bracket, []);
      groups.get(bracket)!.push(node);
    }
  }

  const tree: TreeNode[] = [];
  for (const [bracket, bracketNodes] of groups) {
    const providerNode: TopologyNode = {
      id: `cost-${bracket}`,
      type: 'provider',
      label: COST_BRACKET_LABELS[bracket],
      provider: '',
      region: '',
      status: 'active',
      category: 'network',
      icon: 'globe',
      data: { costBracket: bracket, color: COST_BRACKET_COLORS[bracket] },
    };
    tree.push({
      id: `cost-${bracket}`,
      node: providerNode,
      children: bracketNodes.map(n => ({
        id: n.id, node: n, children: [], descendantCount: 0, instanceCount: 0,
      })),
      descendantCount: bracketNodes.length,
      instanceCount: bracketNodes.length,
    });
  }
  return { tree, nodeMap };
}
```

(Similar branches for `semantic` and `team` grouping.)

- [ ] **Step 4: Build and verify**

Run: `cd web-console && npm run build`

- [ ] **Step 5: Commit**

```bash
git add web-console/src/hooks/useTopologyTree.ts
git commit -m "feat(topology): L5 - add cost bracket grouping to useTopologyTree"
```

### Task 5.2: Add cost scaling and label to ResourceNode

**Files:**
- Modify: `src/components/topology/ResourceNode.tsx`

- [ ] **Step 1: Add costScale prop and cost label**

Update `ResourceNodeComponent` to accept optional `costScale`:

```tsx
function ResourceNodeComponent({ data, selected, costScale = 1 }: NodeProps<ResourceNodeData> & { costScale?: number }) {
```

Add cost label after status indicator:

```tsx
{/* Cost label (cost mode) */}
{costScale > 1 && (data.data as Record<string, unknown>)?.monthlyCost && (
  <div className="text-[9px] font-mono text-gray-500 mt-1">
    ${(data.data as Record<string, unknown>).monthlyCost as number}/mo
  </div>
)}
```

- [ ] **Step 2: Build and verify**

Run: `cd web-console && npm run build`

- [ ] **Step 3: Commit**

```bash
git add web-console/src/components/topology/ResourceNode.tsx
git commit -m "feat(topology): L5 - add costScale prop and cost label to ResourceNode"
```

---

## L6: URL State Persistence

### Task 6.1: Create useSyncedState hook

**Files:**
- Create: `src/hooks/useSyncedState.ts`

- [ ] **Step 1: Create useSyncedState hook**

```tsx
import { useState, useCallback, useEffect } from 'react';

export function useSyncedState<T>(
  key: string,
  defaultValue: T,
  serialize: (v: T) => string = String,
  deserialize: (s: string) => T = String as unknown as (s: string) => T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    const params = new URLSearchParams(window.location.search);
    const raw = params.get(key);
    return raw !== null ? deserialize(raw) : defaultValue;
  });

  const setSyncedValue = useCallback((value: T | ((prev: T) => T)) => {
    setValue(prev => {
      const next = value instanceof Function ? value(prev) : value;
      const params = new URLSearchParams(window.location.search);
      params.set(key, serialize(next));
      window.history.replaceState(null, '', `?${params.toString()}`);
      return next;
    });
  }, [key, serialize]);

  return [value, setSyncedValue];
}
```

- [ ] **Step 2: Build and verify**

Run: `cd web-console && npm run build`

- [ ] **Step 3: Commit**

```bash
git add web-console/src/hooks/useSyncedState.ts
git commit -m "feat(topology): L6 - create useSyncedState hook for URL persistence"
```

### Task 6.2: Wire useSyncedState into Topology page

**Files:**
- Modify: `src/pages/Topology.tsx`

- [ ] **Step 1: Import and replace useState calls**

```tsx
import { useSyncedState } from '@/hooks/useSyncedState';
```

Replace:

```tsx
const [view, setView] = useSyncedState<TopologyView>('view', 'network');
const [mode, setMode] = useSyncedState<TopologyMode>('mode', 'tree');
const [groupMode, setGroupMode] = useSyncedState<GroupMode>('group', 'hierarchy');
const [drillPath, setDrillPath] = useSyncedState<string[]>('path', []);
```

- [ ] **Step 2: Build and verify**

Run: `cd web-console && npm run build`
Expected: URL updates when changing mode/view/group. Refreshing preserves state.

- [ ] **Step 3: Commit**

```bash
git add web-console/src/pages/Topology.tsx
git commit -m "feat(topology): L6 - wire URL state persistence into Topology page"
```

---

## L7: Expanded Mock Data

### Task 7.1: Rewrite getDemoTopology with expanded data

**Files:**
- Modify: `src/lib/demo/mock-data.ts`

- [ ] **Step 1: Rewrite getDemoTopology with 250-350 nodes**

Replace the `getDemoTopology` function with expanded generation:
- 5 providers (AWS, Aliyun, Azure, Huawei, Tencent)
- 2-4 VPCs per provider
- 2-3 subnets per VPC
- 5-10 instances per subnet
- 2 SGs per VPC, 1-2 LBs per provider, 1-2 DBs per provider
- 2-3 buckets, 1-2 caches, 1-2 CDNs per provider
- 1-2 containers, 1 AI service per provider
- Add `data.team` field to all nodes
- Wider cost distribution
- More edge diversity

- [ ] **Step 2: Build and verify**

Run: `cd web-console && npm run build`
Expected: Topology page loads with 250-350 nodes across 5 providers.

- [ ] **Step 3: Commit**

```bash
git add web-console/src/lib/demo/mock-data.ts
git commit -m "feat(topology): L7 - expand mock data to 250-350 nodes with all resource types"
```

---

## L8: Integration Testing

### Task 8.1: End-to-end verification

- [ ] **Step 1: Build production bundle**

Run: `cd web-console && npm run build`
Expected: Build succeeds with no errors.

- [ ] **Step 2: Deploy and test all layers**

Deploy to Docker and verify:
1. Tree mode: Edges render from left to nodes
2. Tree mode: Click provider → VPC → Subnet → Instance
3. Tree mode: Instance click opens modal with Metrics (sparklines) and Logs (filterable list)
4. Graph mode: ClusterNode appears when groupMode != hierarchy
5. Search: Typing dims non-matching nodes
6. Keyboard: Tab to focus, arrow keys navigate, Enter drills, Escape goes back
7. Cost mode: Nodes scale by cost, cost labels show
8. URL: Refresh preserves mode/view/group/path state
9. Mock data: 5 providers visible at root level

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "feat(topology): complete overhaul - edges, clustering, search, charts, cost, URL state"
```
