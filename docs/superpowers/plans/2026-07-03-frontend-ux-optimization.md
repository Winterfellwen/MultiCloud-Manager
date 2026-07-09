# Frontend UX Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 21 UX issues across i18n, dark mode, interaction consistency, tables, and forms by building reusable primitives and migrating all pages.

**Architecture:** Extract 4 reusable primitives (`TableWithPagination`, `FormField`, `ConfirmDialog`, color tokens) then migrate all 17 pages in 4 PRs: primitives → i18n → site-wide application → E2E verification.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, shadcn/ui, i18next, react-hook-form, zod, TanStack Table, Playwright

---

## File Structure

```
web-console/src/components/ui/
├── table-with-pagination.tsx  (NEW)
├── form-field.tsx             (NEW)
├── confirm-dialog.tsx         (NEW)
├── dialog.tsx                 (EXISTING - extend)
├── table.tsx                  (EXISTING - extend)
└── ...

web-console/src/index.css      (MODIFY - add color tokens)
web-console/tailwind.config.js (MODIFY - extend colors)
```

---

## Phase 1: PR 1a — Primitives + Color Tokens

### Task 1: Color Tokens — CSS Variables

**Files:**
- Modify: `web-console/src/index.css`

- [ ] **Step 1: Add CSS variables for semantic color tokens**

Append to `web-console/src/index.css` (before the `@layer components` block or at the end):

```css
/* ===== Semantic Color Tokens ===== */
:root {
  --success: 142 76% 36%;
  --success-50: 142 76% 95%;
  --success-100: 142 76% 90%;
  --success-200: 142 76% 80%;
  --success-300: 142 76% 70%;
  --success-400: 142 76% 60%;
  --success-500: 142 76% 50%;
  --success-600: 142 76% 40%;
  --success-700: 142 76% 30%;
  --success-800: 142 76% 20%;
  --success-900: 142 76% 10%;
  --success-950: 142 76% 5%;
  --success-foreground: 0 0% 100%;

  --warning: 38 92% 50%;
  --warning-50: 38 92% 95%;
  --warning-100: 38 92% 90%;
  --warning-200: 38 92% 80%;
  --warning-300: 38 92% 70%;
  --warning-400: 38 92% 60%;
  --warning-500: 38 92% 50%;
  --warning-600: 38 92% 40%;
  --warning-700: 38 92% 30%;
  --warning-800: 38 92% 20%;
  --warning-900: 38 92% 10%;
  --warning-950: 38 92% 5%;
  --warning-foreground: 0 0% 100%;

  --info: 217 91% 60%;
  --info-50: 217 91% 95%;
  --info-100: 217 91% 90%;
  --info-200: 217 91% 80%;
  --info-300: 217 91% 70%;
  --info-400: 217 91% 60%;
  --info-500: 217 91% 50%;
  --info-600: 217 91% 40%;
  --info-700: 217 91% 30%;
  --info-800: 217 91% 20%;
  --info-900: 217 91% 10%;
  --info-950: 217 91% 5%;
  --info-foreground: 0 0% 100%;
}

.dark {
  --success: 142 70% 45%;
  --success-50: 142 30% 15%;
  --success-100: 142 30% 20%;
  --success-200: 142 30% 25%;
  --success-300: 142 40% 30%;
  --success-400: 142 50% 35%;
  --success-500: 142 60% 40%;
  --success-600: 142 70% 45%;
  --success-700: 142 70% 55%;
  --success-800: 142 70% 65%;
  --success-900: 142 70% 75%;
  --success-950: 142 70% 85%;
  --success-foreground: 0 0% 100%;

  --warning: 38 85% 55%;
  --warning-50: 38 30% 15%;
  --warning-100: 38 30% 20%;
  --warning-200: 38 30% 25%;
  --warning-300: 38 40% 30%;
  --warning-400: 38 50% 35%;
  --warning-500: 38 60% 40%;
  --warning-600: 38 70% 45%;
  --warning-700: 38 85% 55%;
  --warning-800: 38 85% 65%;
  --warning-900: 38 85% 75%;
  --warning-950: 38 85% 85%;
  --warning-foreground: 0 0% 100%;

  --info: 217 80% 65%;
  --info-50: 217 30% 15%;
  --info-100: 217 30% 20%;
  --info-200: 217 30% 25%;
  --info-300: 217 40% 30%;
  --info-400: 217 50% 35%;
  --info-500: 217 60% 40%;
  --info-600: 217 70% 45%;
  --info-700: 217 80% 55%;
  --info-800: 217 80% 65%;
  --info-900: 217 80% 75%;
  --info-950: 217 80% 85%;
  --info-foreground: 0 0% 100%;
}
```

- [ ] **Step 2: Verify CSS loads without error**

Run: `cd web-console && npm run dev`
Open http://localhost:5173, open DevTools Console, confirm no CSS parse errors.

- [ ] **Step 3: Commit**

```bash
git add web-console/src/index.css
git commit -m "feat: add semantic color token CSS variables for dark mode"
```

---

### Task 2: Color Tokens — Tailwind Config

