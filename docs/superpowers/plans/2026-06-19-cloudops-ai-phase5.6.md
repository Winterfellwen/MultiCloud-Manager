# CloudOps AI Phase 5.6 — 用户管理 + 审计日志 + 总览 Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 填充 Phase 5.2 的占位页面，实现用户管理页（列表/角色分配/删除/创建）、审计日志页（列表/筛选/分页）、总览 Dashboard（统计卡片 + 聚合数据）。

**Architecture:** 在 web-console 项目中新增 API 调用层（users.ts/audit.ts）、React Query hooks、类型定义。Dashboard 通过并行调用 cloud/monitor 接口聚合数据（后端无专门聚合接口）。各页面使用 TanStack React Query 管理服务端状态，shadcn/ui 风格组件构建 UI。

**Tech Stack:** React 18 / TypeScript / TanStack React Query / Tailwind CSS / lucide-react

**Spec:** `docs/superpowers/specs/2026-06-19-cloudops-ai-phase5-design.md`

**后端对接要点（来自 API 调研）：**
- 用户列表 `GET /users/` → `UserRow[]`（无分页，一次性返回全部，不含 passwordHash/apiKey）
- 用户详情 `GET /users/:id` → `UserRow`
- 更新角色 `PATCH /users/:id/role` → `{ok: true}`（无 body 校验，前端需保证 role 合法）
- 删除用户 `DELETE /users/:id` → `{ok: true}`
- 创建用户 `POST /auth/register` → `{id, username, role}`（公开接口，body: username/email?/password/role?）
- 审计日志 `GET /audit/` → `AuditLogRow[]`（query: userId/action/provider/startDate/endDate/limit/offset，按 timestamp DESC 排序，无 total）
- **无专门 Dashboard 聚合接口**，前端需并行调用：
  - `GET /cloud/instances/` → 按 status 统计
  - `GET /monitor/alerts/events?status=firing` → count
  - `GET /monitor/costs/summary?start=<月初>&end=<今日>` → sum

---

## 文件结构总览

```
web-console/src/
├── types/
│   ├── user.ts                      # 用户类型
│   └── audit.ts                     # 审计日志类型
├── api/
│   ├── users.ts                     # /users/* + /auth/register
│   └── audit.ts                     # /audit/*
├── hooks/
│   ├── useUsers.ts                  # 用户 CRUD hooks
│   ├── useAudit.ts                  # 审计日志 hooks
│   └── useDashboard.ts              # Dashboard 聚合 hooks
├── pages/
│   ├── Dashboard.tsx                # 总览（替换占位）
│   ├── Users.tsx                    # 用户管理（替换占位）
│   └── Audit.tsx                    # 审计日志（替换占位）
```

---

## Task 1: 类型定义 + API 调用层

**Files:**
- `web-console/src/types/user.ts`
- `web-console/src/types/audit.ts`
- `web-console/src/api/users.ts`
- `web-console/src/api/audit.ts`

- [ ] **Step 1: 创建 src/types/user.ts**

```typescript
import type { UserRole } from './auth';

/** 用户列表/详情接口返回结构 */
export interface UserRow {
  id: string;
  username: string;
  email: string | null;
  role: UserRole;
  createdAt: string;
  lastLoginAt: string | null;
}

/** 创建用户参数（POST /auth/register） */
export interface CreateUserParams {
  username: string;
  email?: string;
  password: string;
  role?: UserRole;
}

/** 创建用户响应 */
export interface CreateUserResponse {
  id: string;
  username: string;
  role: UserRole;
}

/** 更新角色参数（PATCH /users/:id/role） */
export interface UpdateRoleParams {
  role: UserRole;
}

/** 角色中文标签映射 */
export const ROLE_LABELS: Record<UserRole, string> = {
  admin: '管理员',
  ops_manager: '运维经理',
  ops_engineer: '运维工程师',
  viewer: '只读用户',
};
```

- [ ] **Step 2: 创建 src/types/audit.ts**

