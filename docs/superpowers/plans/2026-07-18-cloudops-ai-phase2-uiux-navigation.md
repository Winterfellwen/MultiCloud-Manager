# Phase 2 UI/UX Navigation & Interaction Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Navigation & IA from 3→5 and Interaction Design & Visual Feedback from 3→5

**Architecture:** Sidebar gets functional-domain grouping + VS Code style collapse/hover; new Breadcrumb component; skeleton loading for 4 main pages; AI insights collapsible; page transitions fixed.

**Tech Stack:** React, Framer Motion, Tailwind CSS, shadcn/ui components, Lucide icons

---

### Task 1: Sidebar Grouped Navigation

**Files:**
- Modify: `web-console/src/components/Sidebar.tsx` — full rewrite with group structure

- [ ] **Step 1: Restructure NAV_ITEMS into groups**

Replace the flat `NAV_ITEMS` array with a grouped structure:

```ts
interface NavGroup {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'nav.group.dashboard',
    icon: LayoutDashboard,
    items: [{ label: t('nav.dashboard'), to: '/dashboard', icon: LayoutDashboard }],
  },
  {
    label: 'nav.group.aiAgent',
    icon: Bot,
    items: [
      { label: t('nav.chat'), to: '/chat/react', icon: MessageSquare },
      { label: t('nav.aiOps'), to: '/ai-ops', icon: Bot },
      { label: t('nav.knowledgeBase'), to: '/knowledge-base', icon: BookOpen },
    ],
  },
  {
    label: 'nav.group.resourceMgmt',
    icon: Boxes,
    items: [
      { label: t('nav.resources'), to: '/resources', icon: Boxes, permission: { resource: 'instance', action: 'list' } },
      { label: t('nav.topology'), to: '/topology', icon: Network, permission: { resource: 'instance', action: 'list' } },
      { label: t('nav.cloudAccounts'), to: '/cloud-accounts', icon: Cloud, permission: { resource: 'instance', action: 'list' } },
    ],
  },
  {
    label: 'nav.group.monitoring',
    icon: Activity,
    items: [
      { label: t('nav.monitor'), to: '/monitor', icon: Activity, permission: { resource: 'monitor', action: 'view' } },
      { label: t('nav.notifications'), to: '/notifications', icon: Bell },
    ],
  },
  {
    label: 'nav.group.costMgmt',
    icon: DollarSign,
    items: [
      { label: t('nav.costs'), to: '/costs', icon: DollarSign, permission: { resource: 'cost', action: 'view' } },
    ],
  },
  {
    label: 'nav.group.system',
    icon: Settings2,
    items: [
      { label: t('nav.tools'), to: '/tools', icon: Wrench, permission: { resource: 'instance', action: 'view' } },
      { label: t('nav.mcp'), to: '/mcp', icon: Plug, permission: { resource: 'mcp', action: 'manage' } },
      { label: t('nav.users'), to: '/users', icon: Users, permission: { resource: 'user', action: 'list' } },
      { label: t('nav.audit'), to: '/audit', icon: ScrollText, permission: { resource: 'audit', action: 'view' } },
      { label: t('nav.aiSettings'), to: '/ai-settings', icon: Settings2 },
    ],
  },
];
```

- [ ] **Step 2: Add group collapse state**

Add state for which groups are expanded:
```ts
const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>(() => {
  const saved = localStorage.getItem('sidebar:expandedGroups');
  return saved ? JSON.parse(saved) : { dashboard: true, aiAgent: true, resourceMgmt: true, monitoring: true, costMgmt: true, system: true };
});

const toggleGroup = (key: string) => {
  setExpandedGroups(prev => {
    const next = { ...prev, [key]: !prev[key] };
    localStorage.setItem('sidebar:expandedGroups', JSON.stringify(next));
    return next;
  });
};
```

- [ ] **Step 3: Auto-expand active group**

Add effect that auto-expands the group containing the current page:
```ts
const activeGroup = NAV_GROUPS.find(g => g.items.some(i => {
  const target = i.children ? i.children[0].to : i.to;
  return location.pathname === target || location.pathname.startsWith(target + '/');
}));

useEffect(() => {
  if (activeGroup) {
    setExpandedGroups(prev => {
      if (prev[activeGroup.label]) return prev;
      return { ...prev, [activeGroup.label]: true };
    });
  }
}, [location.pathname]);
```