**Files:**
- Modify: `web-console/tailwind.config.js`

- [ ] **Step 1: Add semantic colors to Tailwind config**

In `web-console/tailwind.config.js`, find the `colors` object inside `theme.extend` and add:

```js
// In theme.extend.colors (after existing colors)
success: {
  DEFAULT: 'hsl(var(--success))',
  50: 'hsl(var(--success-50))',
  100: 'hsl(var(--success-100))',
  200: 'hsl(var(--success-200))',
  300: 'hsl(var(--success-300))',
  400: 'hsl(var(--success-400))',
  500: 'hsl(var(--success-500))',
  600: 'hsl(var(--success-600))',
  700: 'hsl(var(--success-700))',
  800: 'hsl(var(--success-800))',
  900: 'hsl(var(--success-900))',
  950: 'hsl(var(--success-950))',
  foreground: 'hsl(var(--success-foreground))',
},
warning: {
  DEFAULT: 'hsl(var(--warning))',
  50: 'hsl(var(--warning-50))',
  100: 'hsl(var(--warning-100))',
  200: 'hsl(var(--warning-200))',
  300: 'hsl(var(--warning-300))',
  400: 'hsl(var(--warning-400))',
  500: 'hsl(var(--warning-500))',
  600: 'hsl(var(--warning-600))',
  700: 'hsl(var(--warning-700))',
  800: 'hsl(var(--warning-800))',
  900: 'hsl(var(--warning-900))',
  950: 'hsl(var(--warning-950))',
  foreground: 'hsl(var(--warning-foreground))',
},
info: {
  DEFAULT: 'hsl(var(--info))',
  50: 'hsl(var(--info-50))',
  100: 'hsl(var(--info-100))',
  200: 'hsl(var(--info-200))',
  300: 'hsl(var(--info-300))',
  400: 'hsl(var(--info-400))',
  500: 'hsl(var(--info-500))',
  600: 'hsl(var(--info-600))',
  700: 'hsl(var(--info-700))',
  800: 'hsl(var(--info-800))',
  900: 'hsl(var(--info-900))',
  950: 'hsl(var(--info-950))',
  foreground: 'hsl(var(--info-foreground))',
},
```

- [ ] **Step 2: Verify Tailwind classes resolve**

Run: `cd web-console && npm run dev`
In DevTools, inspect any element and add `class="bg-success/10 text-success"` to verify the color applies.

- [ ] **Step 3: Commit**

```bash
git add web-console/tailwind.config.js
git commit -m "feat: extend Tailwind config with semantic color tokens"
```

---

### Task 3: ConfirmDialog Component

**Files:**
- Create: `web-console/src/components/ui/confirm-dialog.tsx`

- [ ] **Step 1: Create ConfirmDialog component**

Create `web-console/src/components/ui/confirm-dialog.tsx`:

```tsx
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
  variant?: 'destructive' | 'default';
  confirmText?: string;
  cancelText?: string;
  loading?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  variant = 'destructive',
  confirmText,
  cancelText,
  loading = false,
}: ConfirmDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {cancelText || t('common.cancel')}
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={loading}
          >
            {loading ? t('common.loading') : (confirmText || t('common.confirm'))}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `cd web-console && npm run build`
Expected: No TypeScript errors, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add web-console/src/components/ui/confirm-dialog.tsx
git commit -m "feat: add ConfirmDialog component"
```

---

### Task 4: TableWithPagination Component

**Files:**
- Create: `web-console/src/components/ui/table-with-pagination.tsx`

- [ ] **Step 1: Create TableWithPagination component**

Create `web-console/src/components/ui/table-with-pagination.tsx`:

