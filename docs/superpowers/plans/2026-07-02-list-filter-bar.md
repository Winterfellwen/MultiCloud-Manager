# List Filter Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a reusable FilterBar component and add filter functionality to 4 unfiltered list pages + migrate 4 existing pages.

**Architecture:** Config-driven FilterBar component renders search inputs and select dropdowns from a declarative config array. Each page provides filter config + state via useState, filters data client-side with useMemo.

**Tech Stack:** React, TypeScript, shadcn/ui style components (Input, Select), react-i18next

---

### Task 1: Create FilterBar component

**Files:**
- Create: `web-console/src/components/ui/filter-bar.tsx`

- [ ] **Step 1: Create FilterBar component**

```tsx
// web-console/src/components/ui/filter-bar.tsx
import { useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';

export type FilterType = 'search' | 'select';

export interface FilterConfig {
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

function DebouncedSearchInput({
  placeholder,
  value,
  onChange,
}: {
  placeholder?: string;
  value: string;
  onChange: (val: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const handleChange = (val: string) => {
    setLocal(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => onChange(val), 300);
  };

  return (
    <div className="relative flex-1 min-w-[200px]">
      <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        value={local}
        onChange={(e) => handleChange(e.target.value)}
        className="pl-8"
      />
    </div>
  );
}

export function FilterBar({ filters, values, onChange, className }: FilterBarProps) {
  const update = (key: string, val: string) => {
    onChange({ ...values, [key]: val });
  };

  return (
    <div className={`flex flex-col gap-3 sm:flex-row sm:flex-wrap ${className || ''}`}>
      {filters.map((f) => {
        if (f.type === 'search') {
          return (
            <DebouncedSearchInput
              key={f.key}
              placeholder={f.placeholder}
              value={values[f.key] || ''}
              onChange={(val) => update(f.key, val)}
            />
          );
        }
        if (f.type === 'select') {
          return (
            <Select
              key={f.key}
              value={values[f.key] || ''}
              onChange={(e) => update(f.key, e.target.value)}
              className="w-full sm:w-[160px]"
            >
              {f.options?.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </Select>
          );
        }
        return null;
      })}
    </div>
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd web-console && node_modules/.bin/tsc --noEmit 2>&1 | head -20`
Expected: No errors related to filter-bar.tsx

- [ ] **Step 3: Commit**

```bash
git add web-console/src/components/ui/filter-bar.tsx
git commit -m "feat: add reusable FilterBar component"
```

---

### Task 2: Add i18n keys for filters

**Files:**
- Modify: `web-console/src/i18n/locales/zh.json`
- Modify: `web-console/src/i18n/locales/en.json`

- [ ] **Step 1: Add filter i18n keys to zh.json**

Add inside the `"common"` section (after the existing `"all"` key):

```json
"filterAll": "全部",
"filterSearch": "搜索...",
"filterSearchUsername": "搜索用户名/邮箱...",
"filterSearchName": "搜索名称...",
"filterSearchMessage": "搜索消息内容...",
"filterSearchServer": "搜索服务器名称...",
"filterSearchAccount": "搜索账号名称...",
"filterRole": "角色",
"filterTeam": "团队",
"filterSeverity": "严重级别",
"filterAlertStatus": "告警状态",
"filterChannelType": "渠道类型",
"filterProvider": "云厂商",
"filterStatus": "状态",
"filterEnabled": "启用状态",
"filterEnabledOnly": "仅启用",
"filterDisabledOnly": "仅禁用"
```

- [ ] **Step 2: Add filter i18n keys to en.json**

Add inside the `"common"` section:

```json
"filterAll": "All",
"filterSearch": "Search...",
"filterSearchUsername": "Search username/email...",
"filterSearchName": "Search name...",
"filterSearchMessage": "Search message...",
"filterSearchServer": "Search server name...",
"filterSearchAccount": "Search account name...",
"filterRole": "Role",
"filterTeam": "Team",
"filterSeverity": "Severity",
"filterAlertStatus": "Alert Status",
"filterChannelType": "Channel Type",
"filterProvider": "Provider",
"filterStatus": "Status",
"filterEnabled": "Enabled",
"filterEnabledOnly": "Enabled only",
"filterDisabledOnly": "Disabled only"
```

