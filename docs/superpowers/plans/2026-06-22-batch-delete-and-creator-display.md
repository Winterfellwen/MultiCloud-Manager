# Batch Delete and Creator Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add batch delete for conversations, display creator info in session list, implement role-based view/edit permissions (admin sees all, regular users see own+team).

**Architecture:** Extend `acp_replay_sessions` table with `user_id`, `username`, `title` fields. Add `sessions.list` and `sessions.deleteBatch` RPC methods. Rework frontend SessionList with edit mode, batch selection, and creator display. Add `team` field to users table.

**Tech Stack:** PostgreSQL (Drizzle ORM), WebSocket RPC (ai-gateway), React + Zustand (web-console)

---

## File Structure

### Backend (ai-gateway)
- `ai-gateway/migrations/002_session_user_fields.sql` — New migration for session user fields + team
- `ai-gateway/src/acp/event-ledger.ts` — Add `listSessions()`, `deleteBatchSessions()`, update `recordEvent()` to accept user info
- `ai-gateway/src/methods/sessions.ts` — Add `handleSessionsList`, `handleSessionsDeleteBatch`
- `ai-gateway/src/index.ts` — Register new RPC methods

### Frontend (web-console)
- `web-console/src/types/chat.ts` — Add `ChatSession` fields (`userId`, `username`), add RPC param/response types
- `web-console/src/stores/chat.ts` — Add `fetchSessions()`, `deleteSessions()`, remove localStorage session persistence
- `web-console/src/components/chat/SessionList.tsx` — Add edit mode, batch selection, creator display
- `web-console/src/pages/ChatReact.tsx` — Conditionally hide ChatInput for non-own sessions

### Auth Service
- `auth-service/migrations/002_add_team.sql` — Add `team` column to users table
- `auth-service/src/db/schema.ts` — Add `team` field to users schema

---

## Task 1: Database Migration — Session User Fields

**Files:**
- Create: `ai-gateway/migrations/002_session_user_fields.sql`

- [ ] **Step 1: Create migration SQL**

```sql
-- Add user ownership fields to acp_replay_sessions
ALTER TABLE acp_replay_sessions ADD COLUMN IF NOT EXISTS user_id TEXT NOT NULL DEFAULT '';
ALTER TABLE acp_replay_sessions ADD COLUMN IF NOT EXISTS username TEXT NOT NULL DEFAULT '';
ALTER TABLE acp_replay_sessions ADD COLUMN IF NOT EXISTS title TEXT DEFAULT '';

-- Index for user-based queries
CREATE INDEX IF NOT EXISTS idx_acp_sessions_user ON acp_replay_sessions(user_id);

-- Backfill existing sessions from session_key format: chat:{userId}:{ts}:{rand}
UPDATE acp_replay_sessions
SET user_id = SPLIT_PART(session_key, ':', 2)
WHERE session_key LIKE 'chat:%:%:%'
  AND user_id = '';

-- Backfill title from first user_message event
UPDATE acp_replay_sessions s
SET title = LEFT(
  (SELECT payload->>'message'
   FROM acp_replay_events e
   WHERE e.session_key = s.session_key
     AND e.event_type = 'user_message'
   ORDER BY e.seq ASC LIMIT 1),
  50
)
WHERE s.title IS NULL OR s.title = ''
  AND EXISTS (
    SELECT 1 FROM acp_replay_events e
    WHERE e.session_key = s.session_key AND e.event_type = 'user_message'
  );

-- Set default title for sessions without user messages
UPDATE acp_replay_sessions
SET title = '新对话'
WHERE title IS NULL OR title = '';
```

- [ ] **Step 2: Run migration in Docker**

```bash
docker cp ai-gateway/migrations/002_session_user_fields.sql newcloud-postgres-1:/tmp/
docker exec newcloud-postgres-1 psql -U cloudops -d cloudops -f /tmp/002_session_user_fields.sql
```

Expected: Commands complete without errors.

- [ ] **Step 3: Commit**

```bash
git add ai-gateway/migrations/002_session_user_fields.sql
git commit -m "feat: add user_id, username, title columns to acp_replay_sessions"
```

---

## Task 2: Database Migration — Users Team Field

**Files:**
- Create: `auth-service/migrations/002_add_team.sql`
- Modify: `auth-service/src/db/schema.ts`

- [ ] **Step 1: Create migration SQL**

```sql
-- Add team column to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS team VARCHAR(64) DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_users_team ON users(team);
```

- [ ] **Step 2: Run migration in Docker**

```bash
docker cp auth-service/migrations/002_add_team.sql newcloud-postgres-1:/tmp/
docker exec newcloud-postgres-1 psql -U cloudops -d cloudops -f /tmp/002_add_team.sql
```