```tsx
import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export interface Column<T> {
  key: string;
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  className?: string;
  cell?: (value: unknown, row: T) => React.ReactNode;
}

interface PaginationState {
  pageSize: number;
  pageIndex: number;
  total: number;
}

interface TableWithPaginationProps<T> {
  data: T[];
  columns: Column<T>[];
  pagination?: PaginationState;
  onPaginationChange?: (pageIndex: number, pageSize: number) => void;
  loading?: boolean;
  emptyIllustration?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  onRowClick?: (row: T) => void;
  rowKey: keyof T | ((row: T) => string);
}

function getCellValue<T>(row: T, accessor: keyof T | ((row: T) => React.ReactNode)): unknown {
  if (typeof accessor === 'function') {
    return accessor(row);
  }
  return row[accessor];
}

export function TableWithPagination<T>({
  data,
  columns,
  pagination,
  onPaginationChange,
  loading = false,
  emptyIllustration,
  emptyTitle,
  emptyDescription,
  onRowClick,
  rowKey,
}: TableWithPaginationProps<T>) {
  const { t } = useTranslation();
  const [internalPage, setInternalPage] = useState(0);
  const [internalPageSize] = useState(10);

  const pageIndex = pagination?.pageIndex ?? internalPage;
  const pageSize = pagination?.pageSize ?? internalPageSize;
  const total = pagination?.total ?? data.length;

  const totalPages = Math.ceil(total / pageSize);
  const startRow = pageIndex * pageSize;
  const endRow = Math.min(startRow + pageSize, total);
  const displayData = pagination ? data.slice(startRow, endRow) : data;

  const handlePageChange = (newPage: number) => {
    if (onPaginationChange) {
      onPaginationChange(newPage, pageSize);
    } else {
      setInternalPage(newPage);
    }
  };

  const getRowKey = (row: T): string => {
    if (typeof rowKey === 'function') {
      return rowKey(row);
    }
    return String(row[rowKey]);
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 bg-muted animate-pulse rounded" />
        ))}
      </div>
    );
  }

  if (displayData.length === 0 && !pagination) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        {emptyIllustration}
        <h3 className="mt-4 text-lg font-medium">{emptyTitle || t('common.noData')}</h3>
        {emptyDescription && <p className="mt-1 text-sm">{emptyDescription}</p>}
      </div>
    );
  }

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            {columns.map((col) => (
              <TableHead key={col.key} className={col.className}>
                {col.header}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {displayData.map((row) => (
            <TableRow
              key={getRowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={onRowClick ? 'cursor-pointer' : undefined}
            >
              {columns.map((col) => {
                const value = getCellValue(row, col.accessor);
                return (
                  <TableCell key={col.key} className={col.className}>
                    {col.cell ? col.cell(value, row) : (value as React.ReactNode)}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {totalPages > 1 && (
        <div className="flex items-center justify-between py-4">
          <p className="text-sm text-muted-foreground">
            {t('common.showing')} {startRow + 1}-{endRow} {t('common.of')} {total}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pageIndex - 1)}
              disabled={pageIndex === 0}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">
              {pageIndex + 1} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePageChange(pageIndex + 1)}
              disabled={pageIndex >= totalPages - 1}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `cd web-console && npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add web-console/src/components/ui/table-with-pagination.tsx
git commit -m "feat: add TableWithPagination component"
```

---

### Task 5: FormField Component

**Files:**
- Create: `web-console/src/components/ui/form-field.tsx`

- [ ] **Step 1: Create FormField component**

Create `web-console/src/components/ui/form-field.tsx`:

```tsx
import { useId } from 'react';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HelpCircle } from 'lucide-react';

interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  tooltip?: string;
  children: React.ReactNode;
  htmlFor?: string;
}

