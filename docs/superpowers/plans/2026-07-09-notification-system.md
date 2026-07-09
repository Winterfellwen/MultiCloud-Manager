# Notification System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete multi-cloud notification system with categories, RBAC, WebSocket real-time delivery, and bell UI.

**Architecture:** The notifications table lives in the shared schema factory (public + demo), with DDL migration in monitor-service. The internal POST endpoint lives in monitor-service (same as dashboard/ai-insight). Frontend uses Zustand store + Topbar bell + dropdown panel. WebSocket `notification` event pushes real-time from ai-agent chat completion handler to the backend internal API, then broadcasts via a shared event bus pattern (currently using the monitor-service route).

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL (Fastify), Zustand (frontend store), lucide-react (Bell icon), shadcn/ui (Badge, Tooltip), i18next (i18n), react-router-dom (routing), sonner (toast for chat completion notification)

---

## File Map

| File | Status | Responsibility |
|------|--------|----------------|
| `shared/src/db/schema-factory.ts` | Modify | Add `notifications` table definition inside `buildTables()` + export |
| `monitor-service/migrations/008_notifications.sql` | Create | DDL for `notifications` table |
| `shared/src/db/migrations/000_demo_schema.sql` | Modify | Add `demo.notifications LIKE public.notifications` |
| `monitor-service/src/routes/notifications.ts` | Create | Express-like (Fastify) routes: internal POST + FE-facing GET/mark-read |
| `monitor-service/src/index.ts` | Modify | Register notification routes |
| `web-console/src/api/notifications.ts` | Create | Frontend API methods |
| `web-console/src/types/notifications.ts` | Create | TypeScript interfaces for notification system |
| `web-console/src/stores/notifications.ts` | Create | Zustand store |
| `web-console/src/components/notifications/NotificationBell.tsx` | Create | Bell icon + unread badge component |
| `web-console/src/components/notifications/NotificationDropdown.tsx` | Create | Dropdown panel component |
| `web-console/src/components/Topbar.tsx` | Modify | Insert NotificationBell |
| `web-console/src/pages/Notifications.tsx` | Create | Full notification list page |
| `web-console/src/App.tsx` | Modify | Add `/notifications` route |
| `web-console/src/lib/ws-client.ts` | Modify | No changes needed — generic `onEvent` already route by `event` name |
| `web-console/src/stores/chat.ts` | Modify | Add notification push on `done` event |
| `web-console/src/i18n/locales/en.json` | Modify | Add `notifications.*` i18n keys |
| `web-console/src/i18n/locales/zh.json` | Modify | Add `notifications.*` i18n keys |
| `web-console/src/sidebar/navigation.ts` | Modify (if exists) | Or relevant navigation config file to add sidebar link |

---

### Task 1: DB Schema — `notifications` table in factory + migration

**Files:**
- Modify: `shared/src/db/schema-factory.ts` (add table before return statement)
- Create: `monitor-service/migrations/008_notifications.sql`
- Modify: `shared/src/db/migrations/000_demo_schema.sql` (add demo mirror)

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="edit">
<｜｜DSML｜｜parameter name="filePath" string="true">/Users/xinruiwen/AI-Wen/MultiCloud-Manager/shared/src/db/schema-factory.ts