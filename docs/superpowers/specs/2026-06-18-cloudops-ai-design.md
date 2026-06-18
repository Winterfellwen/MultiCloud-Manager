# CloudOps AI — 设计文档

**日期：** 2026-06-18
**项目：** AI 驱动的多平台云管理系统
**基于：** Fork OpenClaw 并改造

---

## 1. 项目概述

### 1.1 目标

构建一个 AI 驱动的多平台云管理系统，为企业内部运维团队提供：

- **云服务器管理：** 统一管理 AWS / 阿里云 / 腾讯云 / Azure / Oracle Cloud / Render 的 ECS 实例
- **容器/微服务编排：** Kubernetes / Docker 容器管理、部署、自动扩缩容（MVP 阶段聚焦 ECS 实例管理，K8s 编排作为后续迭代）
- **多云统一运维：** 统一资源视图、成本分析、监控告警、优化建议
- **AI 驱动能力：** 自然语言操作云资源、智能监控、自动化运维决策

> **范围说明：** MVP 全量交付聚焦 ECS 实例管理 + 多云统一视图 + AI 驱动能力。Kubernetes/Docker 容器编排作为 Phase 8 迭代目标，不在本次设计范围内。Render 仅支持有限操作（无 SSH、无实例创建）。

### 1.2 目标用户

企业内部运维团队（多人协作，需要权限管理和审计）。

### 1.3 技术选型

| 维度 | 选择 |
|------|------|
| 架构 | 微服务 + AI Gateway |
| 部署 | Docker Compose |
| 前端 | OpenClaw Chat 组件 + Vue 3 + Element Plus（混合） |
| 后端 | Node.js + TypeScript + Fastify |
| 数据库 | PostgreSQL + Redis |
| AI 层 | OpenClaw Agent Runtime 改造 |
| 实时通信 | OpenClaw Gateway WebSocket 协议 |
| 同步调用 | HTTP REST |

---

## 2. 系统架构

### 2.1 服务拓扑

```
┌──────────────────────────────────────────┐
│  Web Console (SPA)                       │
│  ├── Chat 页（OpenClaw 组件复用）         │
│  └── Dashboard 页（Vue 3 + Element Plus） │
├──────────────────────────────────────────┤
│  API Gateway (Fastify)                   │
│  ├── 路由转发                             │
│  ├── JWT 认证                            │
│  ├── 限流                                │
│  └── 请求日志                             │
├──────┬──────────┬────────────┬───────────┤
│Cloud │ Monitor  │ AI Agent   │ Auth      │
│Svc   │ Service  │ (OpenClaw) │ Service   │
├──────┼──────────┼────────────┼───────────┤
│Worker│ PostgreSQL│            │ Redis     │
└──────┴──────────┴────────────┴───────────┘
         ↓  ↓  ↓  ↓  ↓  ↓
    AWS 阿里云 腾讯云 Azure Oracle Render
```

### 2.2 服务职责

| 服务 | 端口 | 职责 |
|------|------|------|
| `web-console` | 80 | 管理控制台前端（Nginx 托管） |
| `api-gateway` | 3000 | API 路由、认证、限流、请求日志 |
| `cloud-service` | 3001 | 云资源 CRUD、Provider 适配、资源缓存 |
| `monitor-service` | 3002 | 指标采集、告警引擎、成本分析 |
| `ai-agent` | 3003 | NLP 理解、对话管理、Skill 执行 |
| `auth-service` | 3004 | RBAC 权限、审计日志、SSO |
| `worker` | - | 后台任务（资源同步、告警检查） |
| `postgres` | 5432 | 主数据库 |
| `redis` | 6379 | 队列、实时状态、Pub/Sub |

### 2.3 通信模式

**同步调用（HTTP REST）：**

| 调用方 | 被调用方 | 场景 |
|--------|---------|------|
| API Gateway → Auth Service | 验证 Token/权限 |
| API Gateway → Cloud Service | 资源 CRUD 请求 |
| API Gateway → Monitor Service | 监控数据查询 |
| AI Agent → Cloud Service | 执行云操作（创建/删除/启停实例） |
| AI Agent → Monitor Service | 查询费用/指标 |
| Monitor Service → Cloud Service | 采集指标时获取实例列表 |
| Worker → Cloud Service | 资源同步 |
| Worker → Monitor Service | 告警规则检查 |