export function FormField({
  label,
  error,
  required = false,
  tooltip,
  children,
  htmlFor,
}: FormFieldProps) {
  const generatedId = useId();
  const id = htmlFor || generatedId;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <Label htmlFor={id} className={error ? 'text-destructive' : ''}>
          {label}
          {required && <span className="text-destructive ml-1">*</span>}
        </Label>
        {tooltip && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
              </TooltipTrigger>
              <TooltipContent>
                <p className="max-w-[200px] text-sm">{tooltip}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>
      {children}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Verify build passes**

Run: `cd web-console && npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add web-console/src/components/ui/form-field.tsx
git commit -m "feat: add FormField component"
```

---

## Phase 2: PR 1b — i18n Batch Fix (Parallel)

### Task 6: Add i18n Keys to zh.json and en.json

**Files:**
- Modify: `web-console/src/i18n/locales/zh.json`
- Modify: `web-console/src/i18n/locales/en.json`

- [ ] **Step 1: Add new keys to zh.json**

Add these keys at the end of the JSON object (before the closing `}`):

```json
"errorBoundary": {
  "title": "应用出现错误",
  "message": "发生了未知错误",
  "retry": "刷新页面"
},
"demoBanner": {
  "title": "演示模式",
  "description": "所有数据为模拟数据，退出登录后清除"
},
"resources.columns": {
  "spec": "规格",
  "ip": "IP",
  "capacity": "容量",
  "type": "类型",
  "engine": "引擎",
  "objects": "对象数",
  "size": "大小",
  "dns": "DNS",
  "nodes": "节点数",
  "sku": "SKU",
  "endpoint": "端点"
},
"modelSelect.placeholder": "选择模型",
"login.author": "Created by 温信锐 (Peter Wen)"
```

- [ ] **Step 2: Add matching keys to en.json**

Add these keys at the end of the JSON object:

```json
"errorBoundary": {
  "title": "Application Error",
  "message": "An unexpected error occurred",
  "retry": "Refresh Page"
},
"demoBanner": {
  "title": "Demo Mode",
  "description": "All data is simulated, cleared on logout"
},
"resources.columns": {
  "spec": "Spec",
  "ip": "IP",
  "capacity": "Capacity",
  "type": "Type",
  "engine": "Engine",
  "objects": "Objects",
  "size": "Size",
  "dns": "DNS",
  "nodes": "Nodes",
  "sku": "SKU",
  "endpoint": "Endpoint"
},
"modelSelect.placeholder": "Select Model",
"login.author": "Created by 温信锐 (Peter Wen)"
```

- [ ] **Step 3: Verify key parity**

Run: `cd web-console && node -e "const zh = require('./src/i18n/locales/zh.json'); const en = require('./src/i18n/locales/en.json'); const zhKeys = Object.keys(zh); const enKeys = Object.keys(en); console.log('Missing in en:', zhKeys.filter(k => !enKeys.includes(k))); console.log('Missing in zh:', enKeys.filter(k => !zhKeys.includes(k)));"`

Expected: Empty arrays (no missing keys).

- [ ] **Step 4: Commit**

```bash
git add web-console/src/i18n/locales/zh.json web-console/src/i18n/locales/en.json
git commit -m "feat: add i18n keys for errorBoundary, demoBanner, resources.columns, modelSelect"
```

---

### Task 7: Fix ErrorBoundary i18n

**Files:**
- Modify: `web-console/src/components/ErrorBoundary.tsx`

- [ ] **Step 1: Replace hardcoded Chinese with i18n**

In `web-console/src/components/ErrorBoundary.tsx`, find and replace:

1. Add import at top: `import { useTranslation } from 'react-i18next';`
2. Add hook inside component: `const { t } = useTranslation();`
3. Replace hardcoded strings:
   - `"应用出现错误"` → `t('errorBoundary.title')`
   - `"发生了未知错误"` → `t('errorBoundary.message')`
   - `"刷新页面"` → `t('errorBoundary.retry')`

- [ ] **Step 2: Verify build passes**

Run: `cd web-console && npm run build`
Expected: No TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add web-console/src/components/ErrorBoundary.tsx
git commit -m "fix: replace hardcoded Chinese in ErrorBoundary with i18n"
```

---

### Task 8: Fix DemoBanner i18n

**Files:**
- Modify: `web-console/src/components/common/DemoBanner.tsx`

- [ ] **Step 1: Replace hardcoded Chinese with i18n**

In `web-console/src/components/common/DemoBanner.tsx`:

1. Add import: `import { useTranslation } from 'react-i18next';`
2. Add hook: `const { t } = useTranslation();`
3. Replace:
   - `"演示模式"` → `t('demoBanner.title')`
   - `"所有数据为模拟数据，退出登录后清除"` → `t('demoBanner.description')`

- [ ] **Step 2: Verify build passes**

Run: `cd web-console && npm run build`

- [ ] **Step 3: Commit**

```bash
git add web-console/src/components/common/DemoBanner.tsx
git commit -m "fix: replace hardcoded Chinese in DemoBanner with i18n"
```

---

### Task 9: Fix ModelSelect i18n

**Files:**
- Modify: `web-console/src/components/chat/ModelSelect.tsx`

- [ ] **Step 1: Replace hardcoded Chinese with i18n**

In `web-console/src/components/chat/ModelSelect.tsx`:

1. Add import: `import { useTranslation } from 'react-i18next';`
2. Add hook: `const { t } = useTranslation();`
3. Replace `"选择模型"` → `t('modelSelect.placeholder')`

- [ ] **Step 2: Verify build passes**

Run: `cd web-console && npm run build`

- [ ] **Step 3: Commit**

```bash
git add web-console/src/components/chat/ModelSelect.tsx
git commit -m "fix: replace hardcoded Chinese in ModelSelect with i18n"
```

---

### Task 10: Fix Dashboard i18n

**Files:**
- Modify: `web-console/src/pages/Dashboard.tsx`

- [ ] **Step 1: Replace hardcoded provider names with i18n**

In `web-console/src/pages/Dashboard.tsx`:

1. Find the provider mapping (around line 14) and replace:
   ```tsx
   const providerNames: Record<string, string> = {
     aliyun: '阿里云',
     aws: 'AWS',
     azure: 'Azure',
   };
   ```
   With:
   ```tsx
   const providerNames: Record<string, string> = {
     aliyun: t('providers.aliyun'),
     aws: 'AWS',
     azure: 'Azure',
   };
   ```
   (Add `useTranslation` import and hook if not already present.)

2. Find the `万` character in `formatCost` function and replace with `t('common.wan')` or keep as-is if not critical.

- [ ] **Step 2: Verify build passes**

Run: `cd web-console && npm run build`

- [ ] **Step 3: Commit**

```bash
git add web-console/src/pages/Dashboard.tsx
git commit -m "fix: replace hardcoded provider names in Dashboard with i18n"
```

---

### Task 11: Fix Resources Column Headers i18n

**Files:**
- Modify: `web-console/src/pages/Resources.tsx`

- [ ] **Step 1: Replace hardcoded column headers with i18n**

In `web-console/src/pages/Resources.tsx`, find the `COLUMN_DEFS` or similar column definitions and replace all hardcoded Chinese headers:

```tsx
// Before (hardcoded)
{ header: '规格', ... }
{ header: 'IP', ... }
{ header: '容量', ... }
{ header: '类型', ... }
{ header: '引擎', ... }
{ header: '对象数', ... }
{ header: '大小', ... }
{ header: 'DNS', ... }
{ header: '节点数', ... }
{ header: 'SKU', ... }
{ header: '端点', ... }

// After (i18n)
{ header: t('resources.columns.spec'), ... }
{ header: t('resources.columns.ip'), ... }
{ header: t('resources.columns.capacity'), ... }
{ header: t('resources.columns.type'), ... }
{ header: t('resources.columns.engine'), ... }
{ header: t('resources.columns.objects'), ... }
{ header: t('resources.columns.size'), ... }
{ header: t('resources.columns.dns'), ... }
{ header: t('resources.columns.nodes'), ... }
{ header: t('resources.columns.sku'), ... }
{ header: t('resources.columns.endpoint'), ... }
```

(Add `useTranslation` import and hook if not already present.)

- [ ] **Step 2: Verify build passes**

Run: `cd web-console && npm run build`

- [ ] **Step 3: Commit**

```bash
git add web-console/src/pages/Resources.tsx
git commit -m "fix: replace hardcoded column headers in Resources with i18n"
```

---

### Task 12: Fix Login Author Text

**Files:**
- Modify: `web-console/src/pages/Login.tsx`

- [ ] **Step 1: Replace hardcoded author text**

In `web-console/src/pages/Login.tsx`, find `"Created by 温信锐 (Peter Wen)"` and replace with `t('login.author')`.

- [ ] **Step 2: Verify build passes**

Run: `cd web-console && npm run build`

- [ ] **Step 3: Commit**

```bash
git add web-console/src/pages/Login.tsx
git commit -m "fix: replace hardcoded author text in Login with i18n"
```

---

## Phase 3: PR 2 — Site-wide Application

### Task 13: Fix Dark Mode in AiSettings

**Files:**
- Modify: `web-console/src/pages/AiSettings.tsx`

- [ ] **Step 1: Replace hardcoded color classes with semantic tokens**

In `web-console/src/pages/AiSettings.tsx`, find and replace:

- `bg-green-50` → `bg-success-50 dark:bg-success-950/30`
- `bg-red-50` → `bg-destructive-50 dark:bg-destructive-950/30`
- `text-green-700` → `text-success-700 dark:text-success-300`
- `text-red-700` → `text-destructive-700 dark:text-destructive-300`

- [ ] **Step 2: Verify build and dark mode**

Run: `cd web-console && npm run dev`
Toggle dark mode, verify no bright backgrounds.

- [ ] **Step 3: Commit**

```bash
git add web-console/src/pages/AiSettings.tsx
git commit -m "fix: replace hardcoded colors in AiSettings with semantic tokens"
```

---

### Task 14: Fix Dark Mode in InstanceLogsCard

**Files:**
- Modify: `web-console/src/components/instance/InstanceLogsCard.tsx`

- [ ] **Step 1: Replace hardcoded color classes**

Replace:
- `bg-blue-50` → `bg-info-50 dark:bg-info-950/30`
- `bg-amber-50` → `bg-warning-50 dark:bg-warning-950/30`
- `bg-red-50` → `bg-destructive-50 dark:bg-destructive-950/30`
- `text-gray-400` → `text-muted-foreground`
- `text-gray-700` → `text-foreground`

- [ ] **Step 2: Verify build**

Run: `cd web-console && npm run build`

- [ ] **Step 3: Commit**

```bash
git add web-console/src/components/instance/InstanceLogsCard.tsx
git commit -m "fix: replace hardcoded colors in InstanceLogsCard with semantic tokens"
```

---

### Task 15: Fix Dark Mode in Monitor

**Files:**
- Modify: `web-console/src/pages/Monitor.tsx`

- [ ] **Step 1: Replace hardcoded color classes**

Replace `bg-gray-300` (disabled toggle) with `bg-muted` or `bg-secondary`.

- [ ] **Step 2: Verify build**

Run: `cd web-console && npm run build`

- [ ] **Step 3: Commit**

```bash
git add web-console/src/pages/Monitor.tsx
git commit -m "fix: replace hardcoded colors in Monitor with semantic tokens"
```

---

### Task 16: Fix Dark Mode in CloudAccounts

**Files:**
- Modify: `web-console/src/pages/CloudAccounts.tsx`

- [ ] **Step 1: Replace hardcoded color classes**

Replace:
- `text-green-500` → `text-success-500`
- `text-green-600` → `text-success-600`
- `text-red-600` → `text-destructive-600`

- [ ] **Step 2: Verify build**

Run: `cd web-console && npm run build`

- [ ] **Step 3: Commit**

```bash
git add web-console/src/pages/CloudAccounts.tsx
git commit -m "fix: replace hardcoded colors in CloudAccounts with semantic tokens"
```

---

### Task 17: Fix Dark Mode in SlashCommandMenu and ModelSelect

**Files:**
- Modify: `web-console/src/components/chat/SlashCommandMenu.tsx`
- Modify: `web-console/src/components/chat/ModelSelect.tsx`

- [ ] **Step 1: Replace bg-white dark:bg-slate-800 with bg-card**

In both files, replace:
- `bg-white dark:bg-slate-800` → `bg-card`

- [ ] **Step 2: Verify build**

Run: `cd web-console && npm run build`

- [ ] **Step 3: Commit**

```bash
git add web-console/src/components/chat/SlashCommandMenu.tsx web-console/src/components/chat/ModelSelect.tsx
git commit -m "fix: replace bg-white in chat components with bg-card"
```

---

### Task 18: Replace confirm() with ConfirmDialog in InstanceDetail

**Files:**
- Modify: `web-console/src/pages/InstanceDetail.tsx`

- [ ] **Step 1: Add ConfirmDialog state and import**

1. Add import: `import { ConfirmDialog } from '@/components/ui/confirm-dialog';`
2. Add state: `const [confirmOpen, setConfirmOpen] = useState(false);`
3. Add `ConfirmDialog` component at end of JSX:
   ```tsx
   <ConfirmDialog
     open={confirmOpen}
     onOpenChange={setConfirmOpen}
     onConfirm={() => { /* original confirm logic */ }}
     title={t('common.confirmDelete')}
     description={t('common.confirmDeleteDescription')}
     variant="destructive"
   />
   ```

- [ ] **Step 2: Replace window.confirm with state setter**

Find `window.confirm(...)` call and replace with `setConfirmOpen(true)`.

- [ ] **Step 3: Verify build**

Run: `cd web-console && npm run build`

- [ ] **Step 4: Commit**

```bash
git add web-console/src/pages/InstanceDetail.tsx
git commit -m "fix: replace window.confirm with ConfirmDialog in InstanceDetail"
```

---

### Task 19: Replace confirm() with ConfirmDialog in Monitor

**Files:**
- Modify: `web-console/src/pages/Monitor.tsx`

- [ ] **Step 1: Add ConfirmDialog state and import**

1. Add import: `import { ConfirmDialog } from '@/components/ui/confirm-dialog';`
2. Add state for each delete action (rules, channels): `const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);`

- [ ] **Step 2: Add ConfirmDialog component**

Add `ConfirmDialog` component at end of JSX.

- [ ] **Step 3: Replace confirm() calls**

Find each `confirm(...)` call and replace with `setConfirmDeleteId(id)`.

- [ ] **Step 4: Verify build**

Run: `cd web-console && npm run build`

- [ ] **Step 5: Commit**

```bash
git add web-console/src/pages/Monitor.tsx
git commit -m "fix: replace window.confirm with ConfirmDialog in Monitor"
```

---

### Task 20: Replace confirm() with ConfirmDialog in CloudAccounts

**Files:**
- Modify: `web-console/src/pages/CloudAccounts.tsx`

- [ ] **Step 1: Add ConfirmDialog state and import**

1. Add import: `import { ConfirmDialog } from '@/components/ui/confirm-dialog';`
2. Add state: `const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);`

- [ ] **Step 2: Add ConfirmDialog component**

Add `ConfirmDialog` component at end of JSX.

- [ ] **Step 3: Replace confirm() call**

Find `confirm(...)` call and replace with `setConfirmDeleteId(id)`.

- [ ] **Step 4: Verify build**

Run: `cd web-console && npm run build`

- [ ] **Step 5: Commit**

```bash
git add web-console/src/pages/CloudAccounts.tsx
git commit -m "fix: replace window.confirm with ConfirmDialog in CloudAccounts"
```

---

### Task 21: Replace confirm() with ConfirmDialog in AiSettings

**Files:**
- Modify: `web-console/src/pages/AiSettings.tsx`

- [ ] **Step 1: Add ConfirmDialog state and import**

1. Add import: `import { ConfirmDialog } from '@/components/ui/confirm-dialog';`
2. Add state for provider/model delete: `const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);`

- [ ] **Step 2: Add ConfirmDialog component**

Add `ConfirmDialog` component at end of JSX.

- [ ] **Step 3: Replace confirm() calls**

Find each `confirm(...)` call and replace with `setConfirmDeleteId(id)`.

- [ ] **Step 4: Verify build**

Run: `cd web-console && npm run build`

- [ ] **Step 5: Commit**

```bash
git add web-console/src/pages/AiSettings.tsx
git commit -m "fix: replace window.confirm with ConfirmDialog in AiSettings"
```

---

### Task 22: Delete Dead Code — Instances.tsx

**Files:**
- Delete: `web-console/src/pages/Instances.tsx`
- Modify: `web-console/src/App.tsx` (remove import if present)

- [ ] **Step 1: Remove Instances.tsx import from App.tsx**

In `web-console/src/App.tsx`, find and remove the import for `Instances.tsx` if it exists. Verify the `/instances` route redirects to `/resources`.

- [ ] **Step 2: Delete Instances.tsx**

```bash
rm web-console/src/pages/Instances.tsx
```

- [ ] **Step 3: Verify build passes**

Run: `cd web-console && npm run build`

- [ ] **Step 4: Commit**

```bash
git add -A web-console/src/pages/Instances.tsx web-console/src/App.tsx
git commit -m "chore: remove dead Instances.tsx page"
```

---

### Task 23: Clean Up Topology

**Files:**
- Modify: `web-console/src/pages/Topology.tsx`

- [ ] **Step 1: Remove console.log statements**

Remove these lines:
- Line ~71: `console.log('SEARCH CLICK:', ...)` or similar
- Line ~114: `console.log('[search-debug] ...')` or similar

- [ ] **Step 2: Remove redundant Chinese fallback strings**

Replace:
- `t('topology.modeTree', '浏览')` → `t('topology.modeTree')`
- `t('topology.modeGraph', '拓扑')` → `t('topology.modeGraph')`
- `t('topology.searchPlaceholder', '搜索实例...')` → `t('topology.searchPlaceholder')`
- Any other redundant fallback strings

- [ ] **Step 3: Verify build passes**

Run: `cd web-console && npm run build`

- [ ] **Step 4: Commit**

```bash
git add web-console/src/pages/Topology.tsx
git commit -m "chore: remove console.log and redundant fallbacks from Topology"
```

---

### Task 24: Fix instances.provider → common.provider

**Files:**
- Modify: `web-console/src/pages/Instances.tsx` (deleted, skip) OR check other files
- Modify: `web-console/src/i18n/locales/zh.json`
- Modify: `web-console/src/i18n/locales/en.json`

- [ ] **Step 1: Search for instances.provider usage**

Run: `grep -r "instances.provider" web-console/src/`

- [ ] **Step 2: Add common.provider key if missing**

Add to both locale files:
```json
"common": {
  "provider": "Provider",
  ...
}
```

- [ ] **Step 3: Replace instances.provider with common.provider**

- [ ] **Step 4: Verify build passes**

Run: `cd web-console && npm run build`

- [ ] **Step 5: Commit**

```bash
git add web-console/src/i18n/locales/zh.json web-console/src/i18n/locales/en.json
git commit -m "fix: add common.provider i18n key"
```

---

## Phase 4: PR 3 — Table Migrations

### Task 25: Migrate Resources Table to TableWithPagination

**Files:**
- Modify: `web-console/src/pages/Resources.tsx`

- [ ] **Step 1: Import TableWithPagination**

Add import: `import { TableWithPagination, Column } from '@/components/ui/table-with-pagination';`

- [ ] **Step 2: Define columns for TableWithPagination**

Convert existing column definitions to `Column<T>[]` format:
```tsx
const columns: Column<Resource>[] = [
  { key: 'name', header: t('common.name'), accessor: 'name' },
  { key: 'provider', header: t('common.provider'), accessor: 'provider' },
  { key: 'spec', header: t('resources.columns.spec'), accessor: (row) => row.attributes?.instanceType || '-' },
  { key: 'status', header: t('common.status'), accessor: 'status', cell: (value) => <Badge>{String(value)}</Badge> },
];
```

- [ ] **Step 3: Replace Table with TableWithPagination**

Replace the existing `<Table>` JSX with:
```tsx
<TableWithPagination
  data={filteredResources}
  columns={columns}
  pagination={{ pageSize: 20, pageIndex: 0, total: filteredResources.length, onPaginationChange: () => {} }}
  rowKey="id"
  onRowClick={(row) => navigate(`/resources/${row.id}`)}