- [ ] **Step 3: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('web-console/src/i18n/locales/zh.json','utf8')); console.log('zh OK')"` and same for en.json
Expected: "zh OK" and "en OK"

- [ ] **Step 4: Commit**

```bash
git add web-console/src/i18n/locales/zh.json web-console/src/i18n/locales/en.json
git commit -m "feat: add i18n keys for filter bar"
```

---

### Task 3: Add filters to Users page

**Files:**
- Modify: `web-console/src/pages/Users.tsx`

- [ ] **Step 1: Add FilterBar import and filter state**

At the top of `Users.tsx`, add import:

```tsx
import { FilterBar, type FilterConfig } from '@/components/ui/filter-bar';
```

Inside the `Users` component, after the existing `useState` declarations (around line 78), add:

```tsx
const [userFilters, setUserFilters] = useState<Record<string, string>>({});
const [teamFilters, setTeamFilters] = useState<Record<string, string>>({});
```

- [ ] **Step 2: Add filter config definitions**

After the filter state declarations, add:

```tsx
const userFilterConfigs: FilterConfig[] = [
  { key: 'search', type: 'search', placeholder: t('common.filterSearchUsername') },
  {
    key: 'role',
    type: 'select',
    label: t('common.filterRole'),
    options: [
      { label: t('common.filterAll'), value: '' },
      ...ROLE_OPTIONS.map((opt) => ({ label: t(`roles.${opt.value}`), value: opt.value })),
    ],
  },
  {
    key: 'team',
    type: 'select',
    label: t('common.filterTeam'),
    options: [
      { label: t('common.filterAll'), value: '' },
      ...(teams || []).map((team) => ({ label: team.name, value: team.id })),
    ],
  },
];

const teamFilterConfigs: FilterConfig[] = [
  { key: 'search', type: 'search', placeholder: t('common.filterSearchName') },
];
```

- [ ] **Step 3: Add filtered data derivation**

After the filter configs, add:

```tsx
const filteredUsers = useMemo(() => {
  return (users || []).filter((user) => {
    const s = (userFilters.search || '').toLowerCase();
    if (s && !user.username.toLowerCase().includes(s) && !(user.email || '').toLowerCase().includes(s)) return false;
    if (userFilters.role && user.role !== userFilters.role) return false;
    if (userFilters.team && user.teamId !== userFilters.team) return false;
    return true;
  });
}, [users, userFilters]);

const filteredTeams = useMemo(() => {
  return (teams || []).filter((team) => {
    const s = (teamFilters.search || '').toLowerCase();
    if (s && !team.name.toLowerCase().includes(s)) return false;
    return true;
  });
}, [teams, teamFilters]);
```

Add `useMemo` to the existing import from 'react' if not already present.

- [ ] **Step 4: Add FilterBar to Users tab**

Inside the `<TabsContent value="users">` block, before the error display (around line 194), add:

```tsx
<FilterBar
  filters={userFilterConfigs}
  values={userFilters}
  onChange={setUserFilters}
  className="mb-4"
/>
```

Replace `users?.map((user) => (` with `filteredUsers.map((user) => (` in the table body.

- [ ] **Step 5: Add FilterBar to Teams tab**

Inside the `<TabsContent value="teams">` block, before the table (around line 314), add:

```tsx
<FilterBar
  filters={teamFilterConfigs}
  values={teamFilters}
  onChange={setTeamFilters}
  className="mb-4"
/>
```

