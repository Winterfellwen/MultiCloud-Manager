# Phase 3 UI/UX Page Design Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Page design 2/5 → 4/5 across 5 areas: Markdown, sorting, charts, time range, status i18n

**Architecture:** Each task is independent and affects different files. Tasks can be executed in any order.

**Tech Stack:** React, react-markdown + rehype-highlight, recharts (already installed), Tailwind CSS

---

### Task 1: AI Agent Markdown Rendering

**Files:**
- Modify: `web-console/src/components/chat/MessageBubble.tsx` — add ReactMarkdown to TextBlock
- Modify: `web-console/src/index.css` — add styles for rendered markdown

- [ ] **Step 1: Install deps**

```bash
npm install react-markdown rehype-highlight
```

- [ ] **Step 2: Create MarkdownRenderer component**

Create `web-console/src/components/chat/MarkdownRenderer.tsx`:

```tsx
import ReactMarkdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

function CodeBlock({ className, children, ...props }: React.ComponentPropsWithoutRef<'code'>) {
  const [copied, setCopied] = useState(false);
  const code = String(children).replace(/\n$/, '');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const match = /language-(\w+)/.exec(className || '');

  return (
    <div className="relative group my-2 rounded-md border bg-muted overflow-hidden">
      {match && (
        <div className="flex items-center justify-between px-3 py-1 text-xs text-muted-foreground border-b bg-muted/50">
          <span>{match[1]}</span>
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 hover:text-foreground transition-colors"
          >
            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            {copied ? '已复制' : '复制'}
          </button>
        </div>
      )}
      <pre className="p-3 overflow-x-auto text-sm">
        <code className={className} {...props}>{children}</code>
      </pre>
    </div>
  );
}

export function MarkdownRenderer({ content }: { content: string }) {
  return (
    <div className="markdown-body text-sm">
      <ReactMarkdown
        rehypePlugins={[rehypeHighlight]}
        components={{
          code: CodeBlock,
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {children}
            </a>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 3: Update TextBlock in MessageBubble.tsx**

Replace the content rendering in TextBlock:

Change:
```tsx
{content && (
  <div className="whitespace-pre-wrap break-words rounded-lg bg-muted px-3 py-2 text-sm text-foreground">
    {content}
    {isStreaming && (
      <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle" />
    )}
  </div>
)}
```

To:
```tsx
{content && (
  <div className="rounded-lg bg-muted px-3 py-2">
    <MarkdownRenderer content={content} />
    {isStreaming && (
      <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle" />
    )}
  </div>
)}
```

And for the old content path (line ~285-295), replace similarly:
```tsx
{!isUser && message.content && (
  <div className="rounded-lg bg-muted px-3 py-2">
    <MarkdownRenderer content={message.content} />
    {isStreaming && (
      <span className="ml-0.5 inline-block h-3.5 w-1.5 animate-pulse bg-current align-middle" />
    )}
  </div>
)}
```

Add import:
```tsx
import { MarkdownRenderer } from './MarkdownRenderer';
```

- [ ] **Step 4: Add markdown styles to index.css**

In `web-console/src/index.css`, add:

```css
.markdown-body h1 { font-size: 1.5rem; font-weight: 700; margin: 1rem 0 0.5rem; }
.markdown-body h2 { font-size: 1.25rem; font-weight: 600; margin: 0.75rem 0 0.5rem; }
.markdown-body h3 { font-size: 1.1rem; font-weight: 600; margin: 0.5rem 0 0.25rem; }
.markdown-body p { margin: 0.5rem 0; line-height: 1.6; }
.markdown-body ul, .markdown-body ol { margin: 0.5rem 0; padding-left: 1.5rem; }
.markdown-body li { margin: 0.25rem 0; }
.markdown-body blockquote { border-left: 3px solid hsl(var(--border)); padding-left: 1rem; margin: 0.5rem 0; color: hsl(var(--muted-foreground)); }
.markdown-body table { border-collapse: collapse; margin: 0.5rem 0; width: 100%; }
.markdown-body th, .markdown-body td { border: 1px solid hsl(var(--border)); padding: 0.5rem; text-align: left; }
.markdown-body th { background: hsl(var(--muted)); font-weight: 600; }
.markdown-body code:not(pre code) { background: hsl(var(--muted)); padding: 0.125rem 0.25rem; border-radius: 0.25rem; font-size: 0.875em; }
.markdown-body pre { margin: 0; }
```

- [ ] **Step 5: Verify compilation**

Run `npx tsc --noEmit` in web-console.
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add web-console/src/components/chat/MarkdownRenderer.tsx web-console/src/components/chat/MessageBubble.tsx web-console/src/index.css web-console/package.json web-console/package-lock.json && git commit -m "feat: add markdown rendering for AI chat messages"
```