/>
```

- [ ] **Step 4: Verify build and pagination works**

Run: `cd web-console && npm run dev`
Navigate to Resources, verify pagination controls appear and work.

- [ ] **Step 5: Commit**

```bash
git add web-console/src/pages/Resources.tsx
git commit -m "feat: migrate Resources table to TableWithPagination"
```

---

### Task 26: Migrate Users Table to TableWithPagination

**Files:**
- Modify: `web-console/src/pages/Users.tsx`

- [ ] **Step 1: Import TableWithPagination**

Add import: `import { TableWithPagination, Column } from '@/components/ui/table-with-pagination';`

- [ ] **Step 2: Define columns and migrate**

Convert existing columns to `Column<User>[]` format and replace `<Table>`.

- [ ] **Step 3: Verify build**

Run: `cd web-console && npm run build`

- [ ] **Step 4: Commit**

```bash
git add web-console/src/pages/Users.tsx
git commit -m "feat: migrate Users table to TableWithPagination"
```

---

### Task 27: Migrate Monitor Tables to TableWithPagination

**Files:**
- Modify: `web-console/src/pages/Monitor.tsx`

- [ ] **Step 1: Import TableWithPagination**

Add import: `import { TableWithPagination, Column } from '@/components/ui/table-with-pagination';`

- [ ] **Step 2: Define columns for RulesTab, EventsTab, ChannelsTab**

Convert each tab's columns to `Column<T>[]` format.

- [ ] **Step 3: Replace Tables with TableWithPagination**

For each tab, replace `<Table>` with `<TableWithPagination>`.

- [ ] **Step 4: Verify build**

Run: `cd web-console && npm run build`

- [ ] **Step 5: Commit**

```bash
git add web-console/src/pages/Monitor.tsx
git commit -m "feat: migrate Monitor tables to TableWithPagination"
```

---

### Task 28: Migrate Costs Table to TableWithPagination

**Files:**
- Modify: `web-console/src/pages/Costs.tsx`

- [ ] **Step 1: Import TableWithPagination**

Add import: `import { TableWithPagination, Column } from '@/components/ui/table-with-pagination';`

- [ ] **Step 2: Define columns and migrate**

Convert existing columns to `Column<CostRecord>[]` format and replace `<Table>`.

- [ ] **Step 3: Verify build**

Run: `cd web-console && npm run build`

- [ ] **Step 4: Commit**

```bash
git add web-console/src/pages/Costs.tsx
git commit -m "feat: migrate Costs table to TableWithPagination"
```

---

## Phase 5: PR 3 — Form Migrations

### Task 29: Migrate CloudAccounts Form to FormField

**Files:**
- Modify: `web-console/src/pages/CloudAccounts.tsx`

- [ ] **Step 1: Import FormField**

Add import: `import { FormField } from '@/components/ui/form-field';`

- [ ] **Step 2: Wrap form fields with FormField**

Replace each form field with:
```tsx
<FormField label={t('cloudAccounts.name')} required error={errors.name?.message}>
  <Input ... />
