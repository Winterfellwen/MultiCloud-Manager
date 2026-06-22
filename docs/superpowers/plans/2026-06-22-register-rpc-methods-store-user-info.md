# Register New RPC Methods + Store User Info on Connection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register sessions.list, sessions.deleteBatch, sessions.updateTitle RPC methods, store user info (username, role, team) on WebSocket connection, and include team in JWT.

**Architecture:** Extend ClientConnection interface with username, role, team. Add team to AuthUser and JWT payload. Register new RPC switch cases. Pass user info to recordEvent.

**Tech Stack:** TypeScript, WebSocket RPC, JWT authentication

---

## File Structure

### Backend (ai-gateway)
- `ai-gateway/src/gateway/server-broadcast.ts` — Update ClientConnection interface
- `ai-gateway/src/auth.ts` — Update AuthUser interface and verifyToken
- `ai-gateway/src/gateway/ws-connection.ts` — Store user info in ClientConnection
- `ai-gateway/src/index.ts` — Register new RPC methods
- `ai-gateway/src/methods/chat.ts` — Pass user info to recordEvent

### Auth Service
- `auth-service/src/services/auth.service.ts` — Include team in JWT payload

---

## Task 1: Update ClientConnection Interface

**Files:**
- Modify: `ai-gateway/src/gateway/server-broadcast.ts:6-14`

- [ ] **Step 1: Add username, role, team fields to ClientConnection**

```typescript
export interface ClientConnection {
  connId: string;
  socket: WebSocket;
  userId: string;
  username: string;
  role: string;
  team: string;
  seq: number;
  subscribedSessions: Set<string>;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd ai-gateway && npx tsc --noEmit`
Expected: No errors

---

## Task 2: Update AuthUser and verifyToken

**Files:**
- Modify: `ai-gateway/src/auth.ts:7-11,37-51`

- [ ] **Step 1: Add team to AuthUser interface**

```typescript
export interface AuthUser {
  userId: string;
  username: string;
  role: string;
  team: string;
}
```

- [ ] **Step 2: Update verifyToken to extract team**

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

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd ai-gateway && npx tsc --noEmit`
Expected: No errors

---

## Task 3: Include team in JWT Payload

**Files:**
- Modify: `auth-service/src/services/auth.service.ts:47,66`

- [ ] **Step 1: Update login method tokenPayload**

```typescript
const tokenPayload = { sub: user.id, username: user.username, role: user.role as UserRole, team: (user as any).team || '' };
```

- [ ] **Step 2: Update refresh method tokenPayload**

```typescript
const tokenPayload = { sub: user.id, username: user.username, role: user.role as UserRole, team: (user as any).team || '' };
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd auth-service && npx tsc --noEmit`
Expected: No errors

---

## Task 4: Store User Info on WebSocket Connection

**Files:**
- Modify: `ai-gateway/src/gateway/ws-connection.ts:40-46`

- [ ] **Step 1: Add username, role, team to ClientConnection creation**

```typescript
const client: ClientConnection = {
  connId,
  socket,
  userId: user.userId,
  username: user.username,
  role: user.role,
  team: user.team,
  seq: 0,
  subscribedSessions: new Set(),
};
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd ai-gateway && npx tsc --noEmit`
Expected: No errors

---

## Task 5: Register New RPC Methods

**Files:**
- Modify: `ai-gateway/src/index.ts:14-26,112-114`

- [ ] **Step 1: Update imports to include new handlers**

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

- [ ] **Step 2: Add switch cases before default**

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

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd ai-gateway && npx tsc --noEmit`
Expected: No errors

---

## Task 6: Pass User Info to recordEvent

**Files:**
- Modify: `ai-gateway/src/methods/chat.ts:111`

- [ ] **Step 1: Update recordEvent call with user info**

```typescript
await recordEvent(sessionKey, 'user_message', { runId, message: params.message }, {
  userId: client.userId,
  username: client.username,
});
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd ai-gateway && npx tsc --noEmit`
Expected: No errors

---

## Task 7: Commit Changes

**Files:**
- `ai-gateway/src/gateway/server-broadcast.ts`
- `ai-gateway/src/auth.ts`
- `ai-gateway/src/gateway/ws-connection.ts`
- `ai-gateway/src/index.ts`
- `ai-gateway/src/methods/chat.ts`
- `auth-service/src/services/auth.service.ts`

- [ ] **Step 1: Stage and commit**

```bash
git add ai-gateway/src/gateway/server-broadcast.ts ai-gateway/src/auth.ts ai-gateway/src/gateway/ws-connection.ts ai-gateway/src/index.ts ai-gateway/src/methods/chat.ts auth-service/src/services/auth.service.ts
git commit -m "feat: register sessions.list/deleteBatch/updateTitle RPCs, store user info on WS connection"
```

---

## Verification

After completing all tasks, verify the changes work together:

1. Ensure TypeScript compiles without errors in both ai-gateway and auth-service
2. Check that the new RPC methods are properly imported and registered
3. Verify that ClientConnection includes all required fields
4. Confirm JWT payload includes team field
5. Ensure recordEvent passes user info correctly

**Note:** This plan is a subset of the larger batch-delete-and-creator-display plan (2026-06-22). The changes here enable the backend infrastructure needed for session management features.