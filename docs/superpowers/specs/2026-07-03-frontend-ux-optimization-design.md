# Frontend UX Optimization Design

**Date:** 2026-07-03  
**Project:** MultiCloud-Manager  
**Scope:** Web-console (React + Tailwind + shadcn/ui)  

---

## 1. Background & Problem Statement

A comprehensive UX audit of the web-console revealed 21 concrete issues across 5 categories:

| Category | Count | Examples |
|----------|-------|----------|
| i18n gaps | 6 | ErrorBoundary, DemoBanner, Dashboard, Resources, ModelSelect, Login |
| Dark mode | 5 | AiSettings, InstanceLogsCard, Monitor, CloudAccounts, SlashCommandMenu/ModelSelect |
| Interaction consistency | 7 | InstanceDetail, Monitor (2), CloudAccounts, AiSettings (3) — native `confirm()` vs custom Dialog |
| Tables & pagination | 9 | Resources, Monitor (3 tabs), Users, Costs — only Audit has pagination |
| Form validation | 4 | CloudAccounts, AiSettings, Create Instance forms — single error banner, no inline messages |

Plus: 2 console.log left in Topology, 1 dead page (Instances.tsx), 1 missing i18n key (`instances.provider`), redundant Chinese fallbacks in Topology.

---

## 2. Design Principles

1. **Batch by type** — Fix all i18n first, then dark mode, then interaction, then tables, then forms. Reduces context-switching risk.
2. **Reuse over rewrite** — Extract reusable primitives (`TableWithPagination`, `FormField`, `ConfirmDialog`, color tokens) rather than patching each page.
3. **No breaking changes** — All new components are additive; old pages migrate incrementally.
4. **Testability** — Every new primitive ships with unit tests + Playwright coverage for happy paths.

---

## 3. Solution Architecture

### 3.1 New Primitives (in `web-console/src/components/ui/`)

| Primitive | Responsibility | Key Props |
|-----------|----------------|-----------|
| `TableWithPagination` | Server/client pagination, sorting, empty state illustration, loading skeleton | `data`, `columns`, `pagination?`, `sorter?`, `emptyIllustration?` |
| `FormField` | Label + input + inline error + required asterisk + tooltip | `label`, `error`, `children`, `required`, `tooltip` |
| `ConfirmDialog` | Unified delete/confirm modal (replaces `window.confirm`) | `open`, `onConfirm`, `onCancel`, `title`, `description`, `variant?` |
| `ColorTokens` | Tailwind `theme.extend.colors` tokens for semantic dark-mode colors | `success`, `warning`, `destructive`, `info` + `DEFAULT/10/20/.../950` scales |

### 3.2 Color Token Design

```ts
// tailwind.config.ts
colors: {
  success: {
    DEFAULT: 'hsl(var(--success))',
    50: 'hsl(var(--success-50))',
    // ... 100-950
    foreground: 'hsl(var(--success-foreground))',
  },
  warning: { ... },
  destructive: { ... },
  info: { ... },
}
```

CSS variables defined in `globals.css`:

```css
:root {
  --success: 142 76% 36%;
  --success-50: 142 76% 95%;
  --success-100: 142 76% 90%;
  /* ... */
  --success-foreground: 0 0% 100%;
}
.dark {
  --success: 142 70% 45%;
  --success-50: 142 30% 15%;
  /* ... */
}
```

Usage: `bg-success/10 text-success dark:bg-success-950/30` — single source of truth.

### 3.3 i18n Key Additions

| Key | zh | en |
|-----|-----|-----|
| `errorBoundary.title` | 应用出现错误 | Application Error |
| `errorBoundary.message` | 发生了未知错误 | An unexpected error occurred |
| `errorBoundary.retry` | 刷新页面 | Refresh Page |
| `demoBanner.title` | 演示模式 | Demo Mode |
| `demoBanner.description` | 所有数据为模拟数据，退出登录后清除 | All data is simulated, cleared on logout |
| `dashboard.provider.aliyun` | 阿里云 | Alibaba Cloud |
| `resources.columns.spec` | 规格 | Spec |
| `resources.columns.ip` | IP | IP |
| `resources.columns.capacity` | 容量 | Capacity |
| `resources.columns.type` | 类型 | Type |
| `resources.columns.engine` | 引擎 | Engine |
| `resources.columns.objects` | 对象数 | Objects |
| `resources.columns.size` | 大小 | Size |
| `resources.columns.dns` | DNS | DNS |
| `resources.columns.nodes` | 节点数 | Nodes |
| `resources.columns.sku` | SKU | SKU |
| `resources.columns.endpoint` | 端点 | Endpoint |
| `modelSelect.placeholder` | 选择模型 | Select Model |
| `login.author` | Created by 温信锐 (Peter Wen) | Created by 温信锐 (Peter Wen) |

---

## 4. Migration Plan (4 PRs)

