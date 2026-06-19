# CloudOps AI Phase 5.3 — 业务页面（云资源 + 监控告警 + 成本分析）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 填充 Phase 5.2 的占位页面，实现云资源管理页（实例列表/筛选/创建/操作）、监控告警页（规则/事件/通知渠道）、成本分析页（汇总/分解/趋势）。

**Architecture:** 在 web-console 项目中新增 API 调用层（cloud.ts/monitor.ts）、React Query hooks、类型定义、表格组件、对话框组件、状态徽章组件。各页面使用 TanStack React Query 管理服务端状态，shadcn/ui 风格组件构建 UI。

**Tech Stack:** React 18 / TypeScript / TanStack React Query / TanStack Table（轻量版，手写表格）/ Tailwind CSS / lucide-react

**Spec:** `docs/superpowers/specs/2026-06-19-cloudops-ai-phase5-design.md`

**后端对接要点（来自 API 调研）：**
- 实例列表 `GET /cloud/instances/` → `InstanceRow[]`（monthlyCost 为 string，需 parseFloat）
- 创建实例 `POST /cloud/instances/` → `Instance`（嵌套 spec，monthlyCost 为 number）
- 实例操作 `POST /cloud/instances/:id/{start|stop|reboot}` → `{ok, id, status}`
- 告警规则 `GET/POST/PUT/DELETE /monitor/alerts/rules`
- 告警事件 `GET /monitor/alerts/events` → `AlertEventRow[]`
- 通知渠道 `GET/POST/DELETE /monitor/alerts/channels`
- 成本汇总 `GET /monitor/costs/summary` → `CostSummaryItem[]`（按 provider/service/currency 分组）
- 实例成本 `GET /monitor/costs/instances` → `InstanceCostRow[]`（monthlyCost 为 string）
- 日期字段均为 ISO 8601 字符串
- 无统一分页包装，列表直接返回数组

---

## 文件结构总览

```
web-console/src/
├── types/
│   ├── cloud.ts                    # 云资源类型
│   └── monitor.ts                  # 监控告警/成本类型
├── api/
│   ├── cloud.ts                    # /cloud/* 接口
│   └── monitor.ts                  # /monitor/* 接口
├── hooks/
│   ├── useInstances.ts             # 实例 CRUD hooks
│   ├── useAlerts.ts                # 告警规则/事件 hooks
│   ├── useChannels.ts              # 通知渠道 hooks
│   └── useCosts.ts                 # 成本 hooks
├── components/
│   ├── ui/
│   │   ├── badge.tsx               # 状态徽章
│   │   ├── dialog.tsx              # 对话框
│   │   ├── select.tsx              # 下拉选择
│   │   └── table.tsx               # 表格基础组件
│   └── StatusBadge.tsx             # 实例/告警状态徽章
├── pages/
│   ├── Instances.tsx               # 云资源管理（替换占位）
│   ├── InstanceDetail.tsx          # 实例详情（新增）
│   ├── Monitor.tsx                 # 监控告警（替换占位）
│   └── Costs.tsx                   # 成本分析（替换占位）
```

---

## Task 1: 类型定义 + API 调用层

**Files:**
- `web-console/src/types/cloud.ts`
- `web-console/src/types/monitor.ts`
- `web-console/src/api/cloud.ts`
- `web-console/src/api/monitor.ts`

- [ ] **Step 1: 创建 src/types/cloud.ts**

```typescript
export type InstanceStatus = 'running' | 'stopped' | 'terminated' | 'pending' | 'error';
export type CloudProvider = 'aws' | 'aliyun' | 'azure';

/** 实例列表/详情接口返回的行结构（monthlyCost 为 string） */
export interface InstanceRow {
  id: string;
  provider: string;
  providerInstanceId: string;
  name: string | null;
  region: string;
  status: InstanceStatus;
  cpu: number | null;
  memoryMb: number | null;
  diskGb: number | null;
  publicIp: string | null;
  privateIp: string | null;
  monthlyCost: string | null;
  tags: Record<string, string> | null;
  lastSyncedAt: string | null;
  createdAt: string | null;
  cloudAccountId: string | null;
}

/** 创建实例请求体 */
export interface CreateInstanceParams {
  provider: string;
  region: string;
  name: string;
  imageId: string;
  instanceType: string;
  subnetId?: string;
  securityGroupIds?: string[];
  tags?: Record<string, string>;
}

/** 创建实例返回的 Instance 结构（嵌套 spec，monthlyCost 为 number） */
export interface Instance {
  id: string;
  provider: string;
  providerInstanceId: string;
  name: string;
  region: string;
  status: InstanceStatus;
  spec: {
    cpu: number;
    memoryMb: number;
    diskGb: number;
  };
  publicIp: string | null;
  privateIp: string | null;
  monthlyCost: number;
  tags: Record<string, string>;
  lastSyncedAt: string;
  createdAt: string;
}

/** 实例操作响应 */
export interface InstanceActionResponse {
  ok: true;
  id: string;
  status: InstanceStatus;
}

/** 实例列表查询参数 */
export interface ListInstancesParams {
  provider?: string;
  region?: string;
  status?: InstanceStatus;
  limit?: number;
  offset?: number;
}

/** Provider 信息 */
export interface ProviderRegion {
  id: string;
  name: string;
  displayName: string;
}

export interface ProviderImage {
  id: string;
  name: string;
  description?: string;
}

export interface ProviderInstanceType {
  id: string;
  name: string;
  cpu: number;
  memoryMb: number;
  diskGb?: number;
}

/** 云账号 */
export interface CloudAccount {
  id: string;
  name: string;
  provider: CloudProvider;
  config: Record<string, unknown>;
  status: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 同步结果 */
export interface SyncResult {
  provider: string;
  synced: number;
  errors: string[];
}
```