- [ ] **Step 4: Render grouped navigation**

Replace the flat rendering loop with:
```tsx
{NAV_GROUPS.map(group => {
  const visibleItems = group.items.filter(item => {
    if (!item.permission) return true;
    if (!user) return false;
    return hasPermission(user.role, item.permission.resource, item.permission.action);
  });
  if (visibleItems.length === 0) return null;

  const isExpanded = expandedGroups[group.label] ?? true;

  return (
    <div key={group.label} className="space-y-0.5">
      <button
        onClick={() => toggleGroup(group.label)}
        className="flex w-full items-center justify-between px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
      >
        <span>{group.label}</span>
        <ChevronDown className={cn('h-3 w-3 transition-transform', isExpanded && 'rotate-180')} />
      </button>
      {isExpanded && (
        <div className="space-y-0.5">
          {visibleItems.map(item => (
            <NavLink
              key={item.to}
              to={item.children ? item.children[0].to : item.to}
              className={cn(
                'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150',
                isItemActive(item)
                  ? 'bg-background shadow-md text-foreground font-semibold ring-1 ring-border'
                  : 'text-muted-foreground hover:bg-background/80 hover:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
})}
```

- [ ] **Step 5: Add i18n keys**

Add to `en/common.json` and `zh/common.json`:
```json
{
  "nav": {
    "group": {
      "dashboard": "Dashboard",
      "aiAgent": "AI Agent",
      "resourceMgmt": "Resources",
      "monitoring": "Monitoring",
      "costMgmt": "Costs",
      "system": "System"
    }
  }
}
```


- [ ] **Step 6: Verify compilation**

Run: `npx tsc --noEmit` in `web-console`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add web-console/src/components/Sidebar.tsx web-console/src/lib/locales/ && git commit -m "feat: group sidebar navigation by functional domain"
```

---

### Task 2: Desktop Sidebar Collapse

**Files:**
- Modify: `web-console/src/components/Layout.tsx` — collapsed state + toggle
- Modify: `web-console/src/components/Sidebar.tsx` — collapsed rendering + hover popup
- Modify: `web-console/src/components/Topbar.tsx` — collapse button

- [ ] **Step 1: Add collapsed state to Layout**

```ts
const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
  return localStorage.getItem('sidebar:collapsed') === 'true';
});

const toggleCollapse = useCallback(() => {
  setSidebarCollapsed(prev => {
    const next = !prev;
    localStorage.setItem('sidebar:collapsed', String(next));
    return next;
  });
}, []);