### PR 1a: Primitives + Color Tokens (Foundation)
- `TableWithPagination` + tests
- `FormField` + Zod integration example
- `ConfirmDialog` + tests
- `ColorTokens` in `tailwind.config.ts` + `globals.css`
- Storybook stories for each

### PR 1b: i18n Batch Fix (Parallel)
- 6 files: replace hardcoded strings → `t('key')`
- Update `zh.json` + `en.json` with 19 new keys

### PR 2: Site-wide Application
- Dark mode: 5 files → semantic tokens (`bg-success/10` etc.)
- Interaction: 7 `confirm()` → `<ConfirmDialog />`
- Tables: 9 pages → `<TableWithPagination />` (Audit stays as reference)
- Forms: 4 pages → `<FormField>` + Zod schemas
- Dead code: delete `Instances.tsx`, fix `instances.provider` → `common.provider`
- Cleanup: remove Topology console.log, redundant Chinese fallbacks

### PR 3: E2E Verification
- Playwright tests for: login, dashboard, resources CRUD, monitor CRUD, AI settings CRUD, chat flow
- Visual regression for dark/light mode on key pages

---

## 5. Component APIs (Sketch)

### `TableWithPagination`

```tsx
interface Column<T> {
  key: string;
  header: string;
  accessor: keyof T | ((row: T) => ReactNode);
  sorter?: (a: T, b: T) => number;
  cell?: (value: any, row: T) => ReactNode;
}

interface TableWithPaginationProps<T> {
  data: T[];
  columns: Column<T>[];
  pagination?: {
    pageSize: number;
    pageIndex: number;
    onPaginationChange: (pageIndex: number, pageSize: number) => void;
    total: number;
  };
  loading?: boolean;
  emptyIllustration?: ReactNode;
  onRowClick?: (row: T) => void;
}
```

### `FormField`

```tsx
interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  tooltip?: string;
  children: ReactNode;
  htmlFor?: string;
}
```

### `ConfirmDialog`

```tsx
interface ConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  title: string;
  description: string;
  variant?: 'destructive' | 'default';
  confirmText?: string;
  cancelText?: string;
}
```

---

## 6. Acceptance Criteria

| Area | Criteria |
|------|----------|
| i18n | Switching language in topbar instantly updates all 19 new keys; no Chinese leaks in EN mode |
| Dark mode | `npm run dev` → toggle theme → no bright `bg-*-50` backgrounds visible on AiSettings/InstanceLogs/Monitor/CloudAccounts |
| Interaction | Delete actions on InstanceDetail/Monitor/CloudAccounts/AiSettings show styled dialog, not native alert |
| Tables | Resources/Monitor/Users/Costs show pagination controls, sort on header click, skeleton while loading |
| Forms | CloudAccounts/AiSettings/Create Instance show inline red error under each invalid field on submit |
| Dead code | `Instances.tsx` removed, no import errors, `/instances` redirect works |
| Regression | All existing Playwright tests pass; new tests cover 5 critical flows |

---

## 7. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Color token migration misses a usage | Medium | Low (visual only) | Grep `bg-green-50\|bg-red-50\|bg-blue-50\|bg-gray-300` after PR 2 |
| `ConfirmDialog` breaks nested dialogs | Low | Medium | Use `Dialog` portal; test nested case in Storybook |
| Pagination breaks server-side APIs | Low | High | Start with client-side pagination; server-side opt-in via prop |
| i18n keys typo in one locale | Low | Low | CI check: `jq` script validates key parity zh/en |

---

## 8. Out of Scope

- Skeleton screen design system (future: dedicated `Skeleton` primitive)
- Virtualized tables for 10k+ rows (current max ~100)
- Advanced form patterns (wizard, multi-step) — current forms are single-panel
- Accessibility audit (WCAG 2.1 AA) — will be separate initiative

---

## 9. File List Summary

**New files:**
```
web-console/src/components/ui/table-with-pagination.tsx
web-console/src/components/ui/form-field.tsx
web-console/src/components/ui/confirm-dialog.tsx
web-console/src/components/ui/color-tokens.css (or inline in globals.css)
```

**Modified files (17+):**
```
web-console/src/components/ErrorBoundary.tsx
web-console/src/components/common/DemoBanner.tsx
web-console/src/components/chat/ModelSelect.tsx
web-console/src/components/chat/SlashCommandMenu.tsx
web-console/src/pages/Dashboard.tsx
web-console/src/pages/Resources.tsx
web-console/src/pages/InstanceDetail.tsx
web-console/src/pages/Monitor.tsx
web-console/src/pages/Users.tsx
web-console/src/pages/Audit.tsx
web-console/src/pages/CloudAccounts.tsx
web-console/src/pages/AiSettings.tsx
web-console/src/pages/Topology.tsx
web-console/src/pages/Login.tsx
web-console/src/i18n/locales/zh.json
web-console/src/i18n/locales/en.json
web-console/tailwind.config.ts
web-console/src/index.css (globals.css)
```

**Deleted:**
```
web-console/src/pages/Instances.tsx
```

---

*Design approved. Ready for implementation planning.*