# Team Feature Optimization Design

## Overview

Optimize the team feature to provide proper team management and granular AI chat permissions. Admin can create teams and assign users. Team members can see team chats but only continue/delete their own. Admin can see all chats, continue only their own, and delete any.

## Requirements

1. **Team Management**: Admin can create, edit, delete teams and assign users
2. **Chat Visibility**: Team members see team's AI chats; admin sees all chats
3. **Chat Permissions (Non-Admin)**: Continue/delete only own chats
4. **Chat Permissions (Admin)**: Continue only own chats, delete any chat
5. **Team Deletion**: Unassign users (don't delete them)

## Database Schema

### New `teams` table

```sql
CREATE TABLE teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### Modified `users` table

- Add `team_id UUID REFERENCES teams(id) ON DELETE SET NULL`
- Keep existing `team` column temporarily for migration (drop later)

### Migration Strategy

1. Create `teams` table
2. Migrate existing team strings to team records
3. Add `team_id` foreign key to `users`
4. Update `users.team_id` based on matching `users.team` string
5. Drop old `team` column (in future migration)

## Backend API Routes

### Team Management (Admin Only)

| Route | Method | Description |
|-------|--------|-------------|
| `GET /teams` | GET | List all teams (admin: all, user: own team only) |
| `POST /teams` | POST | Create a team (admin only) |
| `PATCH /teams/:id` | PATCH | Update team name (admin only) |
| `DELETE /teams/:id` | DELETE | Delete team, unassign members (admin only) |

### User-Team Assignment (Admin Only)

| Route | Method | Description |
|-------|--------|-------------|
| `PATCH /users/:id/team` | PATCH | Assign user to team (admin only) |
| `GET /teams/:id/members` | GET | List team members (admin only) |

### Chat Session Permissions

| Action | Non-Admin | Admin |
|--------|-----------|-------|
| **View sessions** | Own + Team | All |
| **Continue session** | Owner only | Owner only |
| **Delete session** | Owner only | Any |
| **Delete batch** | Owner only | Any |

## Frontend Changes

### Users Page Updates

- Add team management section at top
- Team dropdown selector for each user
- Create/edit/delete team buttons (admin only)
- Visual indicator showing team members

### Chat Session List Updates

- **Filter visibility**: "All" filter only shown for admin
- **Continue button**: Disabled for non-owned visible chats
- **Delete button**: Disabled for non-owned chats (except admin who can delete any)
- **Visual indicators**: Show owner name/avatar for team chats

### Chat Permission Rules

| User sees chat | Can continue? | Can delete? |
|----------------|---------------|-------------|
| Own chat | Yes | Yes |
| Team member's chat | No | No |
| Any chat (admin only) | No (unless owner) | Yes |

## Key Files to Modify

### Backend

- `auth-service/src/db/schema.ts` - Add teams table, add team_id to users
- `auth-service/src/routes/teams.ts` - New team CRUD routes
- `auth-service/src/services/team.service.ts` - New team service
- `auth-service/src/routes/users.ts` - Update team assignment
- `ai-gateway/src/acp/event-ledger.ts` - Update session filtering, add ownership checks
- `ai-gateway/src/methods/sessions.ts` - Add permission checks for continue/delete

### Frontend

- `web-console/src/pages/Users.tsx` - Add team management UI
- `web-console/src/hooks/useTeams.ts` - New React Query hooks
- `web-console/src/api/teams.ts` - New API client
- `web-console/src/types/team.ts` - New type definitions
- `web-console/src/components/chat/SessionList.tsx` - Update filter visibility, permission checks
- `web-console/src/stores/chat.ts` - Update filter state, permission logic
- `web-console/src/i18n/locales/zh.json` - Add team translations
- `web-console/src/i18n/locales/en.json` - Add team translations

## Implementation Order

1. Database migration (teams table, user team_id)
2. Backend team CRUD API
3. Backend chat permission checks
4. Frontend team management UI
5. Frontend chat permission enforcement
6. Testing and verification

## Demo Mode

- Add demo team data to mock-data.ts
- Add demoGetTeams() API wrapper
- Ensure team management works in demo mode
