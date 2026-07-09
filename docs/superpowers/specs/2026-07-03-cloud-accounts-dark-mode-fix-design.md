# Design: Fix Dark Mode in CloudAccounts

## Context
Task 16 of frontend UX optimization project. CloudAccounts page has hardcoded color classes that don't work properly in dark mode.

## Changes Required

### File: `web-console/src/pages/CloudAccounts.tsx`

1. **Line 278**: Replace `text-green-500` with `text-success-500`
   - Used for active status checkmark icon
   - Semantic token supports dark mode via CSS variables

2. **Line 297**: Replace `text-green-600` with `text-success-600`
   - Used for test connection success message
   - Semantic token supports dark mode via CSS variables

3. **Line 297**: Replace `text-red-600` with `text-destructive-600`
   - Used for test connection failure message
   - Semantic token supports dark mode via CSS variables

## Verification
- Run `cd web-console && npm run build` to ensure no build errors
- Visual verification in both light and dark modes

## Risk Assessment
- Low risk: Only color class replacements
- Semantic tokens already defined in tailwind.config.js
- No functional changes to component logic