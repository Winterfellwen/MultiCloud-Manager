# User Authentication & Role-Based Access Control

## Status

- **Created:** 2026-05-27
- **Status:** Approved (design phase complete)
- **Approach:** B — Middleware Split (public vs protected groups)
- **Initial admin:** `admin` / `Test@20181025`

## Goals

1. Replace stub auth with real JWT-based login (username + password)
2. Add role-based access control (Admin, Operator, Viewer)
3. Coexist with existing WeChat wx.login() — WeChat users auto-register as Viewer
4. Admin-only user management (CRUD)
5. Support dark/light theme and i18n in all new UI

## Database Schema

### users table changes

| Column | Current type | New type | Notes |
|--------|-------------|----------|-------|
| `openid` | `VARCHAR(128) UNIQUE NOT NULL` | `VARCHAR(128) UNIQUE` | Made nullable for password-only users |
| `username` | — | `VARCHAR(50) UNIQUE` | New, nullable for WeChat-only users |
| `password_hash` | — | `VARCHAR(255)` | New, bcrypt hash, nullable for WeChat-only users |
| `role` | `VARCHAR(20) DEFAULT 'member'` | `VARCHAR(20) DEFAULT 'viewer'` | Constrained to `admin`, `operator`, `viewer` |

A user must have **either** `openid` or `username` (enforced at application level).

Existing WeChat users keep their `openid` and are automatically assigned `role = 'viewer'` on next login.

### Migration

```sql
ALTER TABLE users ALTER COLUMN openid DROP NOT NULL;
ALTER TABLE users ADD COLUMN username VARCHAR(50) UNIQUE;
ALTER TABLE users ADD COLUMN password_hash VARCHAR(255);
CREATE INDEX idx_users_username ON users(username);
```

Also update existing `role` default:
```sql
ALTER TABLE users ALTER COLUMN role SET DEFAULT 'viewer';
UPDATE users SET role = 'viewer' WHERE role = 'member';
```

## Backend API

### Route Structure

**Public group** (no auth):

| Method | Path | Handler | Description |
|--------|------|---------|-------------|
| POST | `/api/auth/login` | `handlePasswordLogin` | username + password → JWT |
| POST | `/api/auth/wechat` | `handleWechatLogin` | wx.code → openid → JWT (creates viewer if new) |
| GET | `/api/health` | (existing) | Health check |

**Protected group** (AuthMiddleware validates JWT):

| Method | Path | Min role | Description |
|--------|------|----------|-------------|
| GET | `/api/auth/profile` | viewer | Current user info |
| PUT | `/api/auth/password` | viewer | Change own password |
| GET/POST/PUT/DELETE | `/api/accounts/...` | operator | Cloud account CRUD |
| POST | `/api/accounts/:id/sync` | operator | Sync account |
| GET/POST | `/api/resources/...` | viewer | Resource listing/detail |
| POST | `/api/resources/:id/start\|stop\|restart` | operator | Resource actions |
| GET/POST | `/api/agent/...` | viewer | Agent chat/sessions |
| POST | `/api/agent/execute` | operator | Execute agent plans |
| PUT | `/api/agent/config` | admin | Agent config |
| GET/POST/PUT/DELETE | `/api/admin/users` | admin | Admin user management |
| GET/POST | `/api/teams/...` | viewer | Team listing/membership |
| POST | `/api/terraform/templates` | operator | Terraform templates |
| POST | `/api/terraform/templates/:id/plan\|apply` | operator | Terraform execution |

### Auth Endpoints Detail

#### POST /api/auth/login

Request: `{"username": "admin", "password": "Test@20181025"}`
Response 200: `{"token": "eyJ...", "user": {"id": "uuid", "username": "admin", "nickname": "admin", "role": "admin"}}`
Response 401: `{"error": "invalid username or password"}`

#### POST /api/auth/wechat

Request: `{"code": "wx-code"}`
Response 200: `{"token": "eyJ...", "user": {"id": "uuid", "openid": "...", "nickname": "...", "role": "viewer"}}`
Response 401: `{"error": "wechat login failed"}`