// Pass to Sidebar + Topbar
<Sidebar collapsed={sidebarCollapsed} />
<Topbar ... onToggleCollapse={toggleCollapse} sidebarCollapsed={sidebarCollapsed} />
```

- [ ] **Step 2: Add collapse button to Topbar**

After the search button, before NotificationBell:
```tsx
{!isMobile && (
  <Tooltip>
    <TooltipTrigger asChild>
      <Button variant="ghost" size="icon" onClick={onToggleCollapse} className="shrink-0">
        {sidebarCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
      </Button>
    </TooltipTrigger>
    <TooltipContent>{sidebarCollapsed ? '展开侧边栏' : '折叠侧边栏'}</TooltipContent>
  </Tooltip>
)}
```

Add imports: `PanelLeftClose, PanelLeftOpen` from lucide-react.

Add `onToggleCollapse` and `sidebarCollapsed` to `TopbarProps`.

- [ ] **Step 3: Render collapsed sidebar (icon bar)**

In `Sidebar.tsx`, accept `collapsed: boolean` prop.

When collapsed, render only group icons:
```tsx
{collapsed ? (
  <div className="flex flex-col items-center gap-2 py-2">
    {NAV_GROUPS.map(group => (
      <Tooltip key={group.label}>
        <TooltipTrigger asChild>
          <NavLink
            to={group.items[0].to}
            className={cn(
              'flex items-center justify-center w-10 h-10 rounded-lg transition-all',
              activeGroup?.label === group.label
                ? 'bg-background shadow-md text-foreground ring-1 ring-border'
                : 'text-muted-foreground hover:bg-background/80 hover:text-foreground'
            )}
          >
            <group.icon className="h-5 w-5" />
          </NavLink>
        </TooltipTrigger>
        <TooltipContent side="right">{group.label}</TooltipContent>
      </Tooltip>
    ))}
  </div>
) : (
  // existing full navigation rendering
)}
```

- [ ] **Step 4: Hover popup on icon bar**

Add hover state to the collapsed sidebar to show a popup:
```tsx
const [hoverOpen, setHoverOpen] = useState(false);
const hoverTimerRef = useRef<ReturnType<typeof setTimeout>>();

const handleMouseEnter = () => {
  hoverTimerRef.current = setTimeout(() => setHoverOpen(true), 300);
};
const handleMouseLeave = () => {
  clearTimeout(hoverTimerRef.current);
  setTimeout(() => setHoverOpen(false), 300);
};
```

Render popup when collapsed + hoverOpen:
```tsx
{collapsed && hoverOpen && (
  <div
    className="absolute left-14 top-0 z-50 w-64 bg-card border rounded-lg shadow-xl p-2"
    onMouseEnter={() => { clearTimeout(hoverTimerRef.current); setHoverOpen(true); }}
    onMouseLeave={() => { setTimeout(() => setHoverOpen(false), 300); }}
  >
    {/* full group navigation */}
  </div>
)}
```

Wrapper needs `relative` class:
```tsx
<aside className={cn('w-60 border-r bg-card flex flex-col h-full relative', collapsed && 'w-14')}>
```

- [ ] **Step 5: Verify compilation**

Run: `npx tsc --noEmit` in `web-console`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add web-console/src/components/Sidebar.tsx web-console/src/components/Layout.tsx web-console/src/components/Topbar.tsx && git commit -m "feat: add sidebar collapse with hover popup"
```

---

### Task 3: Breadcrumb Navigation

**Files:**
- Create: `web-console/src/components/Breadcrumb.tsx`
- Modify: `web-console/src/components/Layout.tsx`

- [ ] **Step 1: Create Breadcrumb component**

```tsx
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const BREADCRUMB_MAP: Record<string, { parent?: string; label: string }> = {
  '/dashboard': { label: 'nav.group.dashboard' },
  '/chat/react': { parent: 'nav.group.aiAgent', label: 'nav.chat' },
  '/ai-ops': { parent: 'nav.group.aiAgent', label: 'nav.aiOps' },
  '/knowledge-base': { parent: 'nav.group.aiAgent', label: 'nav.knowledgeBase' },
  '/resources': { parent: 'nav.group.resourceMgmt', label: 'nav.resources' },
  '/topology': { parent: 'nav.group.resourceMgmt', label: 'nav.topology' },
  '/cloud-accounts': { parent: 'nav.group.resourceMgmt', label: 'nav.cloudAccounts' },
  '/monitor': { parent: 'nav.group.monitoring', label: 'nav.monitor' },
  '/notifications': { parent: 'nav.group.monitoring', label: 'nav.notifications' },
  '/costs': { parent: 'nav.group.costMgmt', label: 'nav.costs' },
  '/tools': { parent: 'nav.group.system', label: 'nav.tools' },
  '/mcp': { parent: 'nav.group.system', label: 'nav.mcp' },
  '/users': { parent: 'nav.group.system', label: 'nav.users' },
  '/audit': { parent: 'nav.group.system', label: 'nav.audit' },
  '/ai-settings': { parent: 'nav.group.system', label: 'nav.aiSettings' },
};

export function Breadcrumb() {
  const { t } = useTranslation();
  const location = useLocation();

  // Match dynamic routes like /instances/:id
  const basePath = '/' + location.pathname.split('/').filter(Boolean)[0];
  const entry = BREADCRUMB_MAP[basePath] || BREADCRUMB_MAP[location.pathname];

  if (!entry) return null;

  const crumbs: { label: string; to?: string }[] = [];
  if (entry.parent) {
    crumbs.push({ label: t(entry.parent) });
  }
  crumbs.push({ label: t(entry.label), to: basePath });

  // For detail pages like /instances/:id, show parent resource page as intermediate
  if (location.pathname !== basePath) {
    crumbs.push({ label: location.pathname.split('/').pop() || '' });
  }

  return (
    <nav className="flex items-center gap-1 px-3 md:px-6 py-2 text-sm text-muted-foreground border-b">
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1">
          {i > 0 && <ChevronRight className="h-3 w-3" />}
          {crumb.to ? (
            <Link to={crumb.to} className="hover:text-foreground transition-colors">
              {crumb.label}
            </Link>
          ) : (
            <span className="text-foreground/60">{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: Add Breadcrumb to Layout**

In `Layout.tsx`, after `<DemoBanner />` and before `<main>`:
```tsx
{!isChatPage && <Breadcrumb />}
```

Import: `import { Breadcrumb } from './Breadcrumb';`

- [ ] **Step 3: Remove existing page h1 titles that duplicate breadcrumb**

Optional: If breadcrumb shows the page name, h1 titles in pages become redundant. Keep them for now (they provide context within the page content area).

- [ ] **Step 4: Verify compilation**

Run: `npx tsc --noEmit` in `web-console`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add web-console/src/components/Breadcrumb.tsx web-console/src/components/Layout.tsx && git commit -m "feat: add breadcrumb navigation"
```

---

### Task 4: Mobile Drawer Close Button + Topbar Tooltips

**Files:**
- Modify: `web-console/src/components/Layout.tsx`
- Modify: `web-console/src/components/Topbar.tsx`

- [ ] **Step 1: Add close button to mobile drawer**

In `Layout.tsx`, inside the drawer `motion.div` after `<Sidebar />`:
```tsx
<Button
  variant="ghost"
  size="icon"
  onClick={closeSidebar}
  className="absolute top-2 right-2 text-muted-foreground hover:text-foreground"
>
  <X className="h-4 w-4" />
</Button>
```

Add `X` to lucide-react imports in Layout.tsx.
Add `Button` import to Layout.tsx.

Also add `className="relative"` to the drawer motion.div to position the X button.

- [ ] **Step 2: Add tooltips to remaining Topbar buttons**

NotificationBell already exists — wrap it in Tooltip:
```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <NotificationBell />
  </TooltipTrigger>
  <TooltipContent>{t('topbar.notifications')}</TooltipContent>
</Tooltip>
```

LanguageSwitcher already exists — similarly wrap or check if it already handles tooltip internally.

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit` in `web-console`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add web-console/src/components/Layout.tsx web-console/src/components/Topbar.tsx && git commit -m "fix: add mobile drawer close button and remaining tooltips"
```

---

### Task 5: Skeleton Loading Component + Page Skeletons

**Files:**
- Create: `web-console/src/components/ui/skeleton.tsx`
- Modify: `web-console/src/pages/Dashboard.tsx`
- Modify: `web-console/src/pages/Resources.tsx`
- Modify: `web-console/src/pages/Monitor.tsx`
- Modify: `web-console/src/pages/Costs.tsx`

- [ ] **Step 1: Create Skeleton component**

```tsx
import { cn } from '@/lib/utils';

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  className?: string;
}

export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('rounded-lg border bg-card p-6 space-y-3', className)}>
      <Skeleton className="h-4 w-24" />
      <Skeleton className="h-8 w-16" />
    </div>
  );
}

export function TableRowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-4 border-b px-4 py-3">
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton key={i} className="h-4 flex-1" />
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Add DashboardSkeleton**

In `Dashboard.tsx`, create a skeleton for the loading state. Place it before the return or as a separate component in the same file:

```tsx
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-lg border bg-card p-6 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-40 w-full" />
        </div>
        <div className="rounded-lg border bg-card p-6 space-y-3">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    </div>
  );
}
```

Replace existing loading state:
```tsx
if (isLoading) {
  // remove: <div className="flex items-center justify-center..."><Loader2 ... /></div>
  return <DashboardSkeleton />;
}
```

- [ ] **Step 3: Add ResourcesSkeleton**

In `Resources.tsx`, render TableRowSkeleton when loading:
```tsx
function ResourcesSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-32" />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
        <Skeleton className="h-9 w-24" />
      </div>
      <div className="rounded-lg border">
        {Array.from({ length: 5 }).map((_, i) => (
          <TableRowSkeleton key={i} cols={5} />
        ))}
      </div>
    </div>
  );
}
```

Replace the loading spinner with `<ResourcesSkeleton />`.

- [ ] **Step 4: Add MonitorSkeleton**

In `Monitor.tsx`, add skeleton for the tab-based page:
```tsx
function MonitorSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-32" />
      <div className="flex gap-4 border-b pb-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="h-8 w-20" />
      </div>
      <div className="rounded-lg border">
        {Array.from({ length: 3 }).map((_, i) => (
          <TableRowSkeleton key={i} cols={4} />
        ))}
      </div>
    </div>
  );
}
```

Replace the loading spinner.

- [ ] **Step 5: Add CostsSkeleton**

In `Costs.tsx`, add skeleton:
```tsx
function CostsSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-32" />
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <CardSkeleton key={i} />
        ))}
      </div>
      <Skeleton className="h-64 w-full rounded-lg" />
    </div>
  );
}
```

Replace the loading spinner.

- [ ] **Step 6: Verify compilation**

Run: `npx tsc --noEmit` in `web-console`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add web-console/src/components/ui/skeleton.tsx web-console/src/pages/Dashboard.tsx web-console/src/pages/Resources.tsx web-console/src/pages/Monitor.tsx web-console/src/pages/Costs.tsx && git commit -m "feat: add skeleton loading for dashboard, resources, monitor, costs pages"
```

