# Team Feature Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement proper team management with granular AI chat permissions - admin creates teams, assigns users; team members see team chats but only continue/delete their own; admin sees all, continues only own, deletes any.

**Architecture:** Create a `teams` table, add `team_id` foreign key to users, implement team CRUD API routes, update chat session filtering and permission logic, add team management UI in Users page, enforce chat ownership rules in frontend.

**Tech Stack:** PostgreSQL (Drizzle ORM), Fastify, React, React Query, Zustand, i18next

---

## File Structure

### Backend Files

| File | Responsibility |
|------|----------------|
| `auth-service/src/db/schema.ts` | Add teams table, add team_id to users |
| `auth-service/migrations/004_teams.sql` | Database migration |
| `auth-service/src/services/team.service.ts` | Team CRUD operations |
| `auth-service/src/routes/teams.ts` | Team API routes (Fastify) |
| `auth-service/src/routes/users.ts` | Update team assignment route |
| `auth-service/src/index.ts` | Register team routes |
| `ai-gateway/src/acp/event-ledger.ts` | Update session filtering, add ownership checks |
| `ai-gateway/src/methods/sessions.ts` | Add permission checks for continue/delete |

### Frontend Files

| File | Responsibility |
|------|----------------|
| `web-console/src/types/team.ts` | Team type definitions |
| `web-console/src/api/teams.ts` | Team API client |
| `web-console/src/hooks/useTeams.ts` | React Query hooks for teams |
| `web-console/src/pages/Users.tsx` | Add team management UI |
| `web-console/src/components/chat/SessionList.tsx` | Update filter visibility, permission checks |
| `web-console/src/stores/chat.ts` | Update filter state, permission logic |
| `web-console/src/lib/demo/mock-data.ts` | Add demo team data |
| `web-console/src/lib/demo/demo-api.ts` | Add demoGetTeams wrapper |
| `web-console/src/i18n/locales/zh.json` | Add team translations |
| `web-console/src/i18n/locales/en.json` | Add team translations |

---

## Task 1: Database Migration - Create Teams Table

**Files:**
- Create: `auth-service/migrations/004_teams.sql`
- Modify: `auth-service/src/db/schema.ts`

- [ ] **Step 1: Create migration file**

Create `auth-service/migrations/004_teams.sql`:

```sql
-- Create teams table
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Add team_id foreign key to users table
ALTER TABLE users ADD COLUMN team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

-- Create index for faster team lookups
CREATE INDEX idx_users_team_id ON users(team_id);
```

- [ ] **Step 2: Update Drizzle schema**

In `auth-service/src/db/schema.ts`, add teams table and update users:

```typescript
import { pgTable, uuid, varchar, timestamp } from 'drizzle-orm/pg-core';

// Add teams table
export const teams = pgTable('teams', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 64 }).notNull().unique(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// Update users table - add team_id (keep existing team string for migration)
// Add this line after the existing team column:
// teamId: uuid('team_id').references(() => teams.id, { onDelete: 'set null' }),
```

- [ ] **Step 3: Run migration**

```bash
cd auth-service && npx drizzle-kit push
```

Expected: Migration runs successfully, teams table created, team_id added to users

- [ ] **Step 4: Commit**

```bash
git add auth-service/migrations/004_teams.sql auth-service/src/db/schema.ts
git commit -m "feat(db): create teams table and add team_id to users"
```

---

## Task 2: Backend - Team Service

**Files:**
- Create: `auth-service/src/services/team.service.ts`

- [ ] **Step 1: Create team service**

Create `auth-service/src/services/team.service.ts`:

```typescript
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { teams, users } from '../db/schema';

export interface CreateTeamParams {
  name: string;
}

export interface UpdateTeamParams {
  name?: string;
}

export class TeamService {
  async list() {
    return db.select().from(teams);
  }

  async getById(id: string) {
    const result = await db.select().from(teams).where(eq(teams.id, id));
    return result[0] || null;
  }

  async create(params: CreateTeamParams) {
    const result = await db.insert(teams).values(params).returning();
    return result[0];
  }

  async update(id: string, params: UpdateTeamParams) {
    const result = await db
      .update(teams)
      .set(params)
      .where(eq(teams.id, id))
      .returning();
    return result[0] || null;
  }

  async delete(id: string) {
    // Unassign all users from this team (set team_id to NULL)
    await db
      .update(users)
      .set({ teamId: null })
      .where(eq(users.teamId, id));

    // Delete the team
    const result = await db
      .delete(teams)
      .where(eq(teams.id, id))
      .returning();
    return result[0] || null;
  }

  async getMembers(teamId: string) {
    return db
      .select()
      .from(users)
      .where(eq(users.teamId, teamId));
  }

  async assignUserToTeam(userId: string, teamId: string | null) {
    const result = await db
      .update(users)
      .set({ teamId })
      .where(eq(users.id, userId))
      .returning();
    return result[0] || null;
  }
}

export const teamService = new TeamService();
```

- [ ] **Step 2: Commit**

```bash
git add auth-service/src/services/team.service.ts
git commit -m "feat(backend): add team service with CRUD operations"
```

---

## Task 3: Backend - Team Routes

**Files:**
- Create: `auth-service/src/routes/teams.ts`
- Modify: `auth-service/src/index.ts`

- [ ] **Step 1: Create team routes**

Create `auth-service/src/routes/teams.ts`:

```typescript
import { FastifyInstance } from 'fastify';
import { teamService } from '../services/team.service';
import { authenticate, requirePermission } from '../middleware/auth';

export async function teamRoutes(app: FastifyInstance) {
  // Apply auth middleware to all team routes
  app.addHook('onRequest', authenticate);

  // List all teams
  app.get('/teams', async (request, reply) => {
    const user = request.user;
    
    // Admin sees all teams, others see only their own team
    if (user.role === 'admin') {
      const teams = await teamService.list();
      return teams;
    }
    
    // Non-admin: return only their team if they have one
    if (user.teamId) {
      const team = await teamService.getById(user.teamId);
      return team ? [team] : [];
    }
    
    return [];
  });

  // Create team (admin only)
  app.post('/teams', {
    preHandler: [requirePermission('team', 'create')]
  }, async (request, reply) => {
    const { name } = request.body as { name: string };
    
    if (!name || name.trim().length === 0) {
      return reply.status(400).send({ error: 'Team name is required' });
    }
    
    const team = await teamService.create({ name: name.trim() });
    return reply.status(201).send(team);
  });

  // Update team (admin only)
  app.patch('/teams/:id', {
    preHandler: [requirePermission('team', 'update')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { name } = request.body as { name: string };
    
    const team = await teamService.update(id, { name });
    if (!team) {
      return reply.status(404).send({ error: 'Team not found' });
    }
    
    return team;
  });

  // Delete team (admin only)
  app.delete('/teams/:id', {
    preHandler: [requirePermission('team', 'delete')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const team = await teamService.delete(id);
    if (!team) {
      return reply.status(404).send({ error: 'Team not found' });
    }
    
    return { success: true };
  });

  // Get team members (admin only)
  app.get('/teams/:id/members', {
    preHandler: [requirePermission('team', 'read')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    
    const team = await teamService.getById(id);
    if (!team) {
      return reply.status(404).send({ error: 'Team not found' });
    }
    
    const members = await teamService.getMembers(id);
    return members;
  });

  // Assign user to team (admin only)
  app.patch('/users/:id/team', {
    preHandler: [requirePermission('team', 'update')]
  }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { teamId } = request.body as { teamId: string | null };
    
    const user = await teamService.assignUserToTeam(id, teamId);
    if (!user) {
      return reply.status(404).send({ error: 'User not found' });
    }
    
    return user;
  });
}
```

- [ ] **Step 2: Register routes in index.ts**

In `auth-service/src/index.ts`, add:

```typescript
import { teamRoutes } from './routes/teams';

// Register team routes
app.register(teamRoutes, { prefix: '/auth' });
```

- [ ] **Step 3: Commit**

```bash
git add auth-service/src/routes/teams.ts auth-service/src/index.ts
git commit -m "feat(backend): add team CRUD API routes"
```

---

## Task 4: Backend - Chat Permission Checks

**Files:**
- Modify: `ai-gateway/src/acp/event-ledger.ts`
- Modify: `ai-gateway/src/methods/sessions.ts`