- [ ] **Step 2: 创建 src/types/monitor.ts**

```typescript
export type AlertSeverity = 'info' | 'warning' | 'critical' | 'emergency';
export type AlertStatus = 'firing' | 'resolved' | 'silenced';
export type AlertActionType = 'notify' | 'suggest' | 'auto';
export type ChannelType = 'webhook' | 'email' | 'slack';

/** 告警规则 */
export interface AlertRule {
  id: string;
  name: string;
  metric: string;
  condition: string;
  duration: string;
  severity: AlertSeverity;
  actions: AlertAction[];
  enabled: boolean;
  createdAt: string;
}

export interface AlertAction {
  type: AlertActionType;
  targets: string[];
}

export interface CreateAlertRuleParams {
  name: string;
  metric: string;
  condition: string;
  duration: string;
  severity: AlertSeverity;
  actions: AlertAction[];
  enabled?: boolean;
}

export type UpdateAlertRuleParams = Partial<CreateAlertRuleParams>;

/** 告警事件 */
export interface AlertEvent {
  id: string;
  ruleId: string | null;
  instanceId: string | null;
  severity: AlertSeverity;
  message: string;
  status: AlertStatus;
  firedAt: string;
  resolvedAt: string | null;
}

export interface ListAlertEventsParams {
  status?: AlertStatus;
  severity?: AlertSeverity;
  limit?: number;
}

/** 通知渠道 */
export interface NotificationChannel {
  id: string;
  name: string;
  type: ChannelType;
  config: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
}

export interface CreateChannelParams {
  name: string;
  type: ChannelType;
  config: Record<string, unknown>;
  enabled?: boolean;
}

/** 成本汇总项 */
export interface CostSummaryItem {
  provider: string;
  service: string;
  totalAmount: number;
  currency: string;
}

export interface CostSummaryParams {
  provider?: string;
  start?: string;
  end?: string;
}

/** 实例成本 */
export interface InstanceCost {
  id: string;
  name: string | null;
  provider: string;
  region: string;
  monthlyCost: string | null;
}

/** 指标数据 */
export interface MetricData {
  id: string;
  instanceId: string;
  metricName: string;
  value: string;
  unit: string | null;
  recordedAt: string;
  createdAt: string;
}
```

- [ ] **Step 3: 创建 src/api/cloud.ts**

```typescript
import { api } from './client';
import type {
  InstanceRow,
  CreateInstanceParams,
  Instance,
  InstanceActionResponse,
  ListInstancesParams,
  ProviderRegion,
  ProviderImage,
  ProviderInstanceType,
  CloudAccount,
  SyncResult,
} from '@/types/cloud';

export const cloudApi = {
  // 实例管理
  listInstances: (params?: ListInstancesParams) => {
    const query = new URLSearchParams();
    if (params?.provider) query.set('provider', params.provider);
    if (params?.region) query.set('region', params.region);
    if (params?.status) query.set('status', params.status);
    if (params?.limit) query.set('limit', String(params.limit));
    if (params?.offset) query.set('offset', String(params.offset));
    const qs = query.toString();
    return api.get<InstanceRow[]>(`/cloud/instances/${qs ? '?' + qs : ''}`);
  },

  getInstance: (id: string) => api.get<InstanceRow>(`/cloud/instances/${id}`),

  createInstance: (params: CreateInstanceParams) =>
    api.post<Instance>('/cloud/instances/', params),

  startInstance: (id: string) =>
    api.post<InstanceActionResponse>(`/cloud/instances/${id}/start`),

  stopInstance: (id: string) =>
    api.post<InstanceActionResponse>(`/cloud/instances/${id}/stop`),

  rebootInstance: (id: string) =>
    api.post<InstanceActionResponse>(`/cloud/instances/${id}/reboot`),

  deleteInstance: (id: string) =>
    api.delete<{ ok: true; id: string }>(`/cloud/instances/${id}`),

  syncInstances: (provider?: string) =>
    api.post<SyncResult[]>(`/cloud/instances/sync${provider ? '?provider=' + provider : ''}`),

  // Provider 信息
  getProviders: () => api.get<{ providers: string[] }>('/cloud/providers/'),

  getRegions: (provider: string) =>
    api.get<ProviderRegion[]>(`/cloud/providers/${provider}/regions`),

  getImages: (provider: string) =>
    api.get<ProviderImage[]>(`/cloud/providers/${provider}/images`),

  getInstanceTypes: (provider: string, region: string) =>
    api.get<ProviderInstanceType[]>(`/cloud/providers/${provider}/instance-types/${region}`),

  // 云账号
  listAccounts: () => api.get<CloudAccount[]>('/cloud/accounts/'),

  createAccount: (params: { name: string; provider: string; config: Record<string, unknown> }) =>
    api.post<CloudAccount>('/cloud/accounts/', params),

  deleteAccount: (id: string) => api.delete<{ ok: true; id: string }>(`/cloud/accounts/${id}`),
};
```

- [ ] **Step 4: 创建 src/api/monitor.ts**

