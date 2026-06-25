# Topology Overhaul — Comprehensive Design Spec

**Date:** 2026-06-25
**Status:** Approved
**Approach:** Incremental Layering (7 independent layers)

## Overview

Comprehensive overhaul of the MultiCloud Manager topology visualization. Builds on existing tree drilldown + graph mode architecture. Adds visual hierarchy, clustering, search, real charts, cost view, URL persistence, and expanded data.

## Current State

- **Tree mode:** Grid of ResourceNode cards, breadcrumb navigation, click to drill (Cloud→VPC→Subnet→Instance), instance click opens NodeDetailModal
- **Graph mode:** React Flow canvas with dagre/d3-force layout, overview/expanded view, MiniMap, Controls
- **Built but unwired:** GroupModeSwitcher, ClusterNode, useTopologyCluster
- **Placeholders:** MetricsTab, LogsTab
- **Missing:** Edges in tree mode, search, keyboard nav, URL state, cost visualization

## Architecture

All changes are additive layers. No existing working code is replaced — only extended.

```
Topology.tsx (orchestrator)
├── Header: [Mode Toggle] [GroupMode Switcher] [Search] [ViewSwitcher]
├── Sidebar: TopologyFilter (existing)
├── Tree Mode: DrilldownView
│   ├── Breadcrumb (existing)
│   ├── Grid + Edges (new: L1)
│   ├── ClusterNode support (new: L2)
│   ├── Keyboard focus (new: L3)
│   └── NodeDetailModal (existing, enhanced: L4)
├── Graph Mode: TopologyCanvas
│   ├── ClusterNode support (new: L2)
│   └── Cost sizing (new: L5)
└── URL sync (new: L6)
```

## L1: Tree Edges + Animations

### Problem
Tree mode is a flat grid with no visual connections between parent and children.

### Design

**Edges in DrilldownView:**
- Add a virtual parent node at position `(-200, centerY)` (off-screen left)
- Render `contains` edges from virtual parent to each visible child
- Use existing `ResourceEdge` component with `type: 'contains'` (gray gradient)
- Edge path: bezier from `(-200, centerY)` to each child's left handle

**Animate transitions:**
- Wrap child grid in framer-motion `AnimatePresence`
- On drilldown: current children exit (`opacity: 0, x: -20, transition: 0.2s`), new children enter (`opacity: 0 → 1, x: 20 → 0, transition: 0.3s`)
- Breadcrumb items slide in from left with stagger (0.05s per item)

**Files:**
- `DrilldownView.tsx` — Add virtual parent, edge array, AnimatePresence wrapper

### Edge Rendering Detail

```tsx
// Virtual parent position
const PARENT_X = -200;
const PARENT_Y = Math.max(...displayNodes.map((_, i) => {
  const row = Math.floor(i / GRID_COLS);
  return row * (NODE_H + GRID_GAP_Y) + NODE_H / 2;
})) / 2;

// Edge array
const treeEdges: Edge[] = displayNodes.map(node => ({
  id: `edge-parent-${node.id}`,
  source: 'virtual-parent',
  target: node.id,
  type: 'resource',
  data: { type: 'contains', label: '' },
}));

// Virtual parent node (not rendered, just for edge anchor)
const virtualParentNode: Node = {
  id: 'virtual-parent',
  type: 'resource',
  position: { x: PARENT_X, y: PARENT_Y },
  data: { label: '', type: 'virtual' },
  selectable: false,
  draggable: false,
};
```

## L2: Clustering Integration

### Problem
GroupModeSwitcher, ClusterNode, useTopologyCluster built but never wired in.

### Design

**GroupModeSwitcher in header:**
- Add existing component to header bar, visible in both modes
- State: `groupMode: GroupMode` in `Topology.tsx`

**Tree mode + groupMode:**
- `hierarchy`: Current behavior (provider→vpc→subnet→instance)
- `semantic`: Group by `category` (network, compute, database, storage, security, ai)
- `team`: Group by `node.data.team` field
- `cost`: Group by cost brackets (free/low/mid/high), node size scales

**Tree regrouping for non-hierarchy modes:**
- `useTopologyTree` accepts `groupMode` parameter
- For `semantic`: Build tree as `category → nodes of that category`
- For `team`: Build tree as `team → nodes of that team`
- For `cost`: Build tree as `costBracket → nodes in that bracket`