---

### Task 2: Table Column Sorting

**Files:**
- Modify: `web-console/src/components/ui/table-with-pagination.tsx` — add sortable columns

- [ ] **Step 1: Add sortable to Column interface and sort state**

```tsx
export interface Column<T> {
  key: string;
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  className?: string;
  cell?: (value: unknown, row: T) => React.ReactNode;
  sortable?: boolean;
}
```

Add sort state and logic inside `TableWithPagination`:
```tsx
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

// Inside component:
const [sortKey, setSortKey] = useState<string | null>(null);
const [sortDir, setSortDir] = useState<'asc' | 'desc' | null>(null);

const handleSort = (col: Column<T>) => {
  if (!col.sortable) return;
  if (sortKey === col.key) {
    if (sortDir === 'asc') { setSortDir('desc'); }
    else if (sortDir === 'desc') { setSortKey(null); setSortDir(null); }
    else { setSortKey(col.key); setSortDir('asc'); }
  } else {
    setSortKey(col.key);
    setSortDir('asc');
  }
};

const sortedData = useMemo(() => {
  if (!sortKey || !sortDir) return data;
  return [...data].sort((a, b) => {
    const col = columns.find(c => c.key === sortKey);
    if (!col) return 0;
    const aVal = typeof col.accessor === 'function' ? col.accessor(a) : a[col.accessor as keyof T];
    const bVal = typeof col.accessor === 'function' ? col.accessor(b) : b[col.accessor as keyof T];
    const aStr = String(aVal ?? '');
    const bStr = String(bVal ?? '');
    const cmp = isNaN(Number(aStr)) || isNaN(Number(bStr))
      ? aStr.localeCompare(bStr)
      : Number(aStr) - Number(bStr);
    return sortDir === 'asc' ? cmp : -cmp;
  });
}, [data, sortKey, sortDir, columns]);
```

- [ ] **Step 2: Update table header rendering**

Change:
```tsx
<TableHead key={col.key} className={col.className}>
  {col.header}
</TableHead>
```

To:
```tsx
<TableHead key={col.key} className={cn(col.className, col.sortable && 'cursor-pointer select-none')}>
  <button
    onClick={() => handleSort(col)}
    className="flex items-center gap-1 w-full text-left font-medium"
  >
    {col.header}
    {col.sortable && (
      sortKey === col.key
        ? sortDir === 'asc'
          ? <ArrowUp className="h-3 w-3" />
          : <ArrowDown className="h-3 w-3" />
        : <ArrowUpDown className="h-3 w-3 opacity-30" />
    )}
  </button>
</TableHead>
```

Add `import { cn } from '@/lib/utils';` if not already imported.

- [ ] **Step 3: Use sorted data**

Replace `displayData` computation:
```tsx
const displayData = pagination
  ? sortedData.slice(startRow, endRow)
  : sortedData;
```

- [ ] **Step 4: Enable sortable on Resources and Costs columns**

In `web-console/src/pages/Resources.tsx`, add `sortable: true` to columns:
```tsx
const resourceColumns: Column<CloudResource>[] = [
  // ... add sortable: true to name, type, provider, region, status
];
```

Similarly in `web-console/src/pages/Costs.tsx` for provider, service, totalAmount, currency.

- [ ] **Step 5: Verify compilation**

Run `npx tsc --noEmit` in web-console.
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add web-console/src/components/ui/table-with-pagination.tsx web-console/src/pages/Resources.tsx web-console/src/pages/Costs.tsx && git commit -m "feat: add sortable columns to tables"
```

---

### Task 3: Chart Visualization (Costs + Monitor)

**Files:**
- Modify: `web-console/src/pages/Costs.tsx` — add pie chart + bar chart
- Modify: `web-console/src/pages/Monitor.tsx` — add severity distribution bar chart in events tab

- [ ] **Step 1: Add cost pie chart to Costs page**

In `web-console/src/pages/Costs.tsx`, add imports:
```tsx
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Legend } from 'recharts';
```

After the provider totals cards, before the service breakdown section, add a pie chart:

```tsx
<Card>
  <CardContent className="pt-6">
    <h2 className="text-lg font-semibold mb-4">{t('costs.providerDistribution')}</h2>
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={providerTotals.map(p => ({ name: p.provider, value: p.total }))}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            outerRadius={80}
            label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          >
            {providerTotals.map((p, i) => (
              <Cell key={i} fill={`hsl(${i * 45 + 200}, 70%, 50%)`} />
            ))}
          </Pie>
          <Tooltip formatter={(value: number) => `$${value.toFixed(2)}`} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  </CardContent>