```typescript
import { api } from './client';
import type {
  AlertRule,
  CreateAlertRuleParams,
  UpdateAlertRuleParams,
  AlertEvent,
  ListAlertEventsParams,
  NotificationChannel,
  CreateChannelParams,
  CostSummaryItem,
  CostSummaryParams,
  InstanceCost,
  MetricData,
} from '@/types/monitor';

export const monitorApi = {
  // 告警规则
  listRules: () => api.get<AlertRule[]>('/monitor/alerts/rules'),

  createRule: (params: CreateAlertRuleParams) =>
    api.post<AlertRule>('/monitor/alerts/rules', params),

  updateRule: (id: string, params: UpdateAlertRuleParams) =>
    api.put<AlertRule>(`/monitor/alerts/rules/${id}`, params),

  deleteRule: (id: string) =>
    api.delete<{ ok: true; id: string }>(`/monitor/alerts/rules/${id}`),

  // 告警事件
  listEvents: (params?: ListAlertEventsParams) => {
    const query = new URLSearchParams();
    if (params?.status) query.set('status', params.status);
    if (params?.severity) query.set('severity', params.severity);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return api.get<AlertEvent[]>(`/monitor/alerts/events${qs ? '?' + qs : ''}`);
  },

  resolveEvent: (id: string) =>
    api.post<{ ok: true; id: string; status: 'resolved' }>(`/monitor/alerts/events/${id}/resolve`),

  // 通知渠道
  listChannels: () => api.get<NotificationChannel[]>('/monitor/alerts/channels'),

  createChannel: (params: CreateChannelParams) =>
    api.post<NotificationChannel>('/monitor/alerts/channels', params),

  deleteChannel: (id: string) =>
    api.delete<{ ok: true; id: string }>(`/monitor/alerts/channels/${id}`),

  // 成本
  getCostSummary: (params?: CostSummaryParams) => {
    const query = new URLSearchParams();
    if (params?.provider) query.set('provider', params.provider);
    if (params?.start) query.set('start', params.start);
    if (params?.end) query.set('end', params.end);
    const qs = query.toString();
    return api.get<CostSummaryItem[]>(`/monitor/costs/summary${qs ? '?' + qs : ''}`);
  },

  getInstanceCosts: () => api.get<InstanceCost[]>('/monitor/costs/instances'),

  collectCosts: () => api.post<{ ok: true; message: string }>('/monitor/costs/collect'),

  // 指标
  getMetrics: (instanceId: string, params?: { metric?: string; start?: string; end?: string; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.metric) query.set('metric', params.metric);
    if (params?.start) query.set('start', params.start);
    if (params?.end) query.set('end', params.end);
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return api.get<MetricData[]>(`/monitor/metrics/${instanceId}${qs ? '?' + qs : ''}`);
  },
};
```

---

## Task 2: 基础 UI 组件（badge/dialog/select/table）

**Files:**
- `web-console/src/components/ui/badge.tsx`
- `web-console/src/components/ui/dialog.tsx`
- `web-console/src/components/ui/select.tsx`
- `web-console/src/components/ui/table.tsx`

- [ ] **Step 1: 创建 badge.tsx**

```typescript
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
        success: 'border-transparent bg-green-500 text-white',
        warning: 'border-transparent bg-yellow-500 text-white',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
```

- [ ] **Step 2: 创建 dialog.tsx**

简化版对话框（基于 fixed 定位，不依赖 Radix Dialog 以减少依赖）。

```typescript
import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

export function Dialog({ open, onClose, title, description, children, className }: DialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div
        className={cn(
          'relative z-50 w-full max-w-lg rounded-lg border bg-card p-6 shadow-lg max-h-[90vh] overflow-y-auto',
          className
        )}
      >
        {title && <h2 className="text-lg font-semibold mb-1">{title}</h2>}
        {description && <p className="text-sm text-muted-foreground mb-4">{description}</p>}
        <Button
          variant="ghost"
          size="icon"
          className="absolute right-4 top-4"
          onClick={onClose}
        >
          <X className="h-4 w-4" />
        </Button>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 创建 select.tsx**

原生 select 封装（避免引入 Radix Select 的复杂性）。

```typescript
import * as React from 'react';
import { cn } from '@/lib/utils';

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, children, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        {...props}
      >
        {children}
      </select>
    );
  }
);
Select.displayName = 'Select';

export { Select };
```

- [ ] **Step 4: 创建 table.tsx**

```typescript
import * as React from 'react';
import { cn } from '@/lib/utils';

const Table = React.forwardRef<HTMLTableElement, React.HTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="relative w-full overflow-auto">
      <table ref={ref} className={cn('w-full caption-bottom text-sm', className)} {...props} />
    </div>
  )
);
Table.displayName = 'Table';

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead ref={ref} className={cn('[&_tr]:border-b', className)} {...props} />
  )
);
TableHeader.displayName = 'TableHeader';

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody ref={ref} className={cn('[&_tr:last-child]:border-0', className)} {...props} />
  )
);
TableBody.displayName = 'TableBody';

const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn('border-b transition-colors hover:bg-muted/50', className)}
      {...props}
    />
  )
);
TableRow.displayName = 'TableRow';

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn('h-10 px-2 text-left align-middle font-medium text-muted-foreground', className)}
      {...props}
    />
  )
);
TableHead.displayName = 'TableHead';

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td ref={ref} className={cn('p-2 align-middle', className)} {...props} />
  )
);
TableCell.displayName = 'TableCell';

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };
```

---

## Task 3: 状态徽章组件 + React Query Hooks

**Files:**
- `web-console/src/components/StatusBadge.tsx`
- `web-console/src/hooks/useInstances.ts`
- `web-console/src/hooks/useAlerts.ts`
- `web-console/src/hooks/useChannels.ts`
- `web-console/src/hooks/useCosts.ts`

- [ ] **Step 1: 创建 src/components/StatusBadge.tsx**

```typescript
import { Badge } from '@/components/ui/badge';
import type { InstanceStatus } from '@/types/cloud';
import type { AlertSeverity, AlertStatus } from '@/types/monitor';

const INSTANCE_STATUS_CONFIG: Record<InstanceStatus, { label: string; variant: 'success' | 'secondary' | 'destructive' | 'warning' | 'outline' }> = {
  running: { label: '运行中', variant: 'success' },
  stopped: { label: '已停止', variant: 'secondary' },
  terminated: { label: '已终止', variant: 'destructive' },
  pending: { label: '启动中', variant: 'warning' },
  error: { label: '错误', variant: 'destructive' },
};