**实时推送（OpenClaw Gateway WS 协议）：**

| 事件 | 发布方 | 订阅方 |
|------|--------|--------|
| `resource.changed` | Cloud Service | Web Console、Worker |
| `alert.fired` | Monitor Service | Web Console、AI Agent |
| `alert.resolved` | Monitor Service | Web Console |
| `cost.updated` | Monitor Service | Web Console |
| `agent.progress` | AI Agent | Web Console（操作进度） |

---

## 3. Cloud Provider Adapter 层

### 3.1 统一接口

```typescript
interface ICloudProvider {
  readonly name: string;
  readonly displayName: string;

  // 实例管理
  listInstances(region?: string): Promise<Instance[]>;
  getInstance(id: string): Promise<Instance>;
  createInstance(opts: CreateInstanceOpts): Promise<Instance>;
  deleteInstance(id: string): Promise<void>;
  startInstance(id: string): Promise<void>;
  stopInstance(id: string): Promise<void>;
  rebootInstance(id: string): Promise<void>;

  // 信息查询
  listRegions(): Promise<Region[]>;
  listImages(): Promise<Image[]>;
  listInstanceTypes(region: string): Promise<InstanceType[]>;

  // 监控
  getMetrics(id: string, timeRange: TimeRange): Promise<MetricData[]>;

  // 费用
  getCostSummary(timeRange: TimeRange): Promise<CostSummary>;
}

interface Instance {
  id: string;
  name: string;
  provider: string;
  region: string;
  status: 'running' | 'stopped' | 'terminated' | 'pending';
  spec: { cpu: number; memory: number; disk: number };
  publicIp?: string;
  privateIp?: string;
  createdAt: string;
  tags: Record<string, string>;
  monthlyCost: number;
}

interface CreateInstanceOpts {
  provider: string;
  region: string;
  name: string;
  imageId: string;
  instanceType: string;
  subnetId?: string;
  securityGroupIds?: string[];
  tags?: Record<string, string>;
}
```

### 3.2 Provider 适配器实现

| Provider | SDK | 认证方式 | 特殊处理 |
|----------|-----|---------|---------|
| AWS | `@aws-sdk/client-ec2` `@aws-sdk/client-cloudwatch` `@aws-sdk/client-costexplorer` | IAM Access Key / STS AssumeRole | 多 Region 扫描、预留实例 |
| 阿里云 | `@alicloud/ecs20140526` `@alicloud/cms20190101` | AccessKey ID + Secret | RAM 角色、按量付费 |
| 腾讯云 | `tencentcloud-sdk-nodejs` | SecretId + SecretKey | 预留实例、竞价实例 |
| Azure | `@azure/arm-compute` `@azure/arm-monitor` `@azure/arm-costmanagement` | Service Principal / Managed Identity | 资源组、标签过滤 |
| Oracle Cloud | REST API + `oci-sdk` | OCI Config + 私钥 | 可用域、抢占式实例 |
| Render | REST API | API Key | 仅支持部分操作（无 SSH） |

### 3.3 适配器注册

```typescript
// cloud-service/src/providers/registry.ts
const providers = new Map<string, ICloudProvider>();

export function registerProviders(config: ProviderConfig) {
  if (config.aws) providers.set('aws', new AWSProvider(config.aws));
  if (config.aliyun) providers.set('aliyun', new AliyunProvider(config.aliyun));
  if (config.tencent) providers.set('tencent', new TencentProvider(config.tencent));
  if (config.azure) providers.set('azure', new AzureProvider(config.azure));
  if (config.oracle) providers.set('oracle', new OracleProvider(config.oracle));
  if (config.render) providers.set('render', new RenderProvider(config.render));
}

export function getProvider(name: string): ICloudProvider {
  const provider = providers.get(name);
  if (!provider) throw new Error(`Unknown provider: ${name}`);
  return provider;
}
```

### 3.4 资源同步策略

- 启动时全量同步，之后每 5 分钟增量同步
- 变更检测：Provider Webhook（如 AWS EventBridge）或轮询对比
- 本地 PostgreSQL 缓存，UI 查询走缓存不直接调云 API
- 同步锁通过 Redis 分布式锁实现，防止并发冲突

---

