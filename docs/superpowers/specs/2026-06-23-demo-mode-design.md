# Demo 模式设计文档

## 概述

为 CloudOps AI 添加 Demo 演示模式，允许用户无需登录即可体验完整功能。Demo 模式使用 Mock 数据模拟 7 家云厂商的资源，包含用户管理、监控、告警、成本等完整数据。

## 设计目标

1. **零门槛体验**：登录页一键进入 Demo，无需账号密码
2. **数据丰富**：每云厂商 200-500 台实例，覆盖所有资源类型
3. **功能完整**：AI 对话 3 种模式、用户管理、监控告警、成本分析
4. **自动更新**：Mock 数据结构与代码同步，新功能自动反映

---

## 架构设计

### 1. Demo 状态管理

**文件**：`web-console/src/stores/demo.ts`

使用 Zustand 创建独立 Demo 状态，与真实认证隔离：

```typescript
interface DemoState {
  isDemoMode: boolean;
  demoUser: AuthUser | null;
  demoUsers: DemoUser[];
  demoAccounts: CloudAccount[];
  demoInstances: InstanceRow[];
  demoResources: CloudResource[];
  demoAlerts: Alert[];
  demoCosts: CostRecord[];

  setDemoMode: (on: boolean) => void;
  exitDemo: () => void;
}
```

### 2. Demo 入口

**登录页**：`web-console/src/pages/Login.tsx`

- 在 "登录" 按钮下方添加 "Demo 演示" 按钮
- 点击后设置 `isDemoMode = true`，创建 demo token，跳转 dashboard
- Demo token 为固定字符串 `demo-token-xxx`，无需后端验证

### 3. Mock 数据层

**文件**：`web-console/src/lib/demo/mock-data.ts`

Mock 数据生成函数，批量创建实例、数据库、存储等资源。

---

## Mock 数据规格

### 云厂商账号（7家）

| 厂商 | 账号名称 | 实例数 | 数据库 | 存储 | 其他资源 |
|------|---------|--------|--------|------|----------|
| AWS | Demo AWS | 500 | 20 RDS | 50 S3 | 10 LB, 5 EKS |
| 阿里云 | Demo 阿里云 | 300 | 15 RDS | 30 OSS | 8 SLB |
| Azure | Demo Azure | 250 | 12 SQL | 25 Blob | 10 AKS |
| 腾讯云 | Demo 腾讯云 | 200 | 10 MySQL | 20 COS | 6 CLB |
| 华为云 | Demo 华为云 | 200 | 10 RDS | 20 OBS | 5 ELB |
| Render | Demo Render | 100 | 20 PG | 30 Redis | - |
| Oracle Cloud | Demo Oracle | 150 | 15 Autonomous | 25 Bucket | 5 OKE |

### 实例分布规则

**区域分布**：
- AWS: us-east-1 (40%), us-west-2 (30%), eu-west-1 (20%), ap-northeast-1 (10%)
- 阿里云: cn-hangzhou (50%), cn-shanghai (30%), cn-beijing (20%)
- Azure: eastus (40%), westus2 (30%), europewest (20%), asiaeast (10%)
- 其他厂商类似分布

**状态分布**：
- running: 60%
- stopped: 20%
- pending: 15%
- error: 5%

**规格分布**：
- small (1-2 CPU, 2-4GB): 40%
- medium (4 CPU, 8-16GB): 35%
- large (8+ CPU, 32+GB): 25%

**标签**：
- `env`: prod (30%), staging (30%), dev (40%)
- `team`: SRE, DevOps, Backend, Frontend, Data
- `project`: cloudops, platform, analytics, api, web

### 用户管理数据

5 个 Demo 用户：

| 用户名 | 角色 | 团队 |
|--------|------|------|
| demo-admin | admin | Platform |
| demo-manager | ops_manager | SRE |
| demo-engineer-1 | ops_engineer | DevOps |
| demo-engineer-2 | ops_engineer | Backend |
| demo-viewer | viewer | Finance |

### 监控数据

- 时间范围：最近 7 天
- 指标：CPU 使用率、内存使用率、网络流量
- 数据点：每小时一个值，共 168 个点
- 波动模式：工作日高峰、夜间低谷、随机抖动

### 告警数据

15 条活跃告警：