export function InstanceStatusBadge({ status }: { status: InstanceStatus }) {
  const config = INSTANCE_STATUS_CONFIG[status] || { label: status, variant: 'outline' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

const ALERT_SEVERITY_CONFIG: Record<AlertSeverity, { label: string; variant: 'success' | 'secondary' | 'destructive' | 'warning' | 'outline' }> = {
  info: { label: '信息', variant: 'secondary' },
  warning: { label: '警告', variant: 'warning' },
  critical: { label: '严重', variant: 'destructive' },
  emergency: { label: '紧急', variant: 'destructive' },
};

export function AlertSeverityBadge({ severity }: { severity: AlertSeverity }) {
  const config = ALERT_SEVERITY_CONFIG[severity] || { label: severity, variant: 'outline' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

const ALERT_STATUS_CONFIG: Record<AlertStatus, { label: string; variant: 'success' | 'secondary' | 'destructive' | 'warning' | 'outline' }> = {
  firing: { label: '告警中', variant: 'destructive' },
  resolved: { label: '已解决', variant: 'success' },
  silenced: { label: '已静音', variant: 'secondary' },
};

export function AlertStatusBadge({ status }: { status: AlertStatus }) {
  const config = ALERT_STATUS_CONFIG[status] || { label: status, variant: 'outline' as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
```

- [ ] **Step 2: 创建 src/hooks/useInstances.ts**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cloudApi } from '@/api/cloud';
import type { ListInstancesParams, CreateInstanceParams } from '@/types/cloud';
import { useToast } from '@/components/ui/toast';

export function useInstances(params?: ListInstancesParams) {
  return useQuery({
    queryKey: ['instances', params],
    queryFn: () => cloudApi.listInstances(params),
  });
}

export function useInstance(id: string | undefined) {
  return useQuery({
    queryKey: ['instance', id],
    queryFn: () => cloudApi.getInstance(id!),
    enabled: !!id,
  });
}

export function useCreateInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateInstanceParams) => cloudApi.createInstance(params),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instances'] });
    },
  });
}

export function useInstanceAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'start' | 'stop' | 'reboot' | 'delete' }) => {
      if (action === 'start') return cloudApi.startInstance(id);
      if (action === 'stop') return cloudApi.stopInstance(id);
      if (action === 'reboot') return cloudApi.rebootInstance(id);
      return cloudApi.deleteInstance(id);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instances'] });
    },
  });
}

export function useSyncInstances() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider?: string) => cloudApi.syncInstances(provider),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['instances'] });
    },
  });
}

export function useProviders() {
  return useQuery({
    queryKey: ['providers'],
    queryFn: () => cloudApi.getProviders(),
  });
}

export function useRegions(provider: string | undefined) {
  return useQuery({
    queryKey: ['regions', provider],
    queryFn: () => cloudApi.getRegions(provider!),
    enabled: !!provider,
  });
}

export function useInstanceTypes(provider: string | undefined, region: string | undefined) {
  return useQuery({
    queryKey: ['instance-types', provider, region],
    queryFn: () => cloudApi.getInstanceTypes(provider!, region!),
    enabled: !!provider && !!region,
  });
}

export function useImages(provider: string | undefined) {
  return useQuery({
    queryKey: ['images', provider],
    queryFn: () => cloudApi.getImages(provider!),
    enabled: !!provider,
  });
}
```

注意：`useToast` 尚未创建。为避免依赖问题，移除 import 并在页面层处理 toast。修正版：

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cloudApi } from '@/api/cloud';
import type { ListInstancesParams, CreateInstanceParams } from '@/types/cloud';

export function useInstances(params?: ListInstancesParams) {
  return useQuery({
    queryKey: ['instances', params],
    queryFn: () => cloudApi.listInstances(params),
  });
}

export function useInstance(id: string | undefined) {
  return useQuery({
    queryKey: ['instance', id],
    queryFn: () => cloudApi.getInstance(id!),
    enabled: !!id,
  });
}

export function useCreateInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateInstanceParams) => cloudApi.createInstance(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instances'] }),
  });
}

export function useInstanceAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'start' | 'stop' | 'reboot' | 'delete' }) => {
      if (action === 'start') return cloudApi.startInstance(id);
      if (action === 'stop') return cloudApi.stopInstance(id);
      if (action === 'reboot') return cloudApi.rebootInstance(id);
      return cloudApi.deleteInstance(id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instances'] }),
  });
}

export function useSyncInstances() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (provider?: string) => cloudApi.syncInstances(provider),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['instances'] }),
  });
}

export function useProviders() {
  return useQuery({ queryKey: ['providers'], queryFn: () => cloudApi.getProviders() });
}

export function useRegions(provider: string | undefined) {
  return useQuery({
    queryKey: ['regions', provider],
    queryFn: () => cloudApi.getRegions(provider!),
    enabled: !!provider,
  });
}

export function useInstanceTypes(provider: string | undefined, region: string | undefined) {
  return useQuery({
    queryKey: ['instance-types', provider, region],
    queryFn: () => cloudApi.getInstanceTypes(provider!, region!),
    enabled: !!provider && !!region,
  });
}