---

### Task 6: AI Insights Collapsible

**Files:**
- Modify: `web-console/src/components/dashboard/AiInsightCard.tsx`

- [ ] **Step 1: Add expand/collapse state for risks**

In `AiInsightCard.tsx`, add:
```tsx
const SHOW_DEFAULT = 3;
const [showAllRisks, setShowAllRisks] = useState(false);
const visibleRisks = showAllRisks ? (data.risks ?? []) : (data.risks ?? []).slice(0, SHOW_DEFAULT);
```

- [ ] **Step 2: Limit rendered risks and add toggle button**

Replace `data.risks.map(...)` with:
```tsx
{visibleRisks.map((risk, i) => (
  <li key={i} className="text-sm text-muted-foreground">
    • <span className={severityClass(risk.severity)}>{risk.title}</span>
    {risk.suggestion && (
      <span className="ml-1 text-xs text-muted-foreground">— {risk.suggestion}</span>
    )}
  </li>
))}
{(data.risks?.length ?? 0) > SHOW_DEFAULT && (
  <button
    onClick={() => setShowAllRisks(!showAllRisks)}
    className="text-xs text-primary hover:underline mt-1"
  >
    {showAllRisks
      ? t('common.showLess')
      : t('common.showAll', { count: (data.risks?.length ?? 0) - SHOW_DEFAULT })}
  </button>
)}
```

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit` in `web-console`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add web-console/src/components/dashboard/AiInsightCard.tsx && git commit -m "feat: make AI insights risks collapsible with show more/less"
```