| 类型 | 数量 | 严重程度 |
|------|------|----------|
| CPU 过高 (>90%) | 5 | critical/warning |
| 内存不足 (>85%) | 4 | warning |
| 磁盘告警 (>80%) | 3 | warning |
| 网络异常 | 2 | info |
| 服务宕机 | 1 | critical |

### 成本数据

月度费用分布：

| 云厂商 | 月费用 | 货币 |
|--------|--------|------|
| AWS | $15,000 | USD |
| 阿里云 | ¥8,000 | CNY |
| Azure | $12,000 | USD |
| 腾讯云 | ¥5,000 | CNY |
| 华为云 | ¥4,000 | CNY |
| Render | $500 | USD |
| Oracle Cloud | $8,000 | USD |

---

## 技术实现

### Mock 数据生成

```typescript
// web-console/src/lib/demo/mock-data.ts

function generateInstances(provider: string, count: number): InstanceRow[] {
  const regions = PROVIDER_REGIONS[provider];
  const statuses = ['running', 'stopped', 'pending', 'error'];
  const specs = [
    { cpu: 1, memoryMb: 2048, diskGb: 20 },
    { cpu: 2, memoryMb: 4096, diskGb: 40 },
    { cpu: 4, memoryMb: 8192, diskGb: 80 },
    { cpu: 8, memoryMb: 16384, diskGb: 160 },
  ];

  return Array.from({ length: count }, (_, i) => ({
    id: `demo-${provider}-instance-${i}`,
    provider,
    providerInstanceId: `i-${provider}-${i}`,
    name: `${provider}-server-${i}`,
    region: weightedRandom(regions),
    status: weightedRandom(statuses, [0.6, 0.2, 0.15, 0.05]),
    cpu: randomSpec.cpu,
    memoryMb: randomSpec.memoryMb,
    diskGb: randomSpec.diskGb,
    publicIp: generateIP(),
    privateIp: generateIP(),
    monthlyCost: calculateCost(randomSpec),
    tags: generateTags(),
    createdAt: randomDate(90),
    cloudAccountId: `demo-account-${provider}`,
  }));
}
```

### Demo API 替换

通过 `isDemoMode` 判断，替换 API 调用：

```typescript
// web-console/src/hooks/useInstances.ts

export function useInstances(params?: ListInstancesParams) {
  const isDemoMode = useDemoStore((s) => s.isDemoMode);

  return useQuery({
    queryKey: ['instances', params, isDemoMode],
    queryFn: () => isDemoMode
      ? getDemoInstances(params)
      : cloudApi.listInstances(params),
  });
}
```

### Demo 登录流程

```typescript
// web-console/src/pages/Login.tsx

function handleDemoLogin() {
  const demoUser = {
    id: 'demo-user-admin',
    username: 'demo-admin',
    role: 'admin',
  };
  const demoToken = 'demo-token-' + Date.now();

  useAuthStore.getState().setTokens({
    accessToken: demoToken,
    refreshToken: 'demo-refresh-token',
    expiresIn: 86400,
  });
  useDemoStore.getState().setDemoMode(true);

  navigate('/dashboard', { replace: true });
}
```

---

## 文件清单

| 文件 | 用途 |
|------|------|
| `stores/demo.ts` | Demo 状态管理 |
| `lib/demo/mock-data.ts` | Mock 数据生成 |
| `lib/demo/demo-api.ts` | Demo API 替换函数 |
| `pages/Login.tsx` | Demo 入口按钮 |
| `hooks/useInstances.ts` | Demo 模式判断 |
| `hooks/useResources.ts` | Demo 模式判断 |
| `hooks/useDashboard.ts` | Demo 模式判断 |
| `hooks/useCosts.ts` | Demo 模式判断 |
| `hooks/useAlerts.ts` | Demo 模式判断 |

---

## AI 对话处理

Demo 模式下 AI 对话：
- WebSocket 连接正常建立（如果后端可用）
- 消息发送走真实后端
- 如果后端不可用，显示连接状态提示，但不影响其他功能

---

## 自动更新机制

Mock 数据结构随代码更新：
- 新增字段时，Mock 生成函数同步添加
- 类型定义变更时，Mock 数据适配
- 通过 TypeScript 类型检查确保一致性

---

## 实现优先级

1. **P0**：Demo Store + Mock 数据生成 + 登录页入口
2. **P1**：实例/资源列表 Demo 替换
3. **P2**：监控/告警/成本 Demo 数据
4. **P3**：用户管理 Demo 数据