Flow: Gets `openid` from WeChat API -> looks up user by `openid`. If found: updates `nickname`/`avatar_url`, returns JWT. If not found: creates new user with `role = 'viewer'`, returns JWT.

#### GET /api/auth/profile

Headers: `Authorization: Bearer <token>`
Response 200: `{"id": "uuid", "username": "admin", "nickname": "admin", "role": "admin", "avatar_url": "...", "created_at": "..."}`

#### PUT /api/auth/password

Request: `{"old_password": "...", "new_password": "..."}`
Response 200: `{"message": "password updated"}`

#### GET /api/admin/users

Response 200: `{"users": [{"id": "...", "username": "...", "nickname": "...", "role": "...", "created_at": "..."}]}`

#### POST /api/admin/users

Request: `{"username": "newuser", "password": "P@ssw0rd", "nickname": "New User", "role": "operator"}`
Response 201: `{"user": {"id": "...", "username": "newuser", "role": "operator"}}`

#### PUT /api/admin/users/:id

Request: `{"role": "viewer"}` (partial — only role can be changed for existing users)
Response 200: `{"message": "user updated"}`

#### DELETE /api/admin/users/:id

Response 200: `{"message": "user deleted"}`

Cannot delete self — returns 400 `{"error": "cannot delete yourself"}`.

### JWT Details

**Claims:**
```go
type Claims struct {
    UserID   string `json:"sub"`
    Username string `json:"username"`
    Role     string `json:"role"`
    jwt.RegisteredClaims
}
```

**Expiry:** 72 hours (configurable via `JWT_EXPIRY_HOURS` env var, default 72).
**Signing:** HMAC-SHA256 with `JWT_SECRET` from config.

### Middleware Chain

1. **AuthMiddleware**: Parses `Authorization: Bearer <token>`, validates JWT signature and expiry, sets `c.Set("user", &Claims)`, calls `c.Next()`. Rejects with 401 if invalid/missing token.

2. **RBACMiddleware(roles...string)**: Extracts `Claims` from context, checks if `claims.Role` is in the allowed roles list. Rejects with 403 if unauthorized.

Route setup:
```go
api := router.Group("/api")
public := api.Group("/")
// public routes (no middleware)
{
    public.POST("/auth/login", handlePasswordLogin)
    public.POST("/auth/wechat", handleWechatLogin)
    public.GET("/health", healthHandler)
}

protected := api.Group("/")
protected.Use(AuthMiddleware(cfg.JWTSecret))
{
    protected.GET("/auth/profile", profileH.Get)
    protected.PUT("/auth/password", profileH.UpdatePassword)

    // viewer-level routes
    protected.GET("/resources", resourcesH.List)
    protected.GET("/teams", teamsH.ListTeams)
    // ...

    // operator+ routes
    operatorOnly := protected.Group("/")
    operatorOnly.Use(RBACMiddleware("admin", "operator"))
    {
        operatorOnly.POST("/accounts", accountsH.Add)
        operatorOnly.POST("/resources/:id/start", resourcesH.Start)
        // ...
    }

    // admin-only routes
    adminOnly := protected.Group("/admin")
    adminOnly.Use(RBACMiddleware("admin"))
    {
        adminOnly.GET("/users", usersH.List)
        adminOnly.POST("/users", usersH.Create)
        adminOnly.PUT("/users/:id", usersH.Update)
        adminOnly.DELETE("/users/:id", usersH.Delete)
    }
}
```

### Password Policy

- Minimum 8 characters (validated on both frontend and backend)
- Any combination of characters (no complexity requirements enforced by backend, but frontend may suggest strong passwords)
- Hashed with bcrypt using `golang.org/x/crypto/bcrypt` (cost factor: 10)
- Initial admin user `admin` / `Test@20181025` seeded in migration

## Mini Program

### New Pages

1. **`/pages/login/login`**
   - Username input, password input (type="password"), login button
   - Secondary "WeChat Login" button
   - Error message display
   - On success: `wx.setStorageSync('token', token)`, navigate to home (switchTab)
   - Theme support via `class="{{theme}}-theme"`
   - i18n support for all labels

2. **`/pages/admin/users/users`** (admin only)
   - User list with cards/rows
   - Create user form (username, password, role selector)
   - Role edit dropdown per user
   - Delete user with confirmation dialog
   - Theme and i18n support