**Graph mode + groupMode:**
- Wire `useTopologyCluster` into `TopologyCanvas`
- Register `ClusterNode` in `nodeTypes`
- When groupMode changes, recompute clusters

**ClusterNode registration:**
- Add `cluster: ClusterNode` to `nodeTypes` in both canvases

**Files:**
- `Topology.tsx` — Add `groupMode` state
- `TopologyCanvas.tsx` — Wire `useTopologyCluster`, register `ClusterNode`
- `DrilldownView.tsx` — Register `ClusterNode`
- `useTopologyTree.ts` — Accept `groupMode`, implement semantic/team/cost grouping
- `ResourceNode.tsx` — Accept optional `costScale` prop

## L3: Search + Keyboard Navigation

### Problem
No way to find nodes. No keyboard accessibility.

### Design

**Search bar:**
- Input in header between mode toggle and ViewSwitcher
- Debounced (300ms), searches by node label
- Non-matching nodes: `opacity: 0.2`
- Matching nodes: `ring-2 ring-blue-400 animate-pulse`
- Clear button (X) resets

**Search scope:**
- Searches visible nodes at current drill level
- If match found in deeper level, auto-drill to it

**Keyboard navigation:**
- Canvas gets `tabIndex={0}` and `onKeyDown` handler
- Arrow keys: Move focus between nodes (left/right within row, up/down between rows)
- Enter: Drill into focused node (or open modal for instances)
- Escape: Go back one breadcrumb level
- `?`: Toggle keyboard shortcut overlay

**Focus management:**
- Track `focusedNodeId` state
- Focused node: `ring-2 ring-blue-500` visual indicator
- Scroll focused node into view if needed

**ARIA:**
- Canvas: `role="tree"`, `aria-label="Topology hierarchy"`
- Nodes: `role="treeitem"`, `aria-level={depth}`, `aria-label="{label}, {childCount} children"`
- Groups: `role="group"`

**Files:**
- `Topology.tsx` — Search state, keyboard event routing
- `DrilldownView.tsx` — Search filtering, focus management, keyboard handlers
- `ResourceNode.tsx` — `tabIndex`, `role`, focus ring
- New: `KeyboardShortcutOverlay.tsx`

## L4: Metrics/Logs Tabs

### Problem
MetricsTab and LogsTab are placeholders.

### Design

**Dependencies:**
- Install `recharts` (lightweight React charting library)

**MetricsTab — 2×2 sparkline grid:**
- CPU Usage (% over 24h) — area chart, blue gradient
- Memory Usage (MB over 24h) — area chart, purple gradient
- Network In/Out (KB/s over 24h) — line chart, green/red
- Disk I/O (MB/s over 24h) — area chart, orange gradient
- Each chart: 100% width, 80px height
- Data from existing `getDemoMetrics()` (generate 24 data points per metric)

**LogsTab — scrollable log list:**
- Each entry: `[HH:MM:SS] [LEVEL] message`
- Level dots: info=blue, warn=amber, error=red
- Filter buttons: All / Info / Warn / Error
- Max 50 entries displayed
- Data from new `getDemoLogs()` function

**Loading states:**
- Skeleton placeholders (pulse animation) for 500ms simulated delay

**Empty states:**
- "No metrics data available" with chart icon
- "No logs found" with list icon

**Files:**
- New dependency: `recharts`
- `NodeDetailTabs/MetricsTab.tsx` — Rewrite with recharts
- `NodeDetailTabs/LogsTab.tsx` — Rewrite with log list
- `lib/demo/mock-data.ts` — Add `getDemoLogs()`, enhance `getDemoMetrics()`

## L5: Cost View

### Problem
Cost data exists but isn't visualized.

### Design

**Cost groupMode:**
- When `groupMode === 'cost'`, tree regroups by cost brackets:
  - Free ($0) — gray nodes
  - Low ($1-100) — green nodes
  - Mid ($101-300) — amber nodes
  - High ($300+) — red nodes

**Node sizing in cost mode:**
- Base: 160×100px
- Max: 240×150px
- Formula: `scale = 1 + Math.min(monthlyCost / 500, 1.5)`
- Applied via inline style on ResourceNode wrapper

**Cost label:**
- In cost mode, show `$XXX/mo` below status indicator
- Color matches bracket (green/amber/red)
- Font: `text-[9px] font-mono`