## 4. Monitor Service（监控 + 告警 + 成本）

### 4.1 指标采集

| 指标 | 来源 | 采集频率 |
|------|------|---------|
| CPU 使用率 | CloudWatch / 云监控 API | 5 分钟 |
| 内存使用率 | CloudWatch / 云监控 API | 5 分钟 |
| 磁盘使用率 | Agent 或云监控 | 5 分钟 |
| 网络流量（入/出） | 各云网络监控 | 5 分钟 |
| 磁盘 IOPS | 各云块存储监控 | 5 分钟 |
| 月度费用 | 各云费用 API | 每日 |
| 实例运行时长 | 实例状态 | 5 分钟 |

### 4.2 告警引擎

**告警规则配置：**

```yaml
rules:
  - name: "CPU 过高"
    metric: cpu_usage_percent
    condition: "> 85%"
    duration: "10min"
    severity: warning
    action:
      - notify: ["webhook", "email"]
      - suggest: "consider_downsize"

  - name: "月度费用超预算"
    metric: monthly_cost
    condition: "> budget_limit"
    severity: critical
    action:
      - notify: ["webhook", "email", "slack"]
      - auto: "freeze_non_essential"
```

**告警严重级别：**

| 级别 | 含义 | 通知方式 |
|------|------|---------|
| `info` | 信息通知 | 系统内通知 |
| `warning` | 需关注 | 系统内 + 邮件 |
| `critical` | 紧急处理 | 系统内 + 邮件 + Webhook |
| `emergency` | 业务中断 | 全渠道通知 + 电话（预留） |

**通知渠道：**
- Webhook（企业微信 / 钉钉 / 飞书）
- 邮件
- Slack / 飞书
- 系统内通知（Dashboard 红点 + AI Agent 对话提醒）

### 4.3 成本分析

**费用数据模型：**

```sql
CREATE TABLE cost_records (
  id UUID PRIMARY KEY,
  provider VARCHAR(32) NOT NULL,
  region VARCHAR(64) NOT NULL,
  service VARCHAR(64) NOT NULL,       -- ec2 / ecs / rds / ...
  resource_id VARCHAR(128),
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(8) DEFAULT 'USD',
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**AI 驱动的优化建议：**

| 场景 | AI 建议 |
|------|--------|
| CPU 持续 < 10% 超过 7 天 | 「建议降配，预计月省 ¥XXX」 |
| 实例闲置 > 7 天 | 「建议关机或释放，预计月省 ¥XXX」 |
| 多云同区域重复部署 | 「建议合并至成本最低的云」 |
| 月度费用趋势上升 | 「本月已用 ¥XXX，按趋势月底将超预算 ¥XXX」 |

---

## 5. AI Agent Service（NLP + 对话管理）

### 5.1 基于 OpenClaw Agent 改造

**保留的 OpenClaw 组件：**
- Agent Runtime（NLP 理解层）
- Session 管理（对话上下文、多轮对话）
- Skill 系统（操作工作流封装）
- WebSocket 协议（实时通信）

**替换的 OpenClaw 组件：**
- 文件/进程工具 → 云管理 Tool 集
- 通用 Skill → 运维领域 Skill

### 5.2 云管理 Tool 集

```yaml
tools:
  # 资源操作
  - cloud_list_instances      # 列出所有云服务器
  - cloud_get_instance        # 查看单台详情
  - cloud_create_instance     # 创建实例
  - cloud_delete_instance     # 删除实例
  - cloud_start_instance      # 启动
  - cloud_stop_instance       # 关机
  - cloud_reboot_instance     # 重启

  # 监控查询
  - monitor_get_metrics       # 查询指标
  - monitor_list_alerts       # 列出告警
  - monitor_get_cost          # 查询费用

  # 操作执行
  - exec_command              # 在实例上执行命令（SSH）
  - exec_playbook             # 执行 Ansible Playbook

  # 信息查询
  - web_search                # 搜索云厂商文档
  - knowledge_query           # 查询内部运维知识库