### Auth Guard

In `app.js`:
- On app start: check `wx.getStorageSync('token')`
- If token exists: call `GET /api/auth/profile`
- If valid (200): store user info in `globalData.currentUser`, proceed to home
- If invalid (non-200) or no token: redirect to `/pages/login/login`
- On any API 401: clear token, redirect to login

### Profile Page Updates

Existing `/pages/user/profile.js`:
- Show role badge (admin = red, operator = blue, viewer = green) next to nickname
- Add "User Management" navigation item (visible only when role === admin)
- Logout: clear token + user from storage, navigate to login page

### API Helper Updates

In `utils/api.js`:
- All requests add `Authorization: Bearer <token>` from storage
- On 401 response: auto-clear token, call app-level redirect to login

## Role Permissions Matrix

| Resource | Viewer | Operator | Admin |
|----------|--------|----------|-------|
| View cloud accounts | ✅ | ✅ | ✅ |
| Create/update/delete accounts | — | ✅ | ✅ |
| View resources | ✅ | ✅ | ✅ |
| Start/stop/restart resources | — | ✅ | ✅ |
| Use AI Agent chat | ✅ | ✅ | ✅ |
| Execute AI Agent plans | — | ✅ | ✅ |
| AI Agent config | — | — | ✅ |
| View teams | ✅ | ✅ | ✅ |
| Create/update teams | — | — | ✅ |
| Manage users | — | — | ✅ |
| View own profile | ✅ | ✅ | ✅ |
| Change own password | ✅ | ✅ | ✅ |

## Files Changed

### Backend (7 files)

| File | Action |
|------|--------|
| `backend/internal/api/routes.go` | Restructure public/protected groups, add RBAC per group |
| `backend/internal/api/auth.go` | NEW — password login, WeChat login, JWT generation |
| `backend/internal/api/auth_middleware.go` | NEW — AuthMiddleware, RBACMiddleware |
| `backend/internal/api/users_handler.go` | NEW — admin user CRUD, own profile handler |
| `backend/internal/services/database.go` | Add migration: alter users table (openid nullable, add username/password_hash), seed admin user |
| `backend/config/config.go` | Add JWTExpiryHours config field |

### Miniprogram (8 files)

| File | Action |
|------|--------|
| `miniprogram/pages/login/login.wxml` | NEW — login page template |
| `miniprogram/pages/login/login.wxss` | NEW — login page styles |
| `miniprogram/pages/login/login.js` | NEW — login page logic |
| `miniprogram/pages/login/login.json` | NEW — login page config |
| `miniprogram/pages/admin/users/users.wxml` | NEW — user management page |
| `miniprogram/pages/admin/users/users.js` | NEW — user management logic |
| `miniprogram/pages/admin/users/users.wxss` | NEW — user management styles |
| `miniprogram/pages/admin/users/users.json` | NEW — user management config |
| `miniprogram/app.js` | Update login flow: change wx.login() POST from `/auth/login` to `/auth/wechat`; add auth guard on startup |
| `miniprogram/app.json` | Add login and admin/users pages |
| `miniprogram/utils/api.js` | Add auth token header, 401 handling |
| `miniprogram/utils/i18n.js` | Add login/auth translation keys |
| `miniprogram/pages/user/profile.js` | Add role display, admin link |
| `miniprogram/pages/user/profile.wxml` | Add role badge, user management link |
| `miniprogram/pages/user/profile.wxss` | Add role badge styles |

## Implementation Order

1. Backend: schema migration (database.go) + seed admin user
2. Backend: JWT + middleware (auth_middleware.go)
3. Backend: auth handlers — password login, WeChat login (auth.go)
4. Backend: user handlers — profile, change password, admin CRUD (users_handler.go)
5. Backend: routes restructure with RBAC (routes.go)
6. Miniprogram: login page
7. Miniprogram: auth guard in app.js + api.js updates
8. Miniprogram: user management page (admin)
9. Miniprogram: profile page updates
10. Miniprogram: i18n keys for login/auth
11. Test: manual test in DevTools GUI simulator