- [ ] **Step 3: Update Drizzle schema**

In `auth-service/src/db/schema.ts`, add `team` field to users table:

```typescript
import { pgTable, uuid, varchar, text, timestamp, jsonb, inet, boolean, index } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 64 }).unique().notNull(),
  email: varchar('email', { length: 256 }),
  passwordHash: text('password_hash').notNull(),
  role: varchar('role', { length: 32 }).notNull().default('viewer'),
  team: varchar('team', { length: 64 }).notNull().default(''),  // NEW
  apiKey: varchar('api_key', { length: 128 }).unique(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  lastLoginAt: timestamp('last_login_at'),
});
```

- [ ] **Step 4: Commit**

```bash
git add auth-service/migrations/002_add_team.sql auth-service/src/db/schema.ts
git commit -m "feat: add team field to users table"
```

---

## Task 3: Backend — Event Ledger Query Functions

**Files:**
- Modify: `ai-gateway/src/acp/event-ledger.ts`

- [ ] **Step 1: Add `SessionListItem` interface and `listSessions` function**

Add after the existing `clearSessionEvents` function:

```typescript
export interface SessionListItem {
  sessionKey: string;
  title: string;
  username: string;
  userId: string;
  messageCount: number;
  lastMessageAt: number;
  createdAt: number;
}

interface SessionRow {
  session_key: string;
  title: string | null;
  username: string;
  user_id: string;
  created_at: string;
}

interface CountRow {
  session_key: string;
  count: string;
}

interface LastTsRow {
  session_key: string;
  max_ts: string | null;
}

/**
 * 列出用户可见的会话
 * @param viewerId 当前用户 ID
 * @param viewerRole 当前用户角色
 * @param viewerTeam 当前用户 team
 * @param filter 'mine' | 'team' | 'all'
 */
export async function listSessions(
  viewerId: string,
  viewerRole: string,
  viewerTeam: string,
  filter: 'mine' | 'team' | 'all' = 'mine'
): Promise<SessionListItem[]> {
  let whereClause;

  if (filter === 'all' && viewerRole === 'admin') {
    // admin 看所有
    whereClause = sql`WHERE 1=1`;
  } else if (filter === 'team' && viewerTeam) {
    // 同 team 用户的会话（排除未分组用户）
    whereClause = sql`WHERE s.user_id IN (
      SELECT id::text FROM users WHERE team = ${viewerTeam} AND team != ''
    )`;
  } else {
    // 默认：只看自己的
    whereClause = sql`WHERE s.user_id = ${viewerId}`;
  }

  // 查询会话基础信息
  const sessionRows = await db.execute(sql`
    SELECT s.session_key, s.title, s.username, s.user_id, s.created_at
    FROM acp_replay_sessions s
    ${whereClause}
    ORDER BY s.created_at DESC
  `) as unknown as SessionRow[];

  if (sessionRows.length === 0) return [];

  const sessionKeys = sessionRows.map(r => r.session_key);

  // 批量查询消息数量
  const countRows = await db.execute(sql`
    SELECT session_key, COUNT(*) as count
    FROM acp_replay_events
    WHERE session_key = ANY(${sessionKeys})
      AND event_type = 'user_message'
    GROUP BY session_key
  `) as unknown as CountRow[];

  const countMap = new Map(countRows.map(r => [r.session_key, Number(r.count)]));

  // 批量查询最后消息时间
  const lastTsRows = await db.execute(sql`
    SELECT session_key, MAX(timestamp) as max_ts
    FROM acp_replay_events
    WHERE session_key = ANY(${sessionKeys})
    GROUP BY session_key
  `) as unknown as LastTsRow[];

  const lastTsMap = new Map(lastTsRows.map(r => [r.session_key, Number(r.max_ts) || 0]));

  return sessionRows.map(row => ({
    sessionKey: row.session_key,
    title: row.title || '新对话',
    username: row.username || 'unknown',
    userId: row.user_id,
    messageCount: countMap.get(row.session_key) || 0,
    lastMessageAt: lastTsMap.get(row.session_key) || Number(row.created_at),
    createdAt: Number(row.created_at),
  }));
}
```

- [ ] **Step 2: Add `deleteBatchSessions` function**

Add after `listSessions`:

```typescript
export interface DeleteBatchResult {
  deleted: number;
  errors: Array<{ key: string; error: string }>;
}

/**
 * 批量删除会话
 * @param sessionKeys 要删除的会话 key 列表
 * @param viewerId 当前用户 ID
 * @param viewerRole 当前用户角色
 * @param viewerTeam 当前用户 team
 */
export async function deleteBatchSessions(
  sessionKeys: string[],
  viewerId: string,
  viewerRole: string,
  viewerTeam: string
): Promise<DeleteBatchResult> {
  const result: DeleteBatchResult = { deleted: 0, errors: [] };

  // 查询这些会话的所有者
  const ownerRows = await db.execute(sql`
    SELECT session_key, user_id FROM acp_replay_sessions
    WHERE session_key = ANY(${sessionKeys})
  `) as unknown as Array<{ session_key: string; user_id: string }>;

  const ownerMap = new Map(ownerRows.map(r => [r.session_key, r.user_id]));

  // 查询同 team 用户 ID（用于权限判断）
  let teamUserIds: Set<string> = new Set();
  if (viewerTeam) {
    const teamRows = await db.execute(sql`
      SELECT id::text as uid FROM users WHERE team = ${viewerTeam} AND team != ''
    `) as unknown as Array<{ uid: string }>;
    teamUserIds = new Set(teamRows.map(r => r.uid));
  }

  for (const key of sessionKeys) {
    const ownerId = ownerMap.get(key);
    if (!ownerId) {
      result.errors.push({ key, error: 'SESSION_NOT_FOUND' });
      continue;
    }

    // 权限检查：admin 可删所有，普通用户只能删 own + team
    const canDelete = viewerRole === 'admin'
      || ownerId === viewerId
      || teamUserIds.has(ownerId);

    if (!canDelete) {
      result.errors.push({ key, error: 'NOT_AUTHORIZED' });
      continue;
    }

    try {
      await clearSessionEvents(key);
      result.deleted++;
    } catch (err) {
      result.errors.push({ key, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return result;
}
```

- [ ] **Step 3: Update `recordEvent` to accept optional user info**

Modify the `recordEvent` function signature and UPSERT to include user fields:

```typescript
export async function recordEvent(
  sessionKey: string,
  eventType: string,
  payload: unknown,
  userInfo?: { userId: string; username: string }
): Promise<number> {
  const now = Date.now();

  // ... existing dedup check ...

  // 使用 UPSERT 原子递增 seq，同时写入 user 信息（仅首次创建时写入）
  const upsertResult = await db.execute(sql`
    INSERT INTO acp_replay_sessions (session_key, created_at, last_seq, user_id, username)
    VALUES (${sessionKey}, ${now}, 1, ${userInfo?.userId || ''}, ${userInfo?.username || ''})
    ON CONFLICT (session_key)
    DO UPDATE SET last_seq = acp_replay_sessions.last_seq + 1
    RETURNING last_seq
  `);
  const seq = Number((upsertResult[0] as { last_seq: string | number }).last_seq);

  await db.execute(sql`
    INSERT INTO acp_replay_events (session_key, seq, event_type, payload, timestamp)
    VALUES (${sessionKey}, ${seq}, ${eventType}, ${JSON.stringify(payload)}, ${now})
  `);

  return seq;
}
```

- [ ] **Step 4: Add `updateSessionTitle` function**

Add after `deleteBatchSessions`:

```typescript
/**
 * 更新会话标题
 */
export async function updateSessionTitle(
  sessionKey: string,
  title: string
): Promise<void> {
  await db.execute(sql`
    UPDATE acp_replay_sessions SET title = ${title} WHERE session_key = ${sessionKey}
  `);
}
```

- [ ] **Step 5: Commit**

```bash
git add ai-gateway/src/acp/event-ledger.ts
git commit -m "feat: add listSessions, deleteBatchSessions, updateSessionTitle to event-ledger"
```

---

## Task 4: Backend — Sessions RPC Handlers

**Files:**
- Modify: `ai-gateway/src/methods/sessions.ts`

- [ ] **Step 1: Add imports and new handler types**

Update the imports at the top of the file:

```typescript
import type { ClientConnection } from '../gateway/server-broadcast.js';
import type { ChatAbortControllerEntry } from '../gateway/chat-abort.js';
import { abortChatRun } from '../gateway/chat-abort.js';
import { clearSessionEvents, listSessions, deleteBatchSessions, updateSessionTitle, type SessionListItem } from '../acp/event-ledger.js';
```

- [ ] **Step 2: Add `handleSessionsList` handler**

Add after `handleSessionsMessagesSubscribe`:

```typescript
/**
 * sessions.list - 列出当前用户可见的会话
 */
export async function handleSessionsList(
  client: ClientConnection,
  params: { filter?: 'mine' | 'team' | 'all' },
  context: SessionsMethodContext,
  respond: (ok: boolean, payload: unknown) => void
): Promise<void> {
  try {
    // 从客户端连接获取用户信息（JWT 解析后的 userId/username/role 存储在 ClientConnection 上）
    const userId = (client as any).userId || '';
    const username = (client as any).username || '';
    const role = (client as any).role || 'viewer';
    const team = (client as any).team || '';

    const filter = params.filter || 'mine';
    const sessions = await listSessions(userId, role, team, filter);

    respond(true, { sessions });
  } catch (err) {
    respond(false, { error: 'FAILED_TO_LIST_SESSIONS', detail: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * sessions.deleteBatch - 批量删除会话
 */
export async function handleSessionsDeleteBatch(
  client: ClientConnection,
  params: { sessionKeys: string[] },
  context: SessionsMethodContext,
  respond: (ok: boolean, payload: unknown) => void
): Promise<void> {
  try {
    const userId = (client as any).userId || '';
    const role = (client as any).role || 'viewer';
    const team = (client as any).team || '';

    const { sessionKeys } = params;
    if (!Array.isArray(sessionKeys) || sessionKeys.length === 0) {
      respond(false, { error: 'INVALID_PARAMS', detail: 'sessionKeys must be a non-empty array' });
      return;
    }

    // 1. 中止所有运行中的 run
    for (const sessionKey of sessionKeys) {
      for (const [runId, entry] of context.chatAbortControllers) {
        if (entry.sessionKey === sessionKey) {
          abortChatRun(context.chatAbortControllers, runId);
        }
      }
    }

    // 2. 批量删除数据库记录
    const result = await deleteBatchSessions(sessionKeys, userId, role, team);

    // 3. 取消客户端订阅
    for (const sessionKey of sessionKeys) {
      for (const client of context.clients.values()) {
        client.subscribedSessions.delete(sessionKey);
      }
    }

    respond(true, result);
  } catch (err) {
    respond(false, { error: 'FAILED_TO_DELETE_BATCH', detail: err instanceof Error ? err.message : String(err) });
  }
}

/**
 * sessions.updateTitle - 更新会话标题
 */
export async function handleSessionsUpdateTitle(
  client: ClientConnection,
  params: { sessionKey: string; title: string },
  respond: (ok: boolean, payload: unknown) => void
): Promise<void> {
  try {
    await updateSessionTitle(params.sessionKey, params.title);
    respond(true, { sessionKey: params.sessionKey, title: params.title });
  } catch (err) {
    respond(false, { error: 'FAILED_TO_UPDATE_TITLE', detail: err instanceof Error ? err.message : String(err) });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add ai-gateway/src/methods/sessions.ts
git commit -m "feat: add handleSessionsList, handleSessionsDeleteBatch, handleSessionsUpdateTitle RPC handlers"
```

---

## Task 5: Backend — Register New RPC Methods + Store User Info on Connection

**Files:**
- Modify: `ai-gateway/src/index.ts`
- Modify: `ai-gateway/src/gateway/ws-connection.ts`

- [ ] **Step 1: Update imports in index.ts**

```typescript
import {
  handleSessionsSubscribe,
  handleSessionsUnsubscribe,
  handleSessionsMessagesSubscribe,
  handleSessionsDelete,
  handleSessionsList,
  handleSessionsDeleteBatch,
  handleSessionsUpdateTitle,
  type SessionsMethodContext,
} from './methods/sessions.js';
```

- [ ] **Step 2: Register new RPC methods in the switch statement**

In the `switch (method)` block, add cases before the `default`:

```typescript
case 'sessions.list':
  await handleSessionsList(client, params, sessionsContext, respond);
  break;
case 'sessions.deleteBatch':
  await handleSessionsDeleteBatch(client, params, sessionsContext, respond);
  break;
case 'sessions.updateTitle':
  await handleSessionsUpdateTitle(client, params, respond);
  break;
```

- [ ] **Step 3: Store user info on ClientConnection**

In `ai-gateway/src/gateway/ws-connection.ts`, find where `ClientConnection` is created and add `team` field. The `ClientConnection` interface needs updating too.

In `ai-gateway/src/gateway/server-broadcast.ts`, add `team` to `ClientConnection`:

```typescript
export interface ClientConnection {
  connId: string;
  socket: WebSocket;
  userId: string;
  username: string;  // NEW
  role: string;      // NEW
  team: string;      // NEW
  seq: number;
  subscribedSessions: Set<string>;
}
```

In `ai-gateway/src/gateway/ws-connection.ts`, find the `handleConnection` function where `ClientConnection` is constructed. Add the new fields from the JWT payload. The `verifyToken` already returns `{ userId, username, role }`. You need to also query the `team` from the `users` table, or include it in the JWT. 