export function useImages(provider: string | undefined) {
  return useQuery({
    queryKey: ['images', provider],
    queryFn: () => cloudApi.getImages(provider!),
    enabled: !!provider,
  });
}
```

- [ ] **Step 3: 创建 src/hooks/useAlerts.ts**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { monitorApi } from '@/api/monitor';
import type { CreateAlertRuleParams, UpdateAlertRuleParams, ListAlertEventsParams } from '@/types/monitor';

export function useAlertRules() {
  return useQuery({
    queryKey: ['alert-rules'],
    queryFn: () => monitorApi.listRules(),
  });
}

export function useCreateAlertRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateAlertRuleParams) => monitorApi.createRule(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }),
  });
}

export function useUpdateAlertRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, params }: { id: string; params: UpdateAlertRuleParams }) =>
      monitorApi.updateRule(id, params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }),
  });
}

export function useDeleteAlertRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => monitorApi.deleteRule(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-rules'] }),
  });
}

export function useAlertEvents(params?: ListAlertEventsParams) {
  return useQuery({
    queryKey: ['alert-events', params],
    queryFn: () => monitorApi.listEvents(params),
  });
}

export function useResolveAlertEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => monitorApi.resolveEvent(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['alert-events'] }),
  });
}
```

- [ ] **Step 4: 创建 src/hooks/useChannels.ts**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { monitorApi } from '@/api/monitor';
import type { CreateChannelParams } from '@/types/monitor';

export function useChannels() {
  return useQuery({
    queryKey: ['channels'],
    queryFn: () => monitorApi.listChannels(),
  });
}

export function useCreateChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateChannelParams) => monitorApi.createChannel(params),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  });
}

export function useDeleteChannel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => monitorApi.deleteChannel(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['channels'] }),
  });
}
```

- [ ] **Step 5: 创建 src/hooks/useCosts.ts**

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { monitorApi } from '@/api/monitor';
import type { CostSummaryParams } from '@/types/monitor';

export function useCostSummary(params?: CostSummaryParams) {
  return useQuery({
    queryKey: ['cost-summary', params],
    queryFn: () => monitorApi.getCostSummary(params),
  });
}

export function useInstanceCosts() {
  return useQuery({
    queryKey: ['instance-costs'],
    queryFn: () => monitorApi.getInstanceCosts(),
  });
}

export function useCollectCosts() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => monitorApi.collectCosts(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['cost-summary'] });
      qc.invalidateQueries({ queryKey: ['instance-costs'] });
    },
  });
}
```

---

## Task 4: 云资源管理页

**Files:**
- `web-console/src/pages/Instances.tsx`（替换占位）

- [ ] **Step 1: 替换 src/pages/Instances.tsx**

功能：实例列表表格 + 筛选（provider/status）+ 搜索 + 创建实例对话框 + 实例操作（启动/停止/重启/删除）+ 同步按钮。

