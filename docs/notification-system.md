# Notification System Design

## Overview

Multi-cloud notification system with categories, RBAC, WebSocket real-time delivery, and bell UI.

## Architecture

```
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  Monitor     │    │  Agent       │    │  WebSocket   │
│  Service     │───▶│  Service     │───▶│  Server      │
│  (alert)     │    │  (remediate) │    │  (ws)        │
└──────────────┘    └──────────────┘    └──────┬───────┘
       │                 │                     │
       ▼                 ▼                     ▼
┌─────────────────────────────────────────────────┐
│              PostgreSQL (notifications table)     │
└─────────────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│             Express Middleware                   │
│   POST /api/notifications (internal)            │
│   GET /api/notifications (FE)                   │
│   POST /api/notifications/read (FE)             │
│   POST /api/notifications/read-all (FE)         │
└─────────────────────────────────────────────────┘
```

## DB Schema

```sql
CREATE TABLE notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT NOT NULL CHECK (type IN (
    'chat.completed', 'approval.requested', 'remediation.pending',
    'insight.updated', 'alert.firing'
  )),
  category      TEXT NOT NULL CHECK (category IN ('ai','ops','alert','system')),
  title         TEXT NOT NULL,
  description   TEXT,
  link          TEXT,              -- frontend route hint
  metadata      JSONB DEFAULT '{}',
  created_by    UUID REFERENCES users(id),       -- system push source
  user_id       UUID REFERENCES users(id),       -- target user (NULL=all)
  role_required TEXT DEFAULT NULL,  -- NULL=any, 'admin'
  read_at       TIMESTAMPTZ,       -- NULL = unread
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications(user_id, created_at DESC);
CREATE INDEX idx_notifications_role ON notifications(role_required, created_at DESC);
CREATE INDEX idx_notifications_unread ON notifications(user_id, read_at, created_at DESC) WHERE read_at IS NULL;
```

## Notification Types & Categories

| Type | Category | Source | Description |
|------|----------|--------|-------------|
| `chat.completed` | ai | Agent Service | Chat session finished |
| `insight.updated` | ai | Monitor Service | New AI health insight |
| `approval.requested` | ops | Agent Service | Operation needs approval |
| `remediation.pending` | ops | Agent Service | Self-healing needs approval |
| `alert.firing` | alert | Monitor Service | Metric threshold breached |

## RBAC Rules

- `admin`: sees ALL notifications (regardless of `user_id`/`role_required`)
- `user`: sees only `user_id IS NULL OR user_id = current_user_id` AND `role_required IS NULL OR role_required = 'user'`

## Backend Push Flow (internal POST)

Internal endpoint `POST /api/notifications` (no auth, same-docker-network only):

```json
{
  "type": "chat.completed",
  "category": "ai",
  "title": "AI 对话已完成",
  "description": "对话「优化部署」已处理完毕",
  "link": "/chat",
  "user_id": null,
  "role_required": null,
  "metadata": {}
}
```

Response: `{ id, ...record }` + WebSocket broadcast if `user_id` is null broadcast to all, else to specific user.

## REST API (frontend-facing)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /api/notifications | JWT | List notifications (paginated, filtered by ?category=, ?unread=true) |
| POST | /api/notifications/:id/read | JWT | Mark one as read (owner check) |
| POST | /api/notifications/read-all | JWT | Mark all as read (respects RBAC) |
| GET | /api/notifications/unread-count | JWT | Get unread count |

## WebSocket Events

```typescript
// Server → Client
{ event: 'notification', data: Notification }          // new notification
{ event: 'notification.unread', data: number }          // unread count update
{ event: 'notification.read', data: { id: string } }    // single mark read
```

## Frontend Components

### Zustand Store (`useNotificationStore`)

```typescript
interface NotificationStore {
  items: Notification[];
  unreadCount: number;
  loading: boolean;
  fetchNotifications: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  addNotification: (n: Notification) => void;  // from WS
}
```

### Topbar Bell

- `Bell` icon (lucide-react), unread `Badge` overlay
- Click toggles dropdown panel

### Notification Dropdown

- Grouped by `category` with color indicator
- Click notification → navigate via `link` field
- "Mark all read" + "View all" actions
- Real-time insert via WebSocket `notification` event

### Full Notification Page (optional)

- `/notifications` route: full list, filter by category/read status, pagination

## Implementation Order

1. DB migration (008_notifications.sql)
2. Notification schema + table in schema-factory
3. Internal POST endpoint (push API)
4. WebSocket broadcast of notification events
5. Frontend REST API methods + hooks
6. Zustand store + Topbar Bell component
7. Notification dropdown panel
8. WebSocket integration for real-time notification events
9. Push sources (chat.ts done event → POST /api/notifications)
