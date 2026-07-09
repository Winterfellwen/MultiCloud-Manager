# CloudAccounts FormField Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the CloudAccounts form dialog to use the `FormField` component for consistent label/error display.

**Architecture:** Replace manual `<Label>` + `<Input>` + error `<p>` patterns with `<FormField>` wrapper that handles label, required indicator, and error messages in a unified component.

**Tech Stack:** React, TypeScript, Tailwind CSS, FormField component, react-i18next

---

## Current State

The CloudAccounts form (`web-console/src/pages/CloudAccounts.tsx`) has:
- Account name field (lines 367-375): Uses `<Label>` + `<Input>` manually
- Cloud provider selector (lines 378-401): Uses `<Label>` + grid of buttons
- Credential fields (lines 404-461): Dynamic fields from backend metadata with `<Label>` + `<Input>`/`<textarea>`
- Error display (lines 465-467): Separate `<p>` tag for form-level errors

The `FormField` component (`web-console/src/components/ui/form-field.tsx`) accepts:
- `label`: Required string
- `error?`: Optional error message string
- `required?`: Boolean for required indicator
- `tooltip?`: Optional tooltip text
- `children`: Input element
- `htmlFor?`: Optional ID for label-input association

---

## File Structure

| File | Action | Purpose |
|------|--------|---------|
| `web-console/src/pages/CloudAccounts.tsx` | Modify | Add FormField import, wrap form fields, add inline errors |

---

### Task 1: Import FormField and wrap form fields

**Files:**
- Modify: `web-console/src/pages/CloudAccounts.tsx:1-20`

- [ ] **Step 1: Add FormField import**

Add import after the existing Label import at line 11:

```tsx
import { FormField } from '@/components/ui/form-field';
```

- [ ] **Step 2: Wrap account name field with FormField**

Replace lines 367-375 (account name field) with:

```tsx
<FormField
  label={t('cloudAccounts.accountName')}
  htmlFor="account-name"
  error={error && !form.name.trim() ? t('cloudAccounts.nameRequired') : undefined}
>
  <Input
    id="account-name"
    value={form.name}
    onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
    placeholder={t('cloudAccounts.accountNamePlaceholder')}
  />
</FormField>
```

- [ ] **Step 3: Wrap cloud provider selector with FormField**

Replace lines 378-401 (cloud provider section) with:

```tsx
{!editingId && (
  <FormField label={t('cloudAccounts.providerLabel')}>
    <div className="grid grid-cols-3 gap-2">
      {providersMeta.map(p => (
        <button
          key={p.id}
          type="button"
          onClick={() => switchProvider(p.id)}
          className={cn(
            'rounded-md border px-3 py-2 text-sm transition-colors',
            form.provider === p.id
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-border hover:bg-accent'
          )}
        >
          {p.label}
        </button>
      ))}
    </div>
    {currentMeta?.description && (
      <p className="text-xs text-muted-foreground">{currentMeta.description}</p>
    )}
  </FormField>
)}
```

- [ ] **Step 4: Wrap credential fields with FormField**

Replace lines 434-461 (dynamic credential field rendering) with:

```tsx
{currentMeta.fields.map(field => (
  <FormField
    key={field.key}
    label={field.label}
    htmlFor={`cfg-${field.key}`}
    required={field.required && !editingId}
    error={field.required && !editingId && !form.config[field.key]?.trim()
      ? t('cloudAccounts.fieldRequired', { label: field.label })
      : undefined}
  >
    {field.type === 'textarea' ? (
      <textarea
        id={`cfg-${field.key}`}
        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        value={form.config[field.key] || ''}
        onChange={(e) => updateConfigField(field.key, e.target.value)}
        placeholder={field.placeholder}
      />
    ) : (
      <Input
        id={`cfg-${field.key}`}
        type={field.type === 'password' ? 'password' : 'text'}
        value={form.config[field.key] || ''}
        onChange={(e) => updateConfigField(field.key, e.target.value)}
        placeholder={editingId ? t('cloudAccounts.editPlaceholder') : field.placeholder}
      />
    )}
    {field.help && (
      <p className="text-[10px] text-muted-foreground">{field.help}</p>
    )}
  </FormField>
))}
```

- [ ] **Step 5: Remove standalone error display**

Remove lines 465-467 (the standalone error `<p>` tag):

```tsx
// Remove this block:
{error && (
  <p className="text-sm text-destructive">{error}</p>
)}
```

Note: The form-level error is now handled inline by each FormField's `error` prop.

- [ ] **Step 6: Verify build passes**

Run: `cd web-console && npm run build`
Expected: Build succeeds without errors

- [ ] **Step 7: Commit**

```bash
git add web-console/src/pages/CloudAccounts.tsx
git commit -m "feat: migrate CloudAccounts form to FormField with inline validation"
```

---

## Self-Review Checklist

1. **Import added:** FormField import present
2. **Account name wrapped:** Uses FormField with error prop
3. **Provider selector wrapped:** Uses FormField (no error needed - always valid)
4. **Credential fields wrapped:** Each uses FormField with dynamic required/error
5. **Standalone error removed:** No separate `<p>` for errors
6. **Build passes:** TypeScript compiles without errors
7. **Commit made:** Changes committed with descriptive message