```typescript
import { useState } from 'react';
import { useInstances, useInstanceAction, useSyncInstances, useProviders, useRegions, useInstanceTypes, useImages, useCreateInstance } from '@/hooks/useInstances';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { InstanceStatusBadge } from '@/components/StatusBadge';
import { ApiError } from '@/api/client';
import type { InstanceStatus } from '@/types/cloud';
import { Plus, RefreshCw, Search, Play, Square, RotateCw, Trash2 } from 'lucide-react';

export default function Instances() {
  const [filters, setFilters] = useState<{ provider?: string; status?: InstanceStatus }>({});
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: instances, isLoading } = useInstances(filters);
  const { data: providersData } = useProviders();
  const action = useInstanceAction();
  const sync = useSyncInstances();

  const filtered = (instances || []).filter((inst) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (
      (inst.name?.toLowerCase().includes(s)) ||
      (inst.providerInstanceId?.toLowerCase().includes(s)) ||
      (inst.publicIp?.includes(s)) ||
      (inst.region?.toLowerCase().includes(s))
    );
  });

  async function handleAction(id: string, act: 'start' | 'stop' | 'reboot' | 'delete') {
    try {
      await action.mutateAsync({ id, action: act });
      setConfirmDelete(null);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '操作失败');
    }
  }

  async function handleSync() {
    try {
      await sync.mutateAsync();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '同步失败');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">云资源管理</h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleSync} disabled={sync.isPending}>
            <RefreshCw className={`h-4 w-4 mr-1 ${sync.isPending ? 'animate-spin' : ''}`} />
            同步
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            创建实例
          </Button>
        </div>
      </div>

      {/* 筛选栏 */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap gap-3">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="搜索名称/ID/IP/区域..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <Select
              value={filters.provider || ''}
              onChange={(e) => setFilters((f) => ({ ...f, provider: e.target.value || undefined }))}
              className="w-[140px]"
            >
              <option value="">全部云厂商</option>
              {(providersData?.providers || []).map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </Select>
            <Select
              value={filters.status || ''}
              onChange={(e) => setFilters((f) => ({ ...f, status: (e.target.value || undefined) as InstanceStatus | undefined }))}
              className="w-[140px]"
            >
              <option value="">全部状态</option>
              <option value="running">运行中</option>
              <option value="stopped">已停止</option>
              <option value="terminated">已终止</option>
              <option value="pending">启动中</option>
              <option value="error">错误</option>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 实例表格 */}
      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">加载中...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">暂无实例</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>名称</TableHead>
                  <TableHead>云厂商</TableHead>
                  <TableHead>区域</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>规格</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>月费用</TableHead>
                  <TableHead>操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((inst) => (
                  <TableRow key={inst.id}>
                    <TableCell className="font-medium">
                      {inst.name || inst.providerInstanceId.slice(0, 8)}
                    </TableCell>
                    <TableCell>{inst.provider}</TableCell>
                    <TableCell>{inst.region}</TableCell>
                    <TableCell><InstanceStatusBadge status={inst.status} /></TableCell>
                    <TableCell className="text-muted-foreground">
                      {inst.cpu ? `${inst.cpu}C/${inst.memoryMb ? inst.memoryMb / 1024 : '?'}G` : '-'}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {inst.publicIp || inst.privateIp || '-'}
                    </TableCell>
                    <TableCell>
                      {inst.monthlyCost ? `¥${parseFloat(inst.monthlyCost).toFixed(2)}` : '-'}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {inst.status === 'stopped' && (
                          <Button variant="ghost" size="icon" title="启动" onClick={() => handleAction(inst.id, 'start')}>
                            <Play className="h-4 w-4" />
                          </Button>
                        )}
                        {inst.status === 'running' && (
                          <Button variant="ghost" size="icon" title="停止" onClick={() => handleAction(inst.id, 'stop')}>
                            <Square className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" title="重启" onClick={() => handleAction(inst.id, 'reboot')}>
                          <RotateCw className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" title="删除" onClick={() => setConfirmDelete(inst.id)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 创建实例对话框 */}
      <CreateInstanceDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      {/* 删除确认对话框 */}
      <Dialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="确认删除"
        description="此操作不可撤销，确定要删除该实例吗？"
      >
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="outline" onClick={() => setConfirmDelete(null)}>取消</Button>
          <Button variant="destructive" onClick={() => confirmDelete && handleAction(confirmDelete, 'delete')}>
            确认删除
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

function CreateInstanceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: providersData } = useProviders();
  const [provider, setProvider] = useState('');
  const [region, setRegion] = useState('');
  const [name, setName] = useState('');
  const [imageId, setImageId] = useState('');
  const [instanceType, setInstanceType] = useState('');

  const { data: regions } = useRegions(provider || undefined);
  const { data: images } = useImages(provider || undefined);
  const { data: types } = useInstanceTypes(provider || undefined, region || undefined);
  const create = useCreateInstance();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({ provider, region, name, imageId, instanceType });
      onClose();
      setProvider(''); setRegion(''); setName(''); setImageId(''); setInstanceType('');
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '创建失败');
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="创建实例" description="选择云厂商、区域和规格创建新实例">
      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <div className="space-y-2">
          <Label>云厂商</Label>
          <Select value={provider} onChange={(e) => { setProvider(e.target.value); setRegion(''); }} required>
            <option value="">请选择</option>
            {(providersData?.providers || []).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label>区域</Label>
          <Select value={region} onChange={(e) => setRegion(e.target.value)} required disabled={!provider}>
            <option value="">请选择</option>
            {(regions || []).map((r) => (
              <option key={r.id} value={r.id}>{r.displayName}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label>实例名称</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-instance" required />
        </div>
        <div className="space-y-2">
          <Label>镜像</Label>
          <Select value={imageId} onChange={(e) => setImageId(e.target.value)} required disabled={!provider}>
            <option value="">请选择</option>
            {(images || []).map((img) => (
              <option key={img.id} value={img.id}>{img.name}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-2">
          <Label>实例规格</Label>
          <Select value={instanceType} onChange={(e) => setInstanceType(e.target.value)} required disabled={!provider || !region}>
            <option value="">请选择</option>
            {(types || []).map((t) => (
              <option key={t.id} value={t.id}>{t.name} ({t.cpu}C/{t.memoryMb}MB)</option>
            ))}
          </Select>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? '创建中...' : '创建'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
```

---

## Task 5: 监控告警页

**Files:**
- `web-console/src/pages/Monitor.tsx`（替换占位）

- [ ] **Step 1: 替换 src/pages/Monitor.tsx**

功能：Tab 切换（告警规则/告警事件/通知渠道），每个 Tab 一个表格 + CRUD 操作。