- [ ] **Step 1: Update session listing in event-ledger.ts**

In `ai-gateway/src/acp/event-ledger.ts`, update the `listSessions` function to return owner information:

```typescript
// In listSessions function, ensure we return user_id and username
// The existing implementation already does this, just verify it includes:
// - user_id
// - username
// These fields are used by the frontend for permission checks
```

- [ ] **Step 2: Add ownership check helper**

Create a helper function in `event-ledger.ts`:

```typescript
export function isSessionOwner(session: any, userId: string): boolean {
  return session.user_id === userId;
}

export function canContinueSession(session: any, userId: string, isAdmin: boolean): boolean {
  // Only the owner can continue a session
  return session.user_id === userId;
}

export function canDeleteSession(session: any, userId: string, isAdmin: boolean): boolean {
  // Owner can always delete
  if (session.user_id === userId) return true;
  // Admin can delete any session
  if (isAdmin) return true;
  // Non-admin cannot delete others' sessions
  return false;
}
```

- [ ] **Step 3: Update sessions.ts with permission checks**

In `ai-gateway/src/methods/sessions.ts`, update the delete and send methods:

```typescript
// In sessions.delete method, add permission check:
// const session = await getSession(sessionKey);
// if (!canDeleteSession(session, userId, isAdmin)) {
//   throw new Error('Permission denied: cannot delete this session');
// }

// In chat.send method (if it exists), add permission check:
// const session = await getSession(sessionKey);
// if (!canContinueSession(session, userId, isAdmin)) {
//   throw new Error('Permission denied: cannot continue this session');
// }
```

- [ ] **Step 4: Commit**

```bash
git add ai-gateway/src/acp/event-ledger.ts ai-gateway/src/methods/sessions.ts
git commit -m "feat(backend): add chat session ownership and permission checks"
```

---

## Task 5: Frontend - Team Types and API

**Files:**
- Create: `web-console/src/types/team.ts`
- Create: `web-console/src/api/teams.ts`

- [ ] **Step 1: Create team types**

Create `web-console/src/types/team.ts`:

```typescript
export interface Team {
  id: string;
  name: string;
  createdAt: string;
}

export interface CreateTeamParams {
  name: string;
}

export interface UpdateTeamParams {
  name?: string;
}

export interface AssignUserToTeamParams {
  teamId: string | null;
}
```

- [ ] **Step 2: Create team API client**

Create `web-console/src/api/teams.ts`:

```typescript
import { api } from '../lib/api';
import type { Team, CreateTeamParams, UpdateTeamParams, AssignUserToTeamParams } from '../types/team';

export const teamsApi = {
  list: async (): Promise<Team[]> => {
    const response = await api.get('/auth/teams');
    return response.data;
  },

  create: async (params: CreateTeamParams): Promise<Team> => {
    const response = await api.post('/auth/teams', params);
    return response.data;
  },

  update: async (id: string, params: UpdateTeamParams): Promise<Team> => {
    const response = await api.patch(`/auth/teams/${id}`, params);
    return response.data;
  },

  delete: async (id: string): Promise<void> => {
    await api.delete(`/auth/teams/${id}`);
  },

  getMembers: async (id: string): Promise<any[]> => {
    const response = await api.get(`/auth/teams/${id}/members`);
    return response.data;
  },

  assignUser: async (userId: string, teamId: string | null): Promise<any> => {
    const response = await api.patch(`/auth/users/${userId}/team`, { teamId });
    return response.data;
  },
};
```

- [ ] **Step 3: Commit**

```bash
git add web-console/src/types/team.ts web-console/src/api/teams.ts
git commit -m "feat(frontend): add team types and API client"
```

---

## Task 6: Frontend - Team Hooks

**Files:**
- Create: `web-console/src/hooks/useTeams.ts`

- [ ] **Step 1: Create team hooks**