```

### 5.3 自然语言→操作映射

| 用户输入 | Agent 理解 | 执行动作 |
|---------|-----------|---------|
| 「帮我开一台 2核4G 的阿里云 ECS，上海区域」 | create_instance + provider=aliyun + region=shanghai + spec=2c4g | 调用 cloud_create_instance |
| 「看看 AWS 所有闲置的 EC2」 | list_instances + provider=aws + filter=idle | 调用 cloud_list_instances + analyze |
| 「把那台 CPU 最高的服务器关了」 | list_instances → sort by cpu → stop top1 | 链式调用 |
| 「本月花了多少钱？哪个云最贵？」 | get_cost + aggregate + compare | 聚合分析 |
| 「帮我做个健康检查」 | 全量巡检 + 生成报告 | 多工具编排 |

### 5.4 对话管理

- 保留 OpenClaw 的 Session 模型（会话隔离、上下文保持）
- 每个运维人员独立会话
- 支持多轮对话（「关掉那台」→「不是这台，是那台」）
- 对话历史持久化到 PostgreSQL
- 支持操作确认（危险操作需二次确认）

---

## 6. Auth Service（权限 + 审计）

### 6.1 RBAC 权限模型

```yaml
roles:
  admin:
    description: "超级管理员"
    permissions: ["*"]

  ops_manager:
    description: "运维经理"
    permissions:
      - instance:list
      - instance:view
      - instance:start
      - instance:stop
      - instance:reboot
      - monitor:view
      - alert:manage
      - cost:view
      - report:generate

  ops_engineer:
    description: "运维工程师"
    permissions:
      - instance:list
      - instance:view
      - instance:start
      - instance:stop
      - instance:reboot
      - exec:command

  viewer:
    description: "只读观察者"
    permissions:
      - instance:list
      - instance:view
      - monitor:view
      - cost:view
```

### 6.2 审计日志

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT NOW(),
  user_id VARCHAR(64) NOT NULL,
  action VARCHAR(128) NOT NULL,       -- instance.stop / alert.create / ...
  resource_type VARCHAR(64),
  resource_id VARCHAR(128),
  provider VARCHAR(32),
  region VARCHAR(64),
  params JSONB,                        -- 操作参数（脱敏）
  result VARCHAR(16) NOT NULL,        -- success / failure
  ip INET,
  trace_id VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW()
);

-- 不可删除、不可修改
CREATE INDEX idx_audit_logs_timestamp ON audit_logs(timestamp);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
```

### 6.3 SSO 集成（预留）

- LDAP / Active Directory
- OIDC（对接企业已有的认证系统）
- API Key（给自动化脚本用）

---

## 7. Web Console（管理控制台）

### 7.1 混合架构

| 页面 | 技术方案 | 说明 |
|------|---------|------|
| AI 对话页 | OpenClaw Chat 组件复用 | 自然语言操作入口 |
| 总览 Dashboard | Vue 3 + Element Plus + ECharts | 多云概览、费用趋势、告警统计 |
| 资源列表 | Vue 3 + Element Plus | 按云/区域/状态筛选，批量操作 |
| 资源详情 | Vue 3 + ECharts | 实例信息、监控图表、操作历史 |
| 监控中心 | Vue 3 + ECharts | 指标图表、告警规则管理 |
| 费用分析 | Vue 3 + ECharts | 多云费用对比、趋势图 |
| 用户管理 | Vue 3 + Element Plus | RBAC 角色分配、API Key |
| 审计日志 | Vue 3 + Element Plus | 操作记录查询、导出 |
| 系统设置 | Vue 3 + Element Plus | 云账号配置、通知渠道 |

### 7.2 导航结构

```
┌──────────────────────────────────────────┐
│  Logo    CloudOps AI    搜索...   通知  用户 │
├──────┬───────────────────────────────────┤
│ 📊   │                                   │
│ 总览  │                                   │
│ 🖥️   │                                   │
│ 资源  │   主内容区                         │
│ 📈   │                                   │
│ 监控  │                                   │
│ 🔔   │                                   │
│ 告警  │                                   │
│ 💰   │                                   │
│ 费用  │                                   │
│ 🤖   │                                   │
│ AI    │                                   │
│ 对话  │                                   │
│ ⚙️   │                                   │
│ 设置  │                                   │
└──────┴───────────────────────────────────┘
```

### 7.3 AI 对话页交互

- 聊天界面复用 OpenClaw Chat 组件
- 支持操作确认卡片（「确认关机？」「确认创建？」）
- 支持资源卡片展示（实例列表、费用摘要等结构化数据）
- 操作执行进度实时展示（通过 Gateway 事件推送）