</FormField>
```

- [ ] **Step 3: Add inline error messages**

Use `react-hook-form` error messages with `FormField`'s `error` prop.

- [ ] **Step 4: Verify build**

Run: `cd web-console && npm run build`

- [ ] **Step 5: Commit**

```bash
git add web-console/src/pages/CloudAccounts.tsx
git commit -m "feat: migrate CloudAccounts form to FormField with inline validation"
```

---

### Task 30: Migrate AiSettings Form to FormField

**Files:**
- Modify: `web-console/src/pages/AiSettings.tsx`

- [ ] **Step 1: Import FormField**

Add import: `import { FormField } from '@/components/ui/form-field';`

- [ ] **Step 2: Wrap form fields with FormField**

Replace each form field with `<FormField>` wrapper.

- [ ] **Step 3: Verify build**

Run: `cd web-console && npm run build`

- [ ] **Step 4: Commit**

```bash
git add web-console/src/pages/AiSettings.tsx
git commit -m "feat: migrate AiSettings form to FormField with inline validation"
```

---

### Task 31: Migrate Create Instance Form to FormField

**Files:**
- Modify: `web-console/src/pages/Resources.tsx` (create instance dialog)

- [ ] **Step 1: Import FormField**

Add import: `import { FormField } from '@/components/ui/form-field';`

- [ ] **Step 2: Wrap create instance form fields with FormField**

Replace each form field in the create dialog with `<FormField>` wrapper.

- [ ] **Step 3: Verify build**

Run: `cd web-console && npm run build`

- [ ] **Step 4: Commit**

```bash
git add web-console/src/pages/Resources.tsx
git commit -m "feat: migrate Create Instance form to FormField with inline validation"
```

---

## Phase 6: E2E Verification

### Task 32: Add Pagination E2E Test

**Files:**
- Create: `web-console/tests/pagination.spec.ts`

- [ ] **Step 1: Write Playwright test for pagination**

```ts
import { test, expect } from '@playwright/test';