</Card>
```

- [ ] **Step 2: Add severity distribution bar chart to Monitor page**

In `web-console/src/pages/Monitor.tsx`, add imports:
```tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
```

In the EventsTab, before the filter bar, compute severity counts:
```tsx
const severityData = useMemo(() => {
  const counts: Record<string, number> = { critical: 0, warning: 0, info: 0 };
  (events || []).forEach(e => {
    if (counts[e.severity] !== undefined) counts[e.severity]++;
  });
  return Object.entries(counts).map(([severity, count]) => ({ severity, count }));
}, [events]);
```

Add a chart before the filter:
```tsx
<Card className="mb-4">
  <CardContent className="pt-4">
    <h3 className="text-sm font-medium mb-2">{t('monitor.severityDistribution')}</h3>
    <div className="h-32">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={severityData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="severity" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </CardContent>
</Card>
```

- [ ] **Step 3: Add i18n keys**

Add to en.json:
```json
"costs": {
  "providerDistribution": "Provider Distribution"
},
"monitor": {
  "severityDistribution": "Severity Distribution"
}
```

Add to zh.json:
```json
"costs": {
  "providerDistribution": "提供商分布"
},
"monitor": {
  "severityDistribution": "严重级别分布"
}
```

- [ ] **Step 4: Verify compilation**

Run `npx tsc --noEmit` in web-console.
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add web-console/src/pages/Costs.tsx web-console/src/pages/Monitor.tsx web-console/src/i18n/locales/en.json web-console/src/i18n/locales/zh.json && git commit -m "feat: add cost pie chart and monitor severity chart"
```

---

### Task 4: Time Range Selector

**Files:**
- Modify: `web-console/src/pages/Dashboard.tsx` — add time preset buttons
- Modify: `web-console/src/pages/Costs.tsx` — add time preset buttons

- [ ] **Step 1: Add time presets to Dashboard**

In `web-console/src/pages/Dashboard.tsx`, add state and presets:

```tsx
type TimePreset = '24h' | '7d' | '30d';
const [timePreset, setTimePreset] = useState<TimePreset>('24h');

const TIME_PRESETS: { key: TimePreset; label: string }[] = [
  { key: '24h', label: t('dashboard.time24h') },
  { key: '7d', label: t('dashboard.time7d') },
  { key: '30d', label: t('dashboard.time30d') },
];
```

Add preset buttons next to the title:
```tsx
<div className="flex items-center justify-between">
  <h1 className="text-xl sm:text-2xl font-bold">{t('dashboard.title')}</h1>
  <div className="flex items-center gap-1">
    {TIME_PRESETS.map(p => (
      <Button
        key={p.key}
        variant={timePreset === p.key ? 'secondary' : 'ghost'}
        size="sm"
        onClick={() => setTimePreset(p.key)}
      >
        {p.label}
      </Button>
    ))}
  </div>
</div>
```

Add Button import if not already imported in Dashboard.tsx.

- [ ] **Step 2: Add time presets to Costs**

In `web-console/src/pages/Costs.tsx`, add preset buttons next to the date inputs:

```tsx
type DatePreset = 'thisMonth' | 'lastMonth' | 'last7d' | 'last30d';

const DATE_PRESETS: { key: DatePreset; label: string; getRange: () => { start: string; end: string } }[] = [
  {
    key: 'thisMonth',
    label: t('costs.thisMonth'),
    getRange: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    },
  },
  {
    key: 'lastMonth',
    label: t('costs.lastMonth'),
    getRange: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
    },
  },
  {
    key: 'last7d',
    label: t('costs.last7d'),
    getRange: () => {
      const now = new Date();
      const start = new Date(now.getTime() - 7 * 86400000);
      return { start: start.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    },
  },
  {
    key: 'last30d',
    label: t('costs.last30d'),
    getRange: () => {
      const now = new Date();
      const start = new Date(now.getTime() - 30 * 86400000);
      return { start: start.toISOString().slice(0, 10), end: now.toISOString().slice(0, 10) };
    },
  },
];

const applyPreset = (preset: typeof DATE_PRESETS[0]) => {
  const { start, end } = preset.getRange();
  setStartDate(start);
  setEndDate(end);
};
```

Add buttons in the header, near the date inputs:
```tsx
<div className="flex items-center gap-1 flex-wrap">
  {DATE_PRESETS.map(p => (
    <Button key={p.key} variant="outline" size="sm" onClick={() => applyPreset(p)}>
      {p.label}
    </Button>
  ))}
</div>
```

Place this before or after the date input row.

- [ ] **Step 3: Add i18n keys**

en.json:
```json
"dashboard": {
  "time24h": "24H",
  "time7d": "7 Days",
  "time30d": "30 Days"
},
"costs": {
  "thisMonth": "This Month",
  "lastMonth": "Last Month",
  "last7d": "7 Days",
  "last30d": "30 Days"
}
```

zh.json:
```json
"dashboard": {
  "time24h": "24小时",
  "time7d": "7天",
  "time30d": "30天"
},
"costs": {
  "thisMonth": "本月",
  "lastMonth": "上月",
  "last7d": "近7天",
  "last30d": "近30天"
}
```

- [ ] **Step 4: Verify compilation**

Run `npx tsc --noEmit` in web-console.
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add web-console/src/pages/Dashboard.tsx web-console/src/pages/Costs.tsx web-console/src/i18n/locales/en.json web-console/src/i18n/locales/zh.json && git commit -m "feat: add time range preset selectors to dashboard and costs"
```

---

### Task 5: Status Label Localization

**Files:**
- Modify: `web-console/src/i18n/locales/en.json` — add status.* keys
- Modify: `web-console/src/i18n/locales/zh.json` — add status.* translations
- Modify: `web-console/src/components/StatusBadge.tsx` — ensure t() is used for all statuses

- [ ] **Step 1: Check current status display**

Review `web-console/src/pages/Resources.tsx` to find where status text is displayed directly (not via StatusBadge). Look for patterns like: `{status}`, `{row.status}`, etc.

- [ ] **Step 2: Add i18n keys**

en.json:
```json
"instances": {
  "running": "Running",
  "stopped": "Stopped",
  "terminated": "Terminated",
  "pending": "Pending",
  "error": "Error",
  "in-use": "In Use",
  "available": "Available",
  "attached": "Attached",
  "detached": "Detached",
  "creating": "Creating",
  "deleting": "Deleting",
  "unknown": "Unknown"
}
```

zh.json:
```json
"instances": {
  "running": "运行中",
  "stopped": "已停止",
  "terminated": "已终止",
  "pending": "待处理",
  "error": "错误",
  "in-use": "使用中",
  "available": "可用",
  "attached": "已挂载",
  "detached": "已卸载",
  "creating": "创建中",
  "deleting": "删除中",
  "unknown": "未知"
}
```

- [ ] **Step 3: Update StatusBadge to handle arbitrary statuses**

`InstanceStatusBadge` already uses `t('instances.${status}', status)` with fallback. If the keys don't exist, it shows the raw value. With keys added in Step 2, it will show translated values.

Check if Resources page uses `InstanceStatusBadge` for instance status cells. If it uses raw text, replace with `<InstanceStatusBadge status={row.status} />`.

- [ ] **Step 4: Verify compilation**

Run `npx tsc --noEmit` in web-console.
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add web-console/src/i18n/locales/en.json web-console/src/i18n/locales/zh.json web-console/src/components/StatusBadge.tsx web-console/src/pages/Resources.tsx && git commit -m "fix: localize resource status labels"
```

---

## Self-Review Checklist

1. **Spec coverage:**
   - Task 1 → Section 1 (Markdown)
   - Task 2 → Section 2 (Table Sorting)
   - Task 3 → Section 3 (Charts)
   - Task 4 → Section 4 (Time Range)
   - Task 5 → Section 5 (Status i18n)
   All covered. ✅

2. **Placeholder scan:** No TBD/TODO/incomplete patterns. ✅

3. **Type consistency:** Column interface extended with sortable, consistent with existing usage. ✅

4. **Scope:** Phase 3 only — page-level UI enhancements. ✅