---

## 8. 项目结构

```
cloudops-ai/
├── docker-compose.yml
├── .env.example
│
├── web-console/                    # 前端管理控制台
│   ├── src/
│   │   ├── views/                  # 页面组件
│   │   │   ├── Dashboard.vue
│   │   │   ├── Resources.vue
│   │   │   ├── Monitor.vue
│   │   │   ├── Alerts.vue
│   │   │   ├── Cost.vue
│   │   │   ├── AiChat.vue          # 复用 OpenClaw Chat
│   │   │   ├── Users.vue
│   │   │   └── AuditLog.vue
│   │   ├── components/             # 通用组件
│   │   ├── stores/                 # Pinia 状态管理
│   │   ├── api/                    # API 调用封装
│   │   └── router/                 # 路由配置
│   ├── package.json
│   └── vite.config.ts
│
├── api-gateway/                    # API 网关
│   ├── src/
│   │   ├── routes/
│   │   ├── middleware/
│   │   └── index.ts
│   └── package.json
│
├── cloud-service/                  # 云资源管理服务
│   ├── src/
│   │   ├── providers/
│   │   │   ├── aws/
│   │   │   ├── aliyun/
│   │   │   ├── azure/
│   │   │   ├── tencent/
│   │   │   ├── oracle/
│   │   │   ├── render/
│   │   │   └── registry.ts
│   │   ├── services/
│   │   ├── models/
│   │   └── index.ts
│   └── package.json
│
├── monitor-service/                # 监控告警服务
│   ├── src/
│   │   ├── collectors/
│   │   ├── alerting/
│   │   ├── cost/
│   │   └── index.ts
│   └── package.json
│
├── ai-agent/                       # AI Agent 服务
│   ├── src/
│   │   ├── tools/
│   │   ├── skills/
│   │   ├── sessions/
│   │   └── index.ts
│   └── package.json
│
├── auth-service/                   # 认证授权服务
│   ├── src/
│   │   ├── rbac/
│   │   ├── audit/
│   │   ├── sso/
│   │   └── index.ts
│   └── package.json
│
├── worker/                         # 后台任务
│   ├── src/
│   │   ├── sync/
│   │   ├── alert-checker/
│   │   └── index.ts
│   └── package.json
│
├── shared/                         # 共享类型和工具
│   ├── types/
│   ├── proto/
│   └── utils/
│
├── migrations/                     # 数据库迁移
│   └── 001_init.sql
│
└── docs/
    ├── api/
    └── deployment/
```

---

## 9. 数据库设计

### 9.1 核心表

```sql
-- 云账号配置
CREATE TABLE cloud_accounts (
  id UUID PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  provider VARCHAR(32) NOT NULL,
  config JSONB NOT NULL,              -- 加密存储的凭证
  status VARCHAR(16) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- 资源缓存
CREATE TABLE instances (
  id UUID PRIMARY KEY,
  provider VARCHAR(32) NOT NULL,
  provider_instance_id VARCHAR(128) NOT NULL,
  name VARCHAR(256),
  region VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  cpu INT,
  memory_mb INT,
  disk_gb INT,
  public_ip INET,
  private_ip INET,
  monthly_cost DECIMAL(10,2),
  tags JSONB,
  last_synced_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(provider, provider_instance_id)
);

-- 监控指标
CREATE TABLE metrics (
  id UUID PRIMARY KEY,
  instance_id UUID REFERENCES instances(id),
  metric_name VARCHAR(64) NOT NULL,
  value DECIMAL(12,4) NOT NULL,
  unit VARCHAR(16),
  recorded_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_metrics_instance_time ON metrics(instance_id, recorded_at);

-- 告警规则
CREATE TABLE alert_rules (
  id UUID PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  metric VARCHAR(64) NOT NULL,
  condition VARCHAR(32) NOT NULL,     -- "> 85%"
  duration VARCHAR(16) NOT NULL,      -- "10min"
  severity VARCHAR(16) NOT NULL,
  actions JSONB NOT NULL,
  enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 告警事件
CREATE TABLE alerts (
  id UUID PRIMARY KEY,
  rule_id UUID REFERENCES alert_rules(id),
  instance_id UUID REFERENCES instances(id),
  severity VARCHAR(16) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(16) DEFAULT 'firing', -- firing / resolved / silenced
  fired_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

-- 费用记录
CREATE TABLE cost_records (
  id UUID PRIMARY KEY,
  provider VARCHAR(32) NOT NULL,
  region VARCHAR(64) NOT NULL,
  service VARCHAR(64) NOT NULL,
  resource_id VARCHAR(128),
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(8) DEFAULT 'USD',
  period_start TIMESTAMP NOT NULL,
  period_end TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- 审计日志
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY,
  timestamp TIMESTAMP DEFAULT NOW(),
  user_id VARCHAR(64) NOT NULL,
  action VARCHAR(128) NOT NULL,
  resource_type VARCHAR(64),
  resource_id VARCHAR(128),
  provider VARCHAR(32),
  region VARCHAR(64),
  params JSONB,
  result VARCHAR(16) NOT NULL,
  ip INET,
  trace_id VARCHAR(64)
);

-- 用户
CREATE TABLE users (
  id UUID PRIMARY KEY,
  username VARCHAR(64) UNIQUE NOT NULL,
  email VARCHAR(256),
  role VARCHAR(32) NOT NULL DEFAULT 'viewer',
  api_key VARCHAR(128) UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  last_login_at TIMESTAMP
);
```