**Simpler approach:** Include `team` in the JWT by updating the auth-service login response. Check `auth-service/src/routes/auth.ts` to see how the JWT is signed. Add `team` to the JWT payload.

In `auth-service/src/routes/auth.ts`, find where the JWT is signed and add `team`:

```typescript
const token = jwt.sign(
  { sub: user.id, username: user.username, role: user.role, team: user.team || '' },
  config.jwtSecret,
  { expiresIn: '24h' }
);
```

Then in `ai-gateway/src/auth.ts`, update `AuthUser`:

```typescript
export interface AuthUser {
  userId: string;
  username: string;
  role: string;
  team: string;  // NEW
}
```

And update `verifyToken`:

```typescript
export function verifyToken(token: string): AuthUser | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret) as {
      sub: string;
      username: string;
      role: string;
      team: string;
    };
    return {
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
      team: payload.team || '',
    };
  } catch {
    return null;
  }
}
```

In `ws-connection.ts`, when creating `ClientConnection`, copy the team from auth:

```typescript
const conn: ClientConnection = {
  connId,
  socket,
  userId: authUser.userId,
  username: authUser.username,
  role: authUser.role,
  team: authUser.team,
  seq: 0,
  subscribedSessions: new Set(),
};
```

- [ ] **Step 4: Update recordEvent call in chat.ts to pass user info**

In `ai-gateway/src/methods/chat.ts`, the `handleChatSend` function calls `recordEvent`. Pass the user info from the client:

```typescript
// 在 handleChatSend 中，找到 recordEvent 调用：
await recordEvent(sessionKey, 'user_message', { runId, message: params.message }, {
  userId: client.userId,
  username: client.username,
});
```

- [ ] **Step 5: Commit**

```bash
git add ai-gateway/src/index.ts ai-gateway/src/gateway/server-broadcast.ts ai-gateway/src/gateway/ws-connection.ts ai-gateway/src/auth.ts ai-gateway/src/methods/chat.ts auth-service/src/routes/auth.ts
git commit -m "feat: register sessions.list/deleteBatch/updateTitle RPCs, store user info on WS connection"
```

---

## Task 6: Frontend — Types

**Files:**
- Modify: `web-console/src/types/chat.ts`

- [ ] **Step 1: Update ChatSession type**

```typescript
export interface ChatSession {
  sessionKey: string;
  title: string;
  lastMessageAt: number;
  messageCount: number;
  userId?: string;     // NEW: 创建者用户 ID
  username?: string;   // NEW: 创建者用户名
  createdAt?: number;  // NEW: 创建时间
}
```

- [ ] **Step 2: Add new RPC param/response types**

```typescript
// sessions.list
export interface SessionsListParams {
  filter?: 'mine' | 'team' | 'all';
}

export interface SessionsListResponse {
  sessions: Array<{
    sessionKey: string;
    title: string;
    username: string;
    userId: string;
    messageCount: number;
    lastMessageAt: number;
    createdAt: number;
  }>;
}

// sessions.deleteBatch
export interface SessionsDeleteBatchParams {
  sessionKeys: string[];
}

export interface SessionsDeleteBatchResponse {
  deleted: number;
  errors?: Array<{ key: string; error: string }>;
}

// sessions.updateTitle
export interface SessionsUpdateTitleParams {
  sessionKey: string;
  title: string;
}

export interface SessionsUpdateTitleResponse {
  sessionKey: string;
  title: string;
}
```

- [ ] **Step 3: Commit**

```bash
git add web-console/src/types/chat.ts
git commit -m "feat: add ChatSession userId/username fields, add sessions.list/deleteBatch/updateTitle types"
```

---

## Task 7: Frontend — Chat Store (Server-Side Session List)

**Files:**
- Modify: `web-console/src/stores/chat.ts`

- [ ] **Step 1: Remove localStorage session persistence**

Remove these constants and functions:
- `LS_KEY_SESSIONS`, `LS_KEY_CURRENT`, `LS_KEY_RUN_MAP`
- `readLocalStorage`, `writeLocalStorage`, `persistChatState`
- `initialSessions`, `initialCurrentSessionKey`, `initialRunIdToSession`

- [ ] **Step 2: Update ChatState interface**

Add new actions:

```typescript
interface ChatState {
  // ... existing fields ...
  sessions: ChatSession[];
  // NEW: 服务端会话列表的 filter
  sessionsFilter: 'mine' | 'team' | 'all';

  // ... existing actions ...
  fetchSessions: (filter?: 'mine' | 'team' | 'all') => Promise<void>;
  deleteSessions: (sessionKeys: string[]) => Promise<void>;
  updateSessionTitle: (sessionKey: string, title: string) => Promise<void>;
}
```