```typescript
import { useState } from 'react';
import { useAlertRules, useCreateAlertRule, useDeleteAlertRule, useAlertEvents, useResolveAlertEvent } from '@/hooks/useAlerts';
import { useChannels, useCreateChannel, useDeleteChannel } from '@/hooks/useChannels';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog } from '@/components/ui/dialog';
import { AlertSeverityBadge, AlertStatusBadge } from '@/components/StatusBadge';
import { ApiError } from '@/api/client';
import type { AlertSeverity, AlertActionType, ChannelType } from '@/types/monitor';
import { Plus, Trash2, CheckCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'rules' | 'events' | 'channels';

export default function Monitor() {
  const [tab, setTab] = useState<Tab>('rules');

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">监控告警</h1>

      {/* Tab 切换 */}
      <div className="border-b">
        <div className="flex gap-4">
          {([
            { key: 'rules' as const, label: '告警规则' },
            { key: 'events' as const, label: '告警事件' },
            { key: 'channels' as const, label: '通知渠道' },
          ]).map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                'pb-2 px-1 text-sm font-medium border-b-2 -mb-px transition-colors',
                tab === t.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'rules' && <RulesTab />}
      {tab === 'events' && <EventsTab />}
      {tab === 'channels' && <ChannelsTab />}
    </div>
  );
}

function RulesTab() {
  const { data: rules, isLoading } = useAlertRules();
  const del = useDeleteAlertRule();
  const [createOpen, setCreateOpen] = useState(false);

  async function handleDelete(id: string) {
    if (!confirm('确定删除此规则？')) return;
    try {
      await del.mutateAsync(id);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '删除失败');
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">告警规则</h2>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />新建规则
          </Button>
        </div>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">加载中...</div>
        ) : (rules || []).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">暂无规则</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>指标</TableHead>
                <TableHead>条件</TableHead>
                <TableHead>持续时间</TableHead>
                <TableHead>严重级别</TableHead>
                <TableHead>启用</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(rules || []).map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium">{rule.name}</TableCell>
                  <TableCell>{rule.metric}</TableCell>
                  <TableCell className="text-muted-foreground">{rule.condition}</TableCell>
                  <TableCell className="text-muted-foreground">{rule.duration}</TableCell>
                  <TableCell><AlertSeverityBadge severity={rule.severity as AlertSeverity} /></TableCell>
                  <TableCell>
                    <span className={rule.enabled ? 'text-green-600' : 'text-muted-foreground'}>
                      {rule.enabled ? '已启用' : '已禁用'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" title="删除" onClick={() => handleDelete(rule.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <CreateRuleDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </Card>
  );
}

function CreateRuleDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateAlertRule();
  const [name, setName] = useState('');
  const [metric, setMetric] = useState('cpu_usage');
  const [condition, setCondition] = useState('> 80');
  const [duration, setDuration] = useState('5m');
  const [severity, setSeverity] = useState<AlertSeverity>('warning');
  const [actionType, setActionType] = useState<AlertActionType>('notify');
  const [actionTargets, setActionTargets] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await create.mutateAsync({
        name, metric, condition, duration, severity,
        actions: [{ type: actionType, targets: actionTargets.split(',').map((s) => s.trim()).filter(Boolean) }],
      });
      onClose();
      setName(''); setMetric('cpu_usage'); setCondition('> 80'); setDuration('5m');
      setSeverity('warning'); setActionType('notify'); setActionTargets('');
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '创建失败');
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="新建告警规则">
      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <div className="space-y-2">
          <Label>规则名称</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="CPU 使用率告警" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>指标</Label>
            <Input value={metric} onChange={(e) => setMetric(e.target.value)} required placeholder="cpu_usage" />
          </div>
          <div className="space-y-2">
            <Label>条件</Label>
            <Input value={condition} onChange={(e) => setCondition(e.target.value)} required placeholder="> 80" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>持续时间</Label>
            <Input value={duration} onChange={(e) => setDuration(e.target.value)} required placeholder="5m" />
          </div>
          <div className="space-y-2">
            <Label>严重级别</Label>
            <Select value={severity} onChange={(e) => setSeverity(e.target.value as AlertSeverity)}>
              <option value="info">信息</option>
              <option value="warning">警告</option>
              <option value="critical">严重</option>
              <option value="emergency">紧急</option>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label>动作类型</Label>
            <Select value={actionType} onChange={(e) => setActionType(e.target.value as AlertActionType)}>
              <option value="notify">通知</option>
              <option value="suggest">建议</option>
              <option value="auto">自动处理</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>目标（逗号分隔）</Label>
            <Input value={actionTargets} onChange={(e) => setActionTargets(e.target.value)} placeholder="channel-1,channel-2" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? '创建中...' : '创建'}</Button>
        </div>
      </form>
    </Dialog>
  );
}

function EventsTab() {
  const { data: events, isLoading } = useAlertEvents();
  const resolve = useResolveAlertEvent();

  async function handleResolve(id: string) {
    try {
      await resolve.mutateAsync(id);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '操作失败');
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <h2 className="text-lg font-semibold mb-4">告警事件</h2>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">加载中...</div>
        ) : (events || []).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">暂无告警事件</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>严重级别</TableHead>
                <TableHead>消息</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>触发时间</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(events || []).map((evt) => (
                <TableRow key={evt.id}>
                  <TableCell><AlertSeverityBadge severity={evt.severity as AlertSeverity} /></TableCell>
                  <TableCell className="max-w-md truncate">{evt.message}</TableCell>
                  <TableCell><AlertStatusBadge status={evt.status as any} /></TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {new Date(evt.firedAt).toLocaleString('zh-CN')}
                  </TableCell>
                  <TableCell>
                    {evt.status === 'firing' && (
                      <Button variant="ghost" size="sm" onClick={() => handleResolve(evt.id)}>
                        <CheckCircle className="h-4 w-4 mr-1" />解决
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

function ChannelsTab() {
  const { data: channels, isLoading } = useChannels();
  const del = useDeleteChannel();
  const [createOpen, setCreateOpen] = useState(false);

  async function handleDelete(id: string) {
    if (!confirm('确定删除此渠道？')) return;
    try {
      await del.mutateAsync(id);
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '删除失败');
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">通知渠道</h2>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />新建渠道
          </Button>
        </div>
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">加载中...</div>
        ) : (channels || []).length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">暂无渠道</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>配置</TableHead>
                <TableHead>启用</TableHead>
                <TableHead>操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(channels || []).map((ch) => (
                <TableRow key={ch.id}>
                  <TableCell className="font-medium">{ch.name}</TableCell>
                  <TableCell>{ch.type}</TableCell>
                  <TableCell className="text-muted-foreground text-xs max-w-xs truncate">
                    {JSON.stringify(ch.config)}
                  </TableCell>
                  <TableCell>
                    <span className={ch.enabled ? 'text-green-600' : 'text-muted-foreground'}>
                      {ch.enabled ? '已启用' : '已禁用'}
                    </span>
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" title="删除" onClick={() => handleDelete(ch.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <CreateChannelDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </Card>
  );
}

function CreateChannelDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const create = useCreateChannel();
  const [name, setName] = useState('');
  const [type, setType] = useState<ChannelType>('webhook');
  const [config, setConfig] = useState('{\n  "url": "https://example.com/webhook"\n}');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const parsedConfig = JSON.parse(config);
      await create.mutateAsync({ name, type, config: parsedConfig });
      onClose();
      setName(''); setType('webhook'); setConfig('{\n  "url": "https://example.com/webhook"\n}');
    } catch (err) {
      if (err instanceof SyntaxError) {
        alert('配置 JSON 格式错误');
      } else {
        alert(err instanceof ApiError ? err.message : '创建失败');
      }
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="新建通知渠道">
      <form onSubmit={handleSubmit} className="space-y-4 mt-2">
        <div className="space-y-2">
          <Label>渠道名称</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="运维通知群" />
        </div>
        <div className="space-y-2">
          <Label>类型</Label>
          <Select value={type} onChange={(e) => setType(e.target.value as ChannelType)}>
            <option value="webhook">Webhook</option>
            <option value="email">邮件</option>
            <option value="slack">Slack</option>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>配置（JSON）</Label>
          <textarea
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[100px]"
            value={config}
            onChange={(e) => setConfig(e.target.value)}
            required
          />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>取消</Button>
          <Button type="submit" disabled={create.isPending}>{create.isPending ? '创建中...' : '创建'}</Button>
        </div>
      </form>
    </Dialog>
  );
}
```