Create `web-console/src/hooks/useTeams.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { teamsApi } from '../api/teams';
import type { CreateTeamParams, UpdateTeamParams } from '../types/team';
import { useDemoStore } from '../stores/demo';
import { demoGetTeams } from '../lib/demo/demo-api';

export function useTeams() {
  const { isDemoMode } = useDemoStore();

  return useQuery({
    queryKey: ['teams'],
    queryFn: async () => {
      if (isDemoMode) {
        return demoGetTeams();
      }
      return teamsApi.list();
    },
  });
}

export function useCreateTeam() {
  const queryClient = useQueryClient();
  const { isDemoMode } = useDemoStore();

  return useMutation({
    mutationFn: async (params: CreateTeamParams) => {
      if (isDemoMode) {
        // Demo mode: create locally
        const newTeam = {
          id: crypto.randomUUID(),
          name: params.name,
          createdAt: new Date().toISOString(),
        };
        return newTeam;
      }
      return teamsApi.create(params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

export function useUpdateTeam() {
  const queryClient = useQueryClient();
  const { isDemoMode } = useDemoStore();

  return useMutation({
    mutationFn: async ({ id, params }: { id: string; params: UpdateTeamParams }) => {
      if (isDemoMode) {
        // Demo mode: update locally
        return { id, ...params };
      }
      return teamsApi.update(id, params);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

export function useDeleteTeam() {
  const queryClient = useQueryClient();
  const { isDemoMode } = useDemoStore();

  return useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode) {
        // Demo mode: delete locally
        return;
      }
      return teamsApi.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
    },
  });
}

export function useAssignUserToTeam() {
  const queryClient = useQueryClient();
  const { isDemoMode } = useDemoStore();

  return useMutation({
    mutationFn: async ({ userId, teamId }: { userId: string; teamId: string | null }) => {
      if (isDemoMode) {
        // Demo mode: update locally
        return { userId, teamId };
      }
      return teamsApi.assignUser(userId, teamId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['teams'] });
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add web-console/src/hooks/useTeams.ts
git commit -m "feat(frontend): add team React Query hooks"
```

---

## Task 7: Frontend - Demo Mode Support

**Files:**
- Modify: `web-console/src/lib/demo/mock-data.ts`
- Modify: `web-console/src/lib/demo/demo-api.ts`

- [ ] **Step 1: Add demo team data**

In `web-console/src/lib/demo/mock-data.ts`, add:

```typescript
export const demoTeams = [
  { id: 'team-1', name: 'Platform', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'team-2', name: 'SRE', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'team-3', name: 'DevOps', createdAt: '2026-01-01T00:00:00Z' },
  { id: 'team-4', name: 'Backend', createdAt: '2026-01-01T00:00:00Z' },
];

export function getDemoTeams() {
  return demoTeams;
}
```

- [ ] **Step 2: Add demo API wrapper**

In `web-console/src/lib/demo/demo-api.ts`, add:

```typescript
import { getDemoTeams } from './mock-data';

export function demoGetTeams() {
  return getDemoTeams();
}
```

- [ ] **Step 3: Commit**

```bash
git add web-console/src/lib/demo/mock-data.ts web-console/src/lib/demo/demo-api.ts
git commit -m "feat(frontend): add demo team data and API wrapper"
```

---

## Task 8: Frontend - Users Page Team Management

**Files:**
- Modify: `web-console/src/pages/Users.tsx`

- [ ] **Step 1: Add team management section**

Update `web-console/src/pages/Users.tsx` to include:

1. Team list section at top (admin only)
2. Create team button and form
3. Edit/delete team buttons
4. Team dropdown selector for each user row
5. Visual indicator showing team members

Key changes:
- Import `useTeams`, `useCreateTeam`, `useUpdateTeam`, `useDeleteTeam`, `useAssignUserToTeam` hooks
- Add state for team management (selected team, form inputs)
- Add team CRUD handlers
- Update user row to include team dropdown
- Add permission checks (admin only for team management)

- [ ] **Step 2: Commit**

```bash
git add web-console/src/pages/Users.tsx
git commit -m "feat(frontend): add team management UI to Users page"
```

---

## Task 9: Frontend - Chat Session Permission Enforcement

**Files:**
- Modify: `web-console/src/components/chat/SessionList.tsx`
- Modify: `web-console/src/stores/chat.ts`

- [ ] **Step 1: Update chat store with permission logic**

In `web-console/src/stores/chat.ts`, add:

```typescript
// Add permission helpers
export function canContinueSession(session: any, userId: string, isAdmin: boolean): boolean {
  return session.userId === userId;
}

export function canDeleteSession(session: any, userId: string, isAdmin: boolean): boolean {
  if (session.userId === userId) return true;
  if (isAdmin) return true;
  return false;
}
```