- [ ] **Step 3: Implement `fetchSessions`**

```typescript
fetchSessions: async (filter) => {
  const { wsClient } = get();
  if (!wsClient) return;

  const f = filter || get().sessionsFilter;
  try {
    const res = await wsClient.request<SessionsListResponse>('sessions.list', { filter: f });
    const sessions: ChatSession[] = res.sessions.map(s => ({
      sessionKey: s.sessionKey,
      title: s.title,
      lastMessageAt: s.lastMessageAt,
      messageCount: s.messageCount,
      userId: s.userId,
      username: s.username,
      createdAt: s.createdAt,
    }));
    set({ sessions, sessionsFilter: f });
  } catch (err) {
    console.error('Failed to fetch sessions:', err);
  }
},
```

- [ ] **Step 4: Implement `deleteSessions`**

```typescript
deleteSessions: async (sessionKeys) => {
  const { wsClient, currentSessionKey } = get();
  if (!wsClient || sessionKeys.length === 0) return;

  try {
    await wsClient.request<SessionsDeleteBatchResponse>('sessions.deleteBatch', { sessionKeys });
  } catch (err) {
    console.error('Failed to delete sessions on server:', err);
  }

  // 清理本地状态
  set((state) => {
    const newSessions = state.sessions.filter(s => !sessionKeys.includes(s.sessionKey));
    const newMessagesBySession = { ...state.messagesBySession };
    const newRunIdToSession: Record<string, string> = {};
    const newBuffers: Record<string, string> = {};

    for (const key of sessionKeys) {
      delete newMessagesBySession[key];
    }
    for (const [rid, sk] of Object.entries(state.runIdToSession)) {
      if (!sessionKeys.includes(sk)) newRunIdToSession[rid] = sk;
    }
    for (const [rid, buf] of Object.entries(state.streamingBuffers)) {
      if (!sessionKeys.includes(state.runIdToSession[rid] || '')) newBuffers[rid] = buf;
    }

    const newCurrent = sessionKeys.includes(currentSessionKey || '')
      ? (newSessions.length > 0 ? newSessions[0].sessionKey : null)
      : currentSessionKey;

    return {
      sessions: newSessions,
      messagesBySession: newMessagesBySession,
      runIdToSession: newRunIdToSession,
      streamingBuffers: newBuffers,
      currentSessionKey: newCurrent,
      isSending: sessionKeys.includes(currentSessionKey || '') ? false : state.isSending,
    };
  });

  // 刷新列表
  get().fetchSessions();
},
```

- [ ] **Step 5: Implement `updateSessionTitle`**

```typescript
updateSessionTitle: async (sessionKey, title) => {
  const { wsClient } = get();
  if (!wsClient) return;

  try {
    await wsClient.request('sessions.updateTitle', { sessionKey, title });
    set((state) => ({
      sessions: state.sessions.map(s =>
        s.sessionKey === sessionKey ? { ...s, title } : s
      ),
    }));
  } catch (err) {
    console.error('Failed to update session title:', err);
  }
},
```

- [ ] **Step 6: Update `createSession` to call `fetchSessions`**

After creating a session locally, the session will appear in the list. When the first message is sent, the server will have the session with user info. Call `fetchSessions` after connection:

In the `connect` action, after `status === 'connected'`, add:

```typescript
if (status === 'connected') {
  get().fetchSessions();
  const { currentSessionKey } = get();
  if (currentSessionKey) {
    get().loadSessionHistory(currentSessionKey);
  }
}
```

- [ ] **Step 7: Update `deleteSession` (single) to use new logic**

Replace the existing `deleteSession` to call `deleteSessions`:

```typescript
deleteSession: async (sessionKey) => {
  await get().deleteSessions([sessionKey]);
},
```

- [ ] **Step 8: Commit**

```bash
git add web-console/src/stores/chat.ts
git commit -m "feat: migrate session list from localStorage to server-side sessions.list RPC"
```

---

## Task 8: Frontend — SessionList Component (Edit Mode + Batch Delete + Creator Display)

**Files:**
- Modify: `web-console/src/components/chat/SessionList.tsx`

- [ ] **Step 1: Add new state and imports**

```typescript
import { useState, useMemo, useCallback } from 'react';
import { Plus, MessageSquare, Trash2, Loader2, CheckCircle2, AlertCircle, ShieldQuestion, Check, Square, SquareCheck } from 'lucide-react';
import { useChatStore } from '../../stores/chat';
import { useAuthStore } from '../../stores/auth';
import { usePendingApprovals } from '../../hooks/useExecApproval';
import { cn } from '../../lib/utils';
import { ScrollArea } from '../ui/scroll-area';
import { Button } from '../ui/button';
import { Dialog } from '../ui/dialog';
import type { ChatMessage } from '../../types/chat';
```

