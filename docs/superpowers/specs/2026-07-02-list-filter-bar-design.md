# List Filter Bar Design

**Date**: 2026-07-02
**Status**: Approved
**Scope**: Add reusable FilterBar component + add filters to 4 unfiltered pages + migrate 4 existing pages

## Problem

7 list pages exist in the web console. 4 have no filtering at all (Users, Monitor, McpConfig, CloudAccounts). The other 4 (Instances, Resources, Audit, KnowledgeBase) have inline filtering with duplicated boilerplate code. No reusable filter component exists.

## Goal

1. Create a reusable `FilterBar` component with declarative config API
2. Add filters to the 4 unfiltered list pages
3. Migrate 4 existing pages to use the new FilterBar (reducing code duplication)

## Design Decisions

- **Approach**: Config-driven declarative FilterBar (chosen over layout container and hook+declarative alternatives)
- **Filter style**: Inline above table, matching existing Instances/Resources pattern
- **Scope**: All 8 pages affected, no changes to pages that already have complete filtering (ToolsCatalog, Topology, Costs)
- **Date filters**: Audit's date range kept inline (FilterBar v1 supports search + select only)

## Component: FilterBar

**File**: `web-console/src/components/ui/filter-bar.tsx`

### Types

```ts
type FilterType = 'search' | 'select';

interface FilterConfig {
  key: string;
  type: FilterType;
  label?: string;
  placeholder?: string;
  options?: { label: string; value: string }[];
}

interface FilterBarProps {
  filters: FilterConfig[];
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  className?: string;
}
```

### Rendering Rules

- `search` type renders `<Input>` with Search icon, 300ms debounce, `flex-1` width
- `select` type renders `<Select>` with first option "All" (value=`""`), `w-[160px]` width
- Layout: horizontal flex row with `gap-3`, wraps on small screens
- Uses existing `Input` and `Select` from `components/ui/`

### Behavior

- Search input debounces 300ms before calling `onChange`
- Select calls `onChange` immediately on value change
- All filter values are strings; empty string means "no filter"
- Component is controlled (values + onChange pattern)

## Page Filter Configurations

### New Filters (4 pages)

**Users.tsx**
- `search`: search by username/email
- `select` role: admin / ops / viewer
- `select` team: dynamic from teams list

**Monitor.tsx** — 3 tabs, each with independent FilterBar:
- Rules tab: `search` (rule name) + `severity` (info/warning/critical/emergency)
- Events tab: `search` (message) + `status` (firing/resolved/silenced)
- Channels tab: `search` (channel name) + `type` (webhook/email/slack)

**McpConfig.tsx**
- `search`: server name
- `select` status: enabled / disabled

**CloudAccounts.tsx** (card list)
- `search`: account name
- `select` provider: AWS / Aliyun / Azure
- `select` status: active / inactive

### Migrated Pages (4 pages)

**Instances.tsx** — Replace inline search + provider + status selects with FilterBar
**Resources.tsx** — Two views (resources + instances), each gets its own FilterBar
**Audit.tsx** — Replace action + provider selects with FilterBar search/select; date range stays inline
**KnowledgeBase.tsx** — Replace inline search input with FilterBar search-only config

## Files Changed

### New Files
- `web-console/src/components/ui/filter-bar.tsx`

### Modified Files
- `web-console/src/pages/Users.tsx`
- `web-console/src/pages/Monitor.tsx`
- `web-console/src/pages/McpConfig.tsx`
- `web-console/src/pages/CloudAccounts.tsx`
- `web-console/src/pages/Instances.tsx`
- `web-console/src/pages/Resources.tsx`
- `web-console/src/pages/Audit.tsx`
- `web-console/src/pages/KnowledgeBase.tsx`
- `web-console/src/i18n/locales/zh.json`
- `web-console/src/i18n/locales/en.json`

### Unchanged
- ToolsCatalog.tsx (already has search + risk filter)
- Topology.tsx (already has TopologyFilter sidebar)
- Costs.tsx (only date range, no table filters needed)
- Dashboard.tsx, Login.tsx, NotFound.tsx, InstanceDetail.tsx, ChatReact.tsx, AiSettings.tsx (no lists)

## i18n

New keys added to both `zh.json` and `en.json`:
- `filter.all` — "全部" / "All"
- `filter.search` — "搜索..." / "Search..."
- `filter.searchPlaceholder` variations per page (e.g., "搜索用户名/邮箱..." / "Search username/email...")

Existing filter-related keys (e.g., `instances.provider`, `instances.status`) are reused.

## Out of Scope

- Date range filter type (Audit dates stay inline)
- Server-side filtering (all filtering is client-side with `useMemo`)
- Column sorting (separate concern, not in this spec)
- Pagination (already exists in Audit, not needed for other small lists)