- [ ] **Step 2: Update SessionList with permission checks**

In `web-console/src/components/chat/SessionList.tsx`:

1. Filter visibility: Only show "All" filter for admin users
2. Continue button: Disable for non-owned sessions
3. Delete button: Disable for non-owned sessions (except admin)
4. Visual indicators: Show owner name for team chats

Key changes:
- Import permission helpers from chat store
- Get current user info (userId, isAdmin)
- Apply permission checks to button states
- Add visual indicators for session ownership

- [ ] **Step 3: Commit**

```bash
git add web-console/src/components/chat/SessionList.tsx web-console/src/stores/chat.ts
git commit -m "feat(frontend): enforce chat session ownership permissions"
```

---

## Task 10: Frontend - i18n Translations

**Files:**
- Modify: `web-console/src/i18n/locales/zh.json`
- Modify: `web-console/src/i18n/locales/en.json`

- [ ] **Step 1: Add Chinese translations**

In `web-console/src/i18n/locales/zh.json`, add:

```json
{
  "teams": {
    "title": "团队管理",
    "create": "创建团队",
    "edit": "编辑团队",
    "delete": "删除团队",
    "name": "团队名称",
    "members": "团队成员",
    "assign": "分配团队",
    "noTeam": "未分配团队",
    "confirmDelete": "确定要删除此团队吗？成员将被取消分配。",
    "created": "团队创建成功",
    "updated": "团队更新成功",
    "deleted": "团队删除成功"
  },
  "chat": {
    "permissions": {
      "continueDenied": "只有创建者可以继续此对话",
      "deleteDenied": "只有创建者可以删除此对话",
      "adminDeleteAllowed": "管理员可以删除任何对话"
    }
  }
}
```

- [ ] **Step 2: Add English translations**

In `web-console/src/i18n/locales/en.json`, add:

```json
{
  "teams": {
    "title": "Team Management",
    "create": "Create Team",
    "edit": "Edit Team",
    "delete": "Delete Team",
    "name": "Team Name",
    "members": "Team Members",
    "assign": "Assign Team",
    "noTeam": "No Team",
    "confirmDelete": "Are you sure you want to delete this team? Members will be unassigned.",
    "created": "Team created successfully",
    "updated": "Team updated successfully",
    "deleted": "Team deleted successfully"
  },
  "chat": {
    "permissions": {
      "continueDenied": "Only the creator can continue this conversation",
      "deleteDenied": "Only the creator can delete this conversation",
      "adminDeleteAllowed": "Admin can delete any conversation"
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add web-console/src/i18n/locales/zh.json web-console/src/i18n/locales/en.json
git commit -m "feat(i18n): add team management translations"
```

---

## Task 11: Integration Testing

**Files:**
- All created/modified files

- [ ] **Step 1: Test database migration**

Verify teams table exists and users table has team_id column.

- [ ] **Step 2: Test backend team CRUD API**

Test all team routes:
- GET /auth/teams
- POST /auth/teams
- PATCH /auth/teams/:id
- DELETE /auth/teams/:id
- GET /auth/teams/:id/members
- PATCH /auth/users/:id/team

- [ ] **Step 3: Test chat permission checks**

Verify:
- Non-admin can only continue/delete own sessions
- Admin can see all sessions, continue only own, delete any
- Team members can see team sessions

- [ ] **Step 4: Test frontend team management**

Verify:
- Team list displays correctly
- Create/edit/delete team works
- User-team assignment works
- Permission checks in UI work

- [ ] **Step 5: Test demo mode**

Verify:
- Demo team data loads
- Team management works in demo mode
- Chat permissions work in demo mode

- [ ] **Step 6: Commit final changes**

```bash
git add .
git commit -m "test: complete team feature integration testing"
```

---

## Self-Review Checklist

- [ ] All spec requirements covered by tasks
- [ ] No placeholders or TODOs in plan
- [ ] Type consistency across all tasks
- [ ] File paths are exact and correct
- [ ] Code blocks are complete and runnable
- [ ] Commands have expected outputs
- [ ] Commit messages follow conventions