- [ ] **Step 2: Update SessionList component with edit mode**

Replace the entire `SessionList` component:

```typescript
export function SessionList({ onClose }: { onClose?: () => void }) {
  const sessions = useChatStore((s) => s.sessions);
  const currentSessionKey = useChatStore((s) => s.currentSessionKey);
  const messagesBySession = useChatStore((s) => s.messagesBySession);
  const createSession = useChatStore((s) => s.createSession);
  const selectSession = useChatStore((s) => s.selectSession);
  const deleteSessions = useChatStore((s) => s.deleteSessions);
  const fetchSessions = useChatStore((s) => s.fetchSessions);
  const seenSessions = useChatStore((s) => s.seenSessions);
  const currentUser = useAuthStore((s) => s.user);

  const [isEditing, setIsEditing] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // 获取待审批列表
  const { data: approvals } = usePendingApprovals();
  const approvalSessionKeys = useMemo(() => {
    const set = new Set<string>();
    if (approvals) {
      for (const a of approvals) set.add(a.sessionKey);
    }
    return set;
  }, [approvals]);

  const toggleSelect = useCallback((key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    setSelectedKeys(prev => {
      if (prev.size === sessions.length) return new Set();
      return new Set(sessions.map(s => s.sessionKey));
    });
  }, [sessions]);

  const handleBatchDelete = async () => {
    if (selectedKeys.size === 0) return;
    setIsDeleting(true);
    try {
      await deleteSessions(Array.from(selectedKeys));
      setSelectedKeys(new Set());
      setIsEditing(false);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteSessions([deleteTarget]);
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const allSelected = sessions.length > 0 && selectedKeys.size === sessions.length;

  return (
    <div className="flex h-full flex-col border-r border-border bg-background">
      {/* 顶部工具栏 */}
      <div className="border-b border-border p-3">
        <div className="flex items-center gap-2">
          {isEditing ? (
            <>
              <Button variant="ghost" size="sm" onClick={() => { setIsEditing(false); setSelectedKeys(new Set()); }}>
                完成
              </Button>
              <span className="text-xs text-muted-foreground flex-1">
                已选 {selectedKeys.size} 项
              </span>
              <Button
                variant="destructive"
                size="sm"
                disabled={selectedKeys.size === 0 || isDeleting}
                onClick={handleBatchDelete}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                {isDeleting ? '删除中...' : '删除'}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={createSession} className="flex-1" size="sm">
                <Plus className="mr-1.5 h-4 w-4" />
                新建对话
              </Button>
              {currentUser?.role === 'admin' && sessions.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                  编辑
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="space-y-1 p-2">
          {sessions.length === 0 && (
            <div className="px-2 py-4 text-center text-xs text-muted-foreground">
              暂无对话
            </div>
          )}
          {sessions.map((session) => {
            const sessionApprovalKeys = new Set(
              approvalSessionKeys.has(session.sessionKey) ? [session.sessionKey] : []
            );
            const status = deriveSessionStatus(
              messagesBySession[session.sessionKey],
              sessionApprovalKeys,
              seenSessions,
              session.sessionKey,
            );
            const statusConfig = STATUS_CONFIG[status];
            const StatusIcon = statusConfig.icon;
            const isSelected = selectedKeys.has(session.sessionKey);

            return (
              <div
                key={session.sessionKey}
                className={cn(
                  'group flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted',
                  currentSessionKey === session.sessionKey && 'bg-muted'
                )}
                onClick={() => {
                  if (isEditing) {
                    toggleSelect(session.sessionKey);
                  } else {
                    selectSession(session.sessionKey);
                    onClose?.();
                  }
                }}
              >
                {/* 复选框（编辑模式） */}
                {isEditing && (
                  <div className="shrink-0">
                    {isSelected ? (
                      <SquareCheck className="h-4 w-4 text-primary" />
                    ) : (
                      <Square className="h-4 w-4 text-muted-foreground" />
                    )}
                  </div>
                )}

                <StatusIcon
                  className={cn(
                    'h-3.5 w-3.5 shrink-0',
                    statusConfig.className,
                    status === 'running' && 'animate-spin',
                  )}
                />
                <div className="flex-1 min-w-0">
                  <span className="block truncate">{session.title}</span>
                  {/* 创建者信息 */}
                  {session.username && (
                    <span className="text-xs text-muted-foreground">
                      <span className="text-blue-400">{session.username}</span>
                      {' · '}{session.messageCount}条消息
                    </span>
                  )}
                </div>
                {status !== 'idle' && (
                  <span className={cn('shrink-0 text-xs', statusConfig.className)}>
                    {statusConfig.label}
                  </span>
                )}
                {/* 删除按钮（非编辑模式，hover 显示） */}
                {!isEditing && (
                  <button
                    type="button"
                    className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget(session.sessionKey);
                    }}
                    title="删除对话"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {/* 删除确认对话框（单个删除） */}
      <Dialog
        open={!!deleteTarget}
        onClose={() => !isDeleting && setDeleteTarget(null)}
        title="确认删除对话"
        description="删除后无法恢复，该对话的所有消息和历史记录将被永久清除。"
      >
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={isDeleting}>
            取消
          </Button>
          <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
            {isDeleting ? '删除中...' : '确认删除'}
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add web-console/src/components/chat/SessionList.tsx
git commit -m "feat: add edit mode, batch delete, and creator display to SessionList"
```