---

## 10. 部署方案

### 10.1 Docker Compose

```yaml
version: '3.8'

services:
  web-console:
    image: nginx:alpine
    ports:
      - "80:80"
    volumes:
      - ./web-console/dist:/usr/share/nginx/html
    depends_on:
      - api-gateway

  api-gateway:
    build: ./api-gateway
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgres://cloudops:password@postgres:5432/cloudops
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

  cloud-service:
    build: ./cloud-service
    ports:
      - "3001:3001"
    environment:
      - DATABASE_URL=postgres://cloudops:password@postgres:5432/cloudops
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

  monitor-service:
    build: ./monitor-service
    ports:
      - "3002:3002"
    environment:
      - DATABASE_URL=postgres://cloudops:password@postgres:5432/cloudops
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

  ai-agent:
    build: ./ai-agent
    ports:
      - "3003:3003"
    environment:
      - DATABASE_URL=postgres://cloudops:password@postgres:5432/cloudops
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

  auth-service:
    build: ./auth-service
    ports:
      - "3004:3004"
    environment:
      - DATABASE_URL=postgres://cloudops:password@postgres:5432/cloudops
    depends_on:
      - postgres

  worker:
    build: ./worker
    environment:
      - DATABASE_URL=postgres://cloudops:password@postgres:5432/cloudops
      - REDIS_URL=redis://redis:6379
    depends_on:
      - postgres
      - redis

  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_DB=cloudops
      - POSTGRES_USER=cloudops
      - POSTGRES_PASSWORD=password
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./migrations:/docker-entrypoint-initdb.d

  redis:
    image: redis:7-alpine
    volumes:
      - redisdata:/data

volumes:
  pgdata:
  redisdata:
```

---

## 11. 开发计划（粗略）

| 阶段 | 内容 | 预估 |
|------|------|------|
| Phase 1 | 项目脚手架 + 服务间通信 + Auth Service | 2 周 |
| Phase 2 | Cloud Service + 3 个 Provider（AWS/阿里云/Azure） | 3 周 |
| Phase 3 | Monitor Service + 告警引擎 | 2 周 |
| Phase 4 | AI Agent Service（基于 OpenClaw 改造） | 3 周 |
| Phase 5 | Web Console 前端 | 3 周 |
| Phase 6 | 剩余 Provider + 费用分析 + 优化建议 | 2 周 |
| Phase 7 | 集成测试 + 文档 + 部署优化 | 2 周 |

---

## 12. 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| OpenClaw Agent 改造复杂度高 | AI Agent 模块延期 | 先做最小可用版本，逐步替换 |
| 6 个云 API 差异大 | Provider Adapter 工作量超预期 | 先覆盖常用操作，不追求全覆盖 |
| 前端混合架构维护成本 | 两套 UI 代码风格不统一 | 定义统一设计规范，逐步迁移 |
| 企业内部网络限制 | 云 API 调用不通 | 支持代理配置，测试环境预配置 |