Replace `teams?.map((team) => (` with `filteredTeams.map((team) => (` in the teams table body.

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd web-console && node_modules/.bin/tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add web-console/src/pages/Users.tsx
git commit -m "feat: add filters to Users page"
```

---

### Task 4: Add filters to Monitor page

**Files:**
- Modify: `web-console/src/pages/Monitor.tsx`

- [ ] **Step 1: Add FilterBar import to Monitor.tsx**

Add at the top:

```tsx
import { FilterBar, type FilterConfig } from '@/components/ui/filter-bar';
```

- [ ] **Step 2: Add filters to RulesTab**

Inside `RulesTab`, after existing state declarations, add:

```tsx
const [ruleFilters, setRuleFilters] = useState<Record<string, string>>({});

const ruleFilterConfigs: FilterConfig[] = [
  { key: 'search', type: 'search', placeholder: t('common.filterSearchName') },
  {
    key: 'severity',
    type: 'select',
    label: t('common.filterSeverity'),
    options: [
      { label: t('common.filterAll'), value: '' },
      { label: t('monitor.alerts.info'), value: 'info' },
      { label: t('monitor.alerts.warning'), value: 'warning' },
      { label: t('monitor.alerts.critical'), value: 'critical' },
      { label: t('monitor.alerts.emergency'), value: 'emergency' },
    ],
  },
];

const filteredRules = useMemo(() => {
  return (rules || []).filter((rule) => {
    const s = (ruleFilters.search || '').toLowerCase();
    if (s && !rule.name.toLowerCase().includes(s) && !rule.metric.toLowerCase().includes(s)) return false;
    if (ruleFilters.severity && rule.severity !== ruleFilters.severity) return false;
    return true;
  });
}, [rules, ruleFilters]);
```

Add `useMemo` to the existing `useState` import.

Before the rules table (after the heading and create button), add:

```tsx
<FilterBar
  filters={ruleFilterConfigs}
  values={ruleFilters}
  onChange={setRuleFilters}
  className="mb-4"