---

## Task 6: 成本分析页

**Files:**
- `web-console/src/pages/Costs.tsx`（替换占位）

- [ ] **Step 1: 替换 src/pages/Costs.tsx**

功能：成本汇总卡片（按 provider 分组）+ 服务分解表格 + 实例成本表格 + 手动采集按钮。

```typescript
import { useState, useMemo } from 'react';
import { useCostSummary, useInstanceCosts, useCollectCosts } from '@/hooks/useCosts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { ApiError } from '@/api/client';
import { RefreshCw } from 'lucide-react';

export default function Costs() {
  const { data: summary, isLoading: summaryLoading } = useCostSummary();
  const { data: instanceCosts, isLoading: instLoading } = useInstanceCosts();
  const collect = useCollectCosts();

  // 按 provider 聚合
  const providerTotals = useMemo(() => {
    const map = new Map<string, { total: number; currency: string }>();
    (summary || []).forEach((item) => {
      const existing = map.get(item.provider);
      if (existing) {
        existing.total += item.totalAmount;
      } else {
        map.set(item.provider, { total: item.totalAmount, currency: item.currency });
      }
    });
    return Array.from(map.entries()).map(([provider, { total, currency }]) => ({ provider, total, currency }));
  }, [summary]);

  const grandTotal = providerTotals.reduce((sum, p) => sum + p.total, 0);

  async function handleCollect() {
    try {
      await collect.mutateAsync();
    } catch (err) {
      alert(err instanceof ApiError ? err.message : '采集失败');
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">成本分析</h1>
        <Button variant="outline" size="sm" onClick={handleCollect} disabled={collect.isPending}>
          <RefreshCw className={`h-4 w-4 mr-1 ${collect.isPending ? 'animate-spin' : ''}`} />
          采集成本
        </Button>
      </div>

      {/* 总览卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">总成本</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥{grandTotal.toFixed(2)}</div>
          </CardContent>
        </Card>
        {providerTotals.map((p) => (
          <Card key={p.provider}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{p.provider}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{p.currency === 'CNY' ? '¥' : '$'}{p.total.toFixed(2)}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 服务分解表格 */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold mb-4">服务成本分解</h2>
          {summaryLoading ? (
            <div className="text-center py-8 text-muted-foreground">加载中...</div>
          ) : (summary || []).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">暂无成本数据</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>云厂商</TableHead>
                  <TableHead>服务</TableHead>
                  <TableHead>金额</TableHead>
                  <TableHead>币种</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(summary || []).map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>{item.provider}</TableCell>
                    <TableCell>{item.service}</TableCell>
                    <TableCell className="font-medium">{item.totalAmount.toFixed(2)}</TableCell>
                    <TableCell className="text-muted-foreground">{item.currency}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 实例成本表格 */}
      <Card>
        <CardContent className="pt-6">
          <h2 className="text-lg font-semibold mb-4">实例月度成本</h2>
          {instLoading ? (
            <div className="text-center py-8 text-muted-foreground">加载中...</div>
          ) : (instanceCosts || []).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">暂无实例成本数据</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>实例名称</TableHead>
                  <TableHead>云厂商</TableHead>
                  <TableHead>区域</TableHead>
                  <TableHead>月费用</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(instanceCosts || []).map((inst) => (
                  <TableRow key={inst.id}>
                    <TableCell className="font-medium">{inst.name || inst.id.slice(0, 8)}</TableCell>
                    <TableCell>{inst.provider}</TableCell>
                    <TableCell className="text-muted-foreground">{inst.region}</TableCell>
                    <TableCell>
                      {inst.monthlyCost ? `¥${parseFloat(inst.monthlyCost).toFixed(2)}` : '-'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

---

## Task 7: 端到端验证

- [ ] **Step 1: TypeScript 编译验证**

Run: `cd web-console && npx tsc -b`

Expected: 无错误

- [ ] **Step 2: 生产构建验证**

Run: `cd web-console && pnpm build`

Expected: dist/ 生成，无错误

- [ ] **Step 3: 开发服务器验证**

Run: `cd web-console && pnpm dev`

浏览器访问 http://localhost:5173/login，登录后：
- 访问 /instances，应看到实例列表表格和筛选栏
- 访问 /monitor，应看到三个 Tab（告警规则/告警事件/通知渠道）
- 访问 /costs，应看到成本汇总卡片和表格

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "Phase 5.3: 云资源管理 + 监控告警 + 成本分析页面"
```

---

## Phase 5.3 完成标准

- [ ] 类型定义 + API 调用层（cloud.ts/monitor.ts）
- [ ] 基础 UI 组件（badge/dialog/select/table）
- [ ] 状态徽章组件 + React Query hooks
- [ ] 云资源管理页：列表/筛选/搜索/创建/操作/同步
- [ ] 监控告警页：规则CRUD/事件列表/渠道CRUD（Tab 切换）
- [ ] 成本分析页：汇总卡片/服务分解/实例成本
- [ ] TypeScript 编译 + 生产构建通过
- [ ] 端到端验证通过