```typescript
/** 审计日志查询参数 */
export interface AuditLogQuery {
  userId?: string;
  action?: string;
  provider?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

/** 审计日志行 */
export interface AuditLogRow {
  id: string;
  timestamp: string;
  userId: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  provider: string | null;
  region: string | null;
  params: Record<string, unknown> | null;
  result: 'success' | 'failure';
  ip: string | null;
  traceId: string | null;
}

/** 审计结果标签 */
export const RESULT_LABELS: Record<'success' | 'failure', string> = {
  success: '成功',
  failure: '失败',
};
```

- [ ] **Step 3: 创建 src/api/users.ts**

```typescript
import { apiGet, apiPost, apiPatch, apiDelete } from './client';
import type { UserRow, CreateUserParams, CreateUserResponse, UpdateRoleParams } from '../types/user';

export const usersApi = {
  list: () => apiGet<UserRow[]>('/users/'),
  detail: (id: string) => apiGet<UserRow>(`/users/${id}`),
  updateRole: (id: string, params: UpdateRoleParams) =>
    apiPatch<{ ok: boolean }>(`/users/${id}/role`, params),
  delete: (id: string) => apiDelete<{ ok: boolean }>(`/users/${id}`),
  create: (params: CreateUserParams) =>
    apiPost<CreateUserResponse>('/auth/register', params),
};
```

- [ ] **Step 4: 创建 src/api/audit.ts**

```typescript
import { apiGet } from './client';
import type { AuditLogQuery, AuditLogRow } from '../types/audit';

export const auditApi = {
  list: (query?: AuditLogQuery) => {
    const params = new URLSearchParams();
    if (query?.userId) params.set('userId', query.userId);
    if (query?.action) params.set('action', query.action);
    if (query?.provider) params.set('provider', query.provider);
    if (query?.startDate) params.set('startDate', query.startDate);
    if (query?.endDate) params.set('endDate', query.endDate);
    if (query?.limit) params.set('limit', String(query.limit));
    if (query?.offset) params.set('offset', String(query.offset));
    const qs = params.toString();
    return apiGet<AuditLogRow[]>(`/audit/${qs ? `?${qs}` : ''}`);
  },
};
```

- [ ] **Step 5: 确认 api/client.ts 导出 apiPatch/apiDelete**

检查 `web-console/src/api/client.ts` 是否已导出 `apiPatch` 和 `apiDelete`，若无则补充。

---

## Task 2: 用户管理页

**Files:**
- `web-console/src/hooks/useUsers.ts`
- `web-console/src/pages/Users.tsx`

- [ ] **Step 1: 创建 src/hooks/useUsers.ts**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../api/users';
import type { CreateUserParams, UpdateRoleParams } from '../types/user';

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => usersApi.list(),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateUserParams) => usersApi.create(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, params }: { id: string; params: UpdateRoleParams }) =>
      usersApi.updateRole(id, params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => usersApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['users'] }),
  });
}
```

- [ ] **Step 2: 创建 src/pages/Users.tsx（替换占位）**

用户管理页：用户列表表格 + 创建用户对话框 + 角色分配（下拉选择）+ 删除（二次确认）。

功能：
- 表格列：用户名 / 邮箱 / 角色（可编辑下拉）/ 创建时间 / 最后登录 / 操作（删除）
- 创建用户对话框：用户名 / 邮箱 / 密码 / 角色
- 删除二次确认
- 当前登录用户不可删除自己
- 角色变更立即生效（onChange 触发 mutation）

---

## Task 3: 审计日志页

**Files:**
- `web-console/src/hooks/useAudit.ts`
- `web-console/src/pages/Audit.tsx`

- [ ] **Step 1: 创建 src/hooks/useAudit.ts**

```typescript
import { useQuery } from '@tanstack/react-query';
import { auditApi } from '../api/audit';
import type { AuditLogQuery } from '../types/audit';