/>
```

Replace `(rules || []).map((rule) => (` with `filteredRules.map((rule) => (`.

- [ ] **Step 3: Add filters to EventsTab**

Inside `EventsTab`, after existing state declarations, add:

```tsx
const [eventFilters, setEventFilters] = useState<Record<string, string>>({});

const eventFilterConfigs: FilterConfig[] = [
  { key: 'search', type: 'search', placeholder: t('common.filterSearchMessage') },
  {
    key: 'status',
    type: 'select',
    label: t('common.filterAlertStatus'),
    options: [
      { label: t('common.filterAll'), value: '' },
      { label: t('monitor.alerts.firing'), value: 'firing' },
      { label: t('monitor.alerts.resolved'), value: 'resolved' },
      { label: t('monitor.alerts.silenced'), value: 'silenced' },
    ],
  },
];

const filteredEvents = useMemo(() => {
  return (events || []).filter((evt) => {
    const s = (eventFilters.search || '').toLowerCase();
    if (s && !(evt.message || '').toLowerCase().includes(s)) return false;
    if (eventFilters.status && evt.status !== eventFilters.status) return false;
    return true;
  });
}, [events, eventFilters]);
```

Add `useMemo` to the existing import.

Before the events table, add:

```tsx
<FilterBar
  filters={eventFilterConfigs}
  values={eventFilters}
  onChange={setEventFilters}
  className="mb-4"
/>
```

Replace `(events || []).map((evt) => (` with `filteredEvents.map((evt) => (`.

- [ ] **Step 4: Add filters to ChannelsTab**

Inside `ChannelsTab`, after existing state declarations, add:

```tsx
const [channelFilters, setChannelFilters] = useState<Record<string, string>>({});

const channelFilterConfigs: FilterConfig[] = [
  { key: 'search', type: 'search', placeholder: t('common.filterSearchName') },
  {
    key: 'type',
    type: 'select',
    label: t('common.filterChannelType'),
    options: [
      { label: t('common.filterAll'), value: '' },
      { label: 'Webhook', value: 'webhook' },
      { label: t('users.email'), value: 'email' },
      { label: 'Slack', value: 'slack' },
    ],
  },
];

const filteredChannels = useMemo(() => {
  return (channels || []).filter((ch) => {
    const s = (channelFilters.search || '').toLowerCase();
    if (s && !ch.name.toLowerCase().includes(s)) return false;
    if (channelFilters.type && ch.type !== channelFilters.type) return false;
    return true;
  });
}, [channels, channelFilters]);
```

Add `useMemo` to the existing import.

Before the channels table, add:

```tsx
<FilterBar
  filters={channelFilterConfigs}
  values={channelFilters}
  onChange={setChannelFilters}
  className="mb-4"
/>
```

Replace `(channels || []).map((ch) => (` with `filteredChannels.map((ch) => (`.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `cd web-console && node_modules/.bin/tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add web-console/src/pages/Monitor.tsx
git commit -m "feat: add filters to Monitor page (rules, events, channels)"
```

---

### Task 5: Add filters to McpConfig page

**Files:**
- Modify: `web-console/src/pages/McpConfig.tsx`

- [ ] **Step 1: Add FilterBar import and filter logic**

Add at the top:

```tsx
import { useMemo } from 'react';
import { FilterBar, type FilterConfig } from '@/components/ui/filter-bar';
```

Replace `import { useState } from 'react';` with `import { useState, useMemo } from 'react';`

Inside `McpConfig`, after existing state declarations, add:

```tsx
const [filterValues, setFilterValues] = useState<Record<string, string>>({});

const filterConfigs: FilterConfig[] = [
  { key: 'search', type: 'search', placeholder: t('common.filterSearchServer') },
  {
    key: 'status',
    type: 'select',
    label: t('common.filterEnabled'),
    options: [
      { label: t('common.filterAll'), value: '' },
      { label: t('common.filterEnabledOnly'), value: 'enabled' },
      { label: t('common.filterDisabledOnly'), value: 'disabled' },
    ],
  },
];

const filteredServers = useMemo(() => {
  return servers.filter((srv) => {
    const s = (filterValues.search || '').toLowerCase();
    if (s && !srv.name.toLowerCase().includes(s)) return false;
    if (filterValues.status === 'enabled' && !srv.enabled) return false;
    if (filterValues.status === 'disabled' && srv.enabled) return false;
    return true;
  });
}, [servers, filterValues]);
```

- [ ] **Step 2: Add FilterBar to JSX**

Before the servers table (after the heading), add:

```tsx
<FilterBar
  filters={filterConfigs}
  values={filterValues}
  onChange={setFilterValues}
  className="mb-4"
/>
```

Replace `servers.map((srv) => (` with `filteredServers.map((srv) => (` in the table body.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd web-console && node_modules/.bin/tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add web-console/src/pages/McpConfig.tsx
git commit -m "feat: add filters to McpConfig page"
```

---

### Task 6: Add filters to CloudAccounts page

**Files:**
- Modify: `web-console/src/pages/CloudAccounts.tsx`

- [ ] **Step 1: Add FilterBar import and filter logic**

Add at the top:

```tsx
import { FilterBar, type FilterConfig } from '@/components/ui/filter-bar';
```

`useMemo` is already imported.

Inside `CloudAccounts`, after the existing `useState` declarations, add:

```tsx
const [filterValues, setFilterValues] = useState<Record<string, string>>({});

const filterConfigs: FilterConfig[] = [
  { key: 'search', type: 'search', placeholder: t('common.filterSearchAccount') },
  {
    key: 'provider',
    type: 'select',
    label: t('common.filterProvider'),
    options: [
      { label: t('common.filterAll'), value: '' },
      { label: 'AWS', value: 'aws' },
      { label: 'Aliyun', value: 'aliyun' },
      { label: 'Azure', value: 'azure' },
    ],
  },
  {
    key: 'status',
    type: 'select',
    label: t('common.filterStatus'),
    options: [
      { label: t('common.filterAll'), value: '' },
      { label: 'Active', value: 'active' },
      { label: 'Inactive', value: 'inactive' },
    ],
  },
];

const filteredAccounts = useMemo(() => {
  return accounts.filter((acc) => {
    const s = (filterValues.search || '').toLowerCase();
    if (s && !acc.name.toLowerCase().includes(s)) return false;
    if (filterValues.provider && acc.provider !== filterValues.provider) return false;
    if (filterValues.status && acc.status !== filterValues.status) return false;
    return true;
  });
}, [accounts, filterValues]);
```

- [ ] **Step 2: Add FilterBar to JSX**

Before the accounts list (after the heading), add:

```tsx
<FilterBar
  filters={filterConfigs}
  values={filterValues}
  onChange={setFilterValues}
  className="mb-4"
/>
```

Replace `accounts.map((acc) => (` with `filteredAccounts.map((acc) => (` in the card list.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd web-console && node_modules/.bin/tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add web-console/src/pages/CloudAccounts.tsx
git commit -m "feat: add filters to CloudAccounts page"
```

---

### Task 7: Migrate Instances page to FilterBar

**Files:**
- Modify: `web-console/src/pages/Instances.tsx`

- [ ] **Step 1: Replace imports**

Remove:
```tsx
import { Search } from 'lucide-react';
```

Add:
```tsx
import { FilterBar, type FilterConfig } from '@/components/ui/filter-bar';
```

- [ ] **Step 2: Replace filter state and logic**

Remove the existing `search` state and `filters` state:
```tsx
const [filters, setFilters] = useState<{ provider?: string; status?: InstanceStatus }>({});
const [search, setSearch] = useState('');
```

Replace with:
```tsx
const [filterValues, setFilterValues] = useState<Record<string, string>>({});
```

Add filter config:
```tsx
const filterConfigs: FilterConfig[] = [
  { key: 'search', type: 'search', placeholder: t('instances.searchPlaceholder') },
  {
    key: 'provider',
    type: 'select',
    label: t('instances.provider'),
    options: [
      { label: t('instances.allProviders'), value: '' },
      ...(providersData?.providers || []).map((p) => ({ label: p, value: p })),
    ],
  },
  {
    key: 'status',
    type: 'select',
    label: t('instances.status'),
    options: [
      { label: t('instances.allStatus'), value: '' },
      { label: t('instances.running'), value: 'running' },
      { label: t('instances.stopped'), value: 'stopped' },
      { label: t('instances.terminated'), value: 'terminated' },
      { label: t('instances.pending'), value: 'pending' },
      { label: t('instances.error'), value: 'error' },
    ],
  },
];
```

- [ ] **Step 3: Update filtered derivation**

Replace the existing `useMemo`:
```tsx
const filtered = useMemo(() => {
  return (instances || []).filter((inst) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (inst.name?.toLowerCase().includes(s)) ||
      (inst.providerInstanceId?.toLowerCase().includes(s)) ||
      (inst.publicIp?.includes(s)) ||
      (inst.region?.toLowerCase().includes(s))
    );
  });
}, [instances, search]);
```

With:
```tsx
const filtered = useMemo(() => {
  return (instances || []).filter((inst) => {
    const s = (filterValues.search || '').toLowerCase();
    if (s && !(inst.name?.toLowerCase().includes(s)) && !(inst.providerInstanceId?.toLowerCase().includes(s)) && !(inst.publicIp?.includes(s)) && !(inst.region?.toLowerCase().includes(s))) return false;
    if (filterValues.provider && inst.provider !== filterValues.provider) return false;
    if (filterValues.status && inst.status !== filterValues.status) return false;
    return true;
  });
}, [instances, filterValues]);
```

- [ ] **Step 4: Replace filter JSX**

Remove the entire filter Card block:
```tsx
<Card>
  <CardContent className="pt-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
      ... search input and selects ...
    </div>
  </CardContent>
</Card>
```

Replace with:
```tsx
<FilterBar
  filters={filterConfigs}
  values={filterValues}
  onChange={setFilterValues}
/>
```

- [ ] **Step 5: Update useInstances call**

Change `useInstances(filters)` to `useInstances({})` since provider/status filtering is now done client-side. Or keep it as-is if the API supports server-side filtering — the FilterBar handles client-side filtering regardless.

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd web-console && node_modules/.bin/tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add web-console/src/pages/Instances.tsx
git commit -m "refactor: migrate Instances page to use FilterBar"
```

---

### Task 8: Migrate KnowledgeBase page to FilterBar

**Files:**
- Modify: `web-console/src/components/monitor/KnowledgeBaseTab.tsx`

- [ ] **Step 1: Replace imports**

Add:
```tsx
import { FilterBar, type FilterConfig } from '@/components/ui/filter-bar';
```

- [ ] **Step 2: Replace filter state and logic**

Replace:
```tsx
const [search, setSearch] = useState('');
```

With:
```tsx
const [filterValues, setFilterValues] = useState<Record<string, string>>({});

const filterConfigs: FilterConfig[] = [
  { key: 'search', type: 'search', placeholder: '搜索症状或根因...' },
];
```

Replace the `filtered` derivation:
```tsx
const filtered = (entries || []).filter((e) =>
  !search || e.symptom.toLowerCase().includes(search.toLowerCase()) || (e.rootCause || '').toLowerCase().includes(search.toLowerCase())
);
```

With:
```tsx
const filtered = (entries || []).filter((e) => {
  const s = (filterValues.search || '').toLowerCase();
  if (!s) return true;
  return e.symptom.toLowerCase().includes(s) || (e.rootCause || '').toLowerCase().includes(s);
});
```

- [ ] **Step 3: Replace filter JSX**

Remove:
```tsx
<Input
  placeholder="搜索症状或根因..."
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  className="max-w-sm"
/>
```

Replace with:
```tsx
<FilterBar
  filters={filterConfigs}
  values={filterValues}
  onChange={setFilterValues}
/>
```

Remove the unused `Input` import if no longer needed.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd web-console && node_modules/.bin/tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add web-console/src/components/monitor/KnowledgeBaseTab.tsx
git commit -m "refactor: migrate KnowledgeBase page to use FilterBar"
```

---

### Task 9: Migrate Audit page to FilterBar

**Files:**
- Modify: `web-console/src/pages/Audit.tsx`

Note: Audit uses server-side filtering with `activeQuery`. The FilterBar replaces the action/provider search fields, but date range inputs stay inline because FilterBar v1 doesn't support date type.

- [ ] **Step 1: Add FilterBar import**

Add at the top:
```tsx
import { FilterBar, type FilterConfig } from '@/components/ui/filter-bar';
```

- [ ] **Step 2: Add filter state and config**

Inside `Audit`, after the existing `query`/`activeQuery` state, add:

```tsx
const [filterValues, setFilterValues] = useState<Record<string, string>>({
  action: query.action || '',
  provider: query.provider || '',
});

const filterConfigs: FilterConfig[] = [
  { key: 'action', type: 'search', placeholder: t('audit.actionPlaceholder') },
  {
    key: 'provider',
    type: 'select',
    label: t('audit.provider'),
    options: [
      { label: t('audit.allProviders'), value: '' },
      ...PROVIDER_OPTIONS.map((opt) => ({ label: opt.label, value: opt.value })),
    ],
  },
];
```

- [ ] **Step 3: Sync filter values with query**

Add an effect to sync filter values back to query:

```tsx
import { useState, useEffect } from 'react';
```

```tsx
useEffect(() => {
  setQuery((prev) => ({
    ...prev,
    action: filterValues.action || undefined,
    provider: filterValues.provider || undefined,
    offset: 0,
  }));
}, [filterValues]);
```

- [ ] **Step 4: Replace filter JSX**

Remove the action `<Input>` and provider `<Select>` blocks from the filter bar div. Keep the date range inputs.

Replace the removed fields with:
```tsx
<FilterBar
  filters={filterConfigs}
  values={filterValues}
  onChange={setFilterValues}
/>
```

The resulting filter bar div should contain:
1. FilterBar (action search + provider select)
2. Date range inputs (kept inline)

- [ ] **Step 5: Remove handleSearch button (if redundant)**

The existing "搜索" button triggers `setActiveQuery`. With FilterBar + useEffect, the query updates automatically. Remove the manual search button if the useEffect handles it, or keep it if you want explicit search triggering.

Decision: Keep the search button for explicit triggering — the useEffect only syncs filterValues to query, the button applies it.

- [ ] **Step 6: Verify TypeScript compiles**

Run: `cd web-console && node_modules/.bin/tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add web-console/src/pages/Audit.tsx
git commit -m "refactor: migrate Audit page filters to use FilterBar"
```

---

### Task 10: Migrate Resources page to FilterBar

**Files:**
- Modify: `web-console/src/pages/Resources.tsx`

Resources has two views: "all resources" and "instances". Both have inline search/provider/status filters. Replace both with FilterBar.

- [ ] **Step 1: Add FilterBar import**

Add at the top:
```tsx
import { FilterBar, type FilterConfig } from '@/components/ui/filter-bar';
```

Remove `Search` from lucide-react imports if no longer used elsewhere.

- [ ] **Step 2: Replace filter state in Resources component**

Remove:
```tsx
const [search, setSearch] = useState('');
const [provider, setProvider] = useState('');
const [status, setStatus] = useState('');
```

Replace with:
```tsx
const [filterValues, setFilterValues] = useState<Record<string, string>>({});
```

- [ ] **Step 3: Add filter config and filtered data**

After state declarations, add:

```tsx
const resourceFilterConfigs: FilterConfig[] = [
  { key: 'search', type: 'search', placeholder: t('resources.searchPlaceholder') },
  {
    key: 'provider',
    type: 'select',
    label: t('resources.provider'),
    options: [
      { label: t('resources.allProviders'), value: '' },
      ...PROVIDERS.map((p) => ({ label: p, value: p })),
    ],
  },
  {
    key: 'status',
    type: 'select',
    label: t('resources.status'),
    options: [
      { label: t('resources.allStatus'), value: '' },
      { label: 'running', value: 'running' },
      { label: 'stopped', value: 'stopped' },
      { label: 'available', value: 'available' },
      { label: 'pending', value: 'pending' },
      { label: 'error', value: 'error' },
    ],
  },
];
```

- [ ] **Step 4: Update useResources query params**

Change the `useResources` call to use `filterValues`:

```tsx
const { data: result, isLoading } = useResources({
  resourceType: selectedType === 'all' ? undefined : selectedType,
  provider: filterValues.provider || undefined,
  status: filterValues.status || undefined,
  search: filterValues.search || undefined,
  limit: 100,
}, { enabled: viewMode === 'all' });
```

- [ ] **Step 5: Replace filter JSX in resources view**

Find the filter section in the resources view (the div with search Input, provider Select, status Select). Replace it with:

```tsx
<FilterBar
  filters={resourceFilterConfigs}
  values={filterValues}
  onChange={setFilterValues}
/>
```

- [ ] **Step 6: Replace filter JSX in instances view**

The instances view has its own inline filters. Find and replace them with the same FilterBar pattern. The instances view filters search, provider, and status — use the same `resourceFilterConfigs` and `filterValues`.

- [ ] **Step 7: Verify TypeScript compiles**

Run: `cd web-console && node_modules/.bin/tsc --noEmit 2>&1 | head -20`
Expected: No errors

- [ ] **Step 8: Commit**

```bash
git add web-console/src/pages/Resources.tsx
git commit -m "refactor: migrate Resources page to use FilterBar"
```

---

### Task 11: TypeScript verification and final check

**Files:** None (verification only)

- [ ] **Step 1: Full TypeScript check**

Run: `cd web-console && node_modules/.bin/tsc --noEmit 2>&1`
Expected: No errors

- [ ] **Step 2: Production build**

Run: `cd web-console && pnpm run build 2>&1 | tail -5`
Expected: "built in X.XXs" with no errors

- [ ] **Step 3: Final commit (if any fixes needed)**

If any fixes were needed, commit them:
```bash
git add -A
git commit -m "fix: resolve TypeScript issues from filter bar migration"
```