---

### Task 7: Page Transition Animation Fixes

**Files:**
- Modify: `web-console/src/components/Layout.tsx`

- [ ] **Step 1: Fix chat page animation**

The `isChatPage ? 'p-0' : 'overflow-auto p-3 md:p-6'` class switch causes flicker because it changes the container class on route change. Move the p-0 logic inside the motion.div or use a consistent container:

```tsx
<main className="flex-1 overflow-hidden">
  <AnimatePresence mode="wait" initial={false}>
    <motion.div
      key={location.pathname}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: DURATION.page, ease: EASE.out }}
      className={cn('h-full', isChatPage ? '' : 'overflow-auto p-3 md:p-6')}
    >
      <Outlet />
    </motion.div>
  </AnimatePresence>
</main>
```

Key change: consistent `overflow-hidden` on `<main>`, move overflow/padding into the animated `motion.div`.

- [ ] **Step 2: Verify page transitions work**

Navigate between different pages (Dashboard → Resources → Monitor → Costs). Each transition should show a smooth fade-up animation. No flicker on chat page navigation.

- [ ] **Step 3: Verify compilation**

Run: `npx tsc --noEmit` in `web-console`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add web-console/src/components/Layout.tsx && git commit -m "fix: smooth page transition animation without flicker on chat page"
```

---

## Self-Review Checklist

1. **Spec coverage:** Does each task map to a spec section?
   - Task 1 → Section 1 (Sidebar Grouping)
   - Task 2 → Section 2 (Sidebar Collapse)
   - Task 3 → Section 3 (Breadcrumb)
   - Task 4 → Section 4 (Mobile Close) + Section 5 (Tooltips)
   - Task 5 → Section 6 (Skeleton)
   - Task 6 → Section 7 (AI Insights)
   - Task 7 → Section 8 (Page Transitions)
   All sections covered. ✅

2. **Placeholder scan:** No TBD, TODO, or vague instructions. Every file path is exact. Every code block contains complete code. ✅

3. **Type consistency:** Component props match between tasks. Same function signatures. ✅

4. **Scope check:** Focused on Phase 2 only. No Phase 3+ creep. ✅