export function useAuditLogs(query: AuditLogQuery) {
  return useQuery({
    queryKey: ['audit', query],
    queryFn: () => auditApi.list(query),
  });
}
```

- [ ] **Step 2: 创建 src/pages/Audit.tsx（替换占位）**

审计日志页：筛选栏 + 日志表格 + 分页。

功能：
- 筛选栏：操作类型（input）/ 云厂商（select: aliyun/aws/azure）/ 日期范围（startDate/endDate）/ 查询按钮
- 表格列：时间 / 用户ID / 操作 / 资源类型 / 云厂商 / 区域 / 结果（success/failure 徽章）/ IP
- 分页：上一页/下一页（基于 limit=20 + offset）
- params 字段可展开查看（JSON）

---

## Task 4: Dashboard 总览页

**Files:**
- `web-console/src/hooks/useDashboard.ts`
- `web-console/src/pages/Dashboard.tsx`

- [ ] **Step 1: 创建 src/hooks/useDashboard.ts**

并行调用 cloud/monitor 接口聚合 Dashboard 数据。

```typescript
import { useQuery } from '@tanstack/react-query';
import { cloudApi } from '../api/cloud';
import { monitorApi } from '../api/monitor';

export function useDashboardStats() {
  return useQuery({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      const [instances, firingAlerts, costSummary] = await Promise.allSettled([
        cloudApi.list({ limit: 1000 }),
        monitorApi.listAlertEvents({ status: 'firing', limit: 1000 }),
        monitorApi.getCostSummary({
          start: monthStart.toISOString(),
          end: monthEnd.toISOString(),
        }),
      ]);

      const instanceList = instances.status === 'fulfilled' ? instances.value : [];
      const alerts = firingAlerts.status === 'fulfilled' ? firingAlerts.value : [];
      const costs = costSummary.status === 'fulfilled' ? costSummary.value : [];

      const totalInstances = instanceList.length;
      const runningInstances = instanceList.filter((i) => i.status === 'running').length;
      const alertCount = alerts.length;
      const monthlyCost = costs.reduce((sum, c) => sum + (c.totalCost || 0), 0);

      // 按云厂商分组
      const byProvider: Record<string, number> = {};
      for (const inst of instanceList) {
        byProvider[inst.provider] = (byProvider[inst.provider] || 0) + 1;
      }

      return {
        totalInstances,
        runningInstances,
        alertCount,
        monthlyCost,
        byProvider,
        errors: {
          instances: instances.status === 'rejected',
          alerts: firingAlerts.status === 'rejected',
          costs: costSummary.status === 'rejected',
        },
      };
    },
    staleTime: 60_000,
  });
}
```

- [ ] **Step 2: 创建 src/pages/Dashboard.tsx（替换占位）**

Dashboard 页：4 个统计卡片 + 云厂商分布 + 最近告警。

功能：
- 4 个统计卡片：总实例数 / 运行中 / 告警数 / 本月费用（带 loading 和 error 状态）
- 云厂商分布：横向条形图或简单列表（按 provider 分组计数）
- 数据加载失败时显示错误提示，不影响其他卡片

---

## Task 5: 端到端验证 + commit

- [ ] **Step 1: TypeScript 编译检查**

```bash
cd web-console && pnpm exec tsc --noEmit
```

- [ ] **Step 2: 生产构建**

```bash
cd web-console && pnpm build
```

- [ ] **Step 3: commit**

```bash
git add -A && git commit -m "feat(web-console): Phase 5.6 用户管理 + 审计日志 + Dashboard 总览

- 新增用户类型定义（types/user.ts）和审计日志类型（types/audit.ts）
- 新增用户 API 层（api/users.ts）：列表/详情/角色更新/删除/创建
- 新增审计日志 API 层（api/audit.ts）：列表查询（支持筛选/分页）
- 新增 React Query hooks：useUsers/useAudit/useDashboard
- 实现用户管理页：列表 + 角色分配 + 删除 + 创建用户对话框
- 实现审计日志页：筛选栏 + 日志表格 + 分页
- 实现 Dashboard 总览页：统计卡片 + 云厂商分布（并行聚合 cloud/monitor 数据）"
```

---

## 验收标准

1. ✅ TypeScript 编译无错误
2. ✅ 生产构建成功
3. ✅ 用户管理页：列表展示、角色切换、删除、创建用户
4. ✅ 审计日志页：筛选查询、分页、结果徽章
5. ✅ Dashboard：4 个统计卡片正确显示、云厂商分布
6. ✅ 权限控制：非 admin 角色无法访问用户管理和审计日志