---

## Task 9: Frontend — ChatReact Page (Permission-Based Input)

**Files:**
- Modify: `web-console/src/pages/ChatReact.tsx`

- [ ] **Step 1: Add permission check for ChatInput**

```typescript
import { useAuthStore } from '../stores/auth';

export default function ChatReact() {
  const connect = useChatStore((s) => s.connect);
  const connectionStatus = useChatStore((s) => s.connectionStatus);
  const currentSessionKey = useChatStore((s) => s.currentSessionKey);
  const sessions = useChatStore((s) => s.sessions);
  const messagesBySession = useChatStore((s) => s.messagesBySession);
  const createSession = useChatStore((s) => s.createSession);
  const currentUser = useAuthStore((s) => s.user);

  const isMobile = useIsMobile();
  const [sessionListOpen, setSessionListOpen] = useState(false);

  useEffect(() => { connect(); }, [connect]);

  useEffect(() => {
    if (connectionStatus === 'connected' && !currentSessionKey) {
      createSession();
    }
  }, [connectionStatus, currentSessionKey, createSession]);

  const messages = currentSessionKey ? messagesBySession[currentSessionKey] || [] : [];

  // 判断当前会话是否是自己的
  const currentSession = sessions.find(s => s.sessionKey === currentSessionKey);
  const isOwnSession = !currentSession || !currentSession.userId || currentSession.userId === currentUser?.id;
  const canChat = isOwnSession;

  return (
    <div className="flex h-full overflow-hidden">
      {!isMobile && (
        <div className="w-64 shrink-0">
          <SessionList />
        </div>
      )}

      {isMobile && sessionListOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setSessionListOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-50 w-72 max-w-[80vw] animate-in slide-in-from-left duration-200">
            <SessionList onClose={() => setSessionListOpen(false)} />
          </div>
        </>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 md:px-4">
          {isMobile && (
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => setSessionListOpen(true)} title="会话列表">
              <MessageSquare className="h-4 w-4" />
            </Button>
          )}
          <span className={cn('h-2 w-2 shrink-0 rounded-full', STATUS_COLOR[connectionStatus])} />
          <span className="text-xs text-muted-foreground truncate">{STATUS_TEXT[connectionStatus]}</span>
          {!canChat && currentSessionKey && (
            <span className="text-xs text-muted-foreground ml-auto">只读</span>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {currentSessionKey ? (
            <MessageList messages={messages} />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              选择或新建对话
            </div>
          )}
        </div>

        {/* 只有自己的对话才显示输入框 */}
        {currentSessionKey && canChat && <ChatInput />}
      </div>

      <ApprovalPrompt />
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add web-console/src/pages/ChatReact.tsx
git commit -m "feat: hide ChatInput for non-own sessions based on userId"
```

---

## Task 10: Build and Deploy

**Files:** None (build/deploy commands only)

- [ ] **Step 1: Build web-console**

```bash
cd web-console && npm run build
```

- [ ] **Step 2: Build ai-gateway**

```bash
cd ai-gateway && npm run build
```

- [ ] **Step 3: Build auth-service**

```bash
cd auth-service && npm run build
```

- [ ] **Step 4: Deploy to Docker**

```bash
docker cp web-console/dist newcloud-app-1:/app/web-console/dist
docker cp ai-gateway/dist newcloud-app-1:/app/ai-gateway/dist
docker cp auth-service/dist newcloud-app-1:/app/auth-service/dist
docker exec newcloud-app-1 pm2 restart ai-gateway
docker exec newcloud-app-1 pm2 restart auth-service
docker exec newcloud-app-1 nginx -s reload
```

- [ ] **Step 5: Commit all remaining changes**

```bash
git add -A
git commit -m "feat: batch delete, creator display, team-based permissions"
```