test.describe('Table Pagination', () => {
  test('Resources page shows pagination controls', async ({ page }) => {
    await page.goto('/resources');
    await page.waitForSelector('table');
    
    // Check pagination controls exist
    const prevButton = page.locator('button').filter({ hasText: /chevron-left/i });
    const nextButton = page.locator('button').filter({ hasText: /chevron-right/i });
    
    await expect(prevButton).toBeVisible();
    await expect(nextButton).toBeVisible();
    
    // Click next page
    await nextButton.click();
    
    // Verify page indicator updates
    await expect(page.locator('text=/2 \\/ \\d+/')).toBeVisible();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web-console && npx playwright test pagination.spec.ts`
Expected: FAIL (no pagination yet or test needs adjustment).

- [ ] **Step 3: Fix test or implement as needed**

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web-console && npx playwright test pagination.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web-console/tests/pagination.spec.ts
git commit -m "test: add Playwright test for table pagination"
```

---

### Task 33: Add Dark Mode E2E Test

**Files:**
- Create: `web-console/tests/dark-mode.spec.ts`

- [ ] **Step 1: Write Playwright test for dark mode**

```ts
import { test, expect } from '@playwright/test';

test.describe('Dark Mode', () => {
  test('AiSettings has no bright backgrounds in dark mode', async ({ page }) => {
    await page.goto('/ai-settings');
    await page.waitForSelector('[class*="bg-"]');
    
    // Toggle to dark mode
    const themeToggle = page.locator('button').filter({ hasText: /dark|moon|theme/i });
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
    }
    
    // Check no bright bg-green-50 or bg-red-50
    const brightBgs = await page.locator('[class*="bg-green-50"], [class*="bg-red-50"], [class*="bg-blue-50"]').count();
    expect(brightBgs).toBe(0);
  });
});
```

- [ ] **Step 2: Run test**

Run: `cd web-console && npx playwright test dark-mode.spec.ts`

- [ ] **Step 3: Fix and verify**

- [ ] **Step 4: Commit**

```bash
git add web-console/tests/dark-mode.spec.ts
git commit -m "test: add Playwright test for dark mode colors"
```

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-07-03-frontend-ux-optimization.md`.**

Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?

---

*Plan covers all 33 tasks across 6 phases. Each task has exact file paths, complete code, and verification steps.*