**Summary header:**
- In cost mode, breadcrumb bar shows: "Total: $X,XXX/mo"
- Color coded by total (green if <$500, amber if <$2000, red if >$2000)

**Graph mode cost:**
- In cost mode, `useTopologyCluster` groups by cost brackets
- ClusterNode shows total cost for cluster

**Files:**
- `useTopologyTree.ts` — Cost bracket grouping
- `DrilldownView.tsx` — Cost scale calculation, summary header
- `ResourceNode.tsx` — `costScale` prop, cost label rendering
- `TopologyCanvas.tsx` — Wire cost mode to `useTopologyCluster`

## L6: URL State Persistence

### Problem
State lost on navigation. No shareable links.

### Design

**URL query params:**
- `?mode=tree|graph`
- `?view=network|storage`
- `?group=hierarchy|semantic|team|cost`
- `?provider=aws&region=us-east-1&type=instance&status=running`
- `?path=provider-aws-account,demo-vpc-0,demo-subnet-0` (comma-separated drill path)
- `?search=keyword`

**Initialization:**
- On mount, read `useSearchParams` and initialize all state
- If no params, use defaults (tree, hierarchy, no filters)

**Sync on change:**
- Use `replaceState` (not pushState) for rapid changes (search typing)
- Use `pushState` for drill navigation (back button support)

**Browser navigation:**
- `popstate` restores state from URL
- Back button = go up one drill level

**Share button:**
- Copy link button in header
- Copies current URL with all state encoded
- Toast: "Link copied to clipboard"

**Files:**
- `Topology.tsx` — Replace useState with URL-backed state
- New: `useSyncedState.ts` — Generic hook for URL-backed state

## L7: Expanded Mock Data

### Problem
Only ~60-90 nodes. Doesn't test scalability.

### Design

**Scale:**
- 5 providers (AWS, Aliyun, Azure, Huawei, Tencent)
- 2-4 VPCs per provider (10-20 total)
- 2-3 subnets per VPC (20-60 total)
- 5-10 instances per subnet (100-200 total)
- 2 SGs per VPC, 1-2 LBs per provider, 1-2 DBs per provider
- 2-3 buckets, 1-2 caches, 1-2 CDNs per provider
- 1-2 containers, 1 AI service per provider
- **Total: 250-350 nodes**

**New resource types:**
- CDN: `category: 'network'`, `icon: 'globe'`
- Container/ECS: `category: 'compute'`, `icon: 'boxes'`
- AI Service: `category: 'ai'`, `icon: 'cpu'`

**Team field:**
- Add `data.team` to all nodes
- Teams: `platform`, `data`, `frontend`, `backend`, `devops`
- Randomly assigned, consistent per provider/region

**Cost distribution:**
- Instances: $20-800/mo
- Databases: $200-2000/mo
- LBs: $50-300/mo
- Cache: $100-500/mo
- CDN: $50-200/mo
- Containers: $30-500/mo
- AI Services: $100-1000/mo

**Edge diversity:**
- `routes-to` on LBs (3-5 targets each)
- `protected-by` on instances (1-2 SGs each)
- `attached-to` on databases (to VPC)

**Files:**
- `lib/demo/mock-data.ts` — Rewrite `getDemoTopology()`

## New Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `recharts` | ^2.15 | Sparkline charts in MetricsTab |

## File Change Summary

| File | Layers | Change Type |
|------|--------|-------------|
| `Topology.tsx` | L2,L3,L5,L6 | Enhance (add states, URL sync) |
| `DrilldownView.tsx` | L1,L2,L3,L5 | Enhance (edges, clustering, search, cost) |
| `TopologyCanvas.tsx` | L2,L5 | Enhance (cluster wiring, cost mode) |
| `ResourceNode.tsx` | L2,L3,L5 | Enhance (focus, cost scale, cost label) |
| `useTopologyTree.ts` | L2,L5 | Enhance (group modes, cost brackets) |
| `MetricsTab.tsx` | L4 | Rewrite |
| `LogsTab.tsx` | L4 | Rewrite |
| `mock-data.ts` | L7 | Rewrite |
| `KeyboardShortcutOverlay.tsx` | L3 | New |
| `useSyncedState.ts` | L6 | New |

## Non-Goals

- Real-time WebSocket updates (future enhancement)
- Dark mode support (future enhancement)
- Mobile gesture navigation (future enhancement)
- Actual API integration (mock data only)
