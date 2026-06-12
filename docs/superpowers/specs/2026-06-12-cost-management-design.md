# AI-Driven Cost Management & Optimization

**Date**: 2026-06-12
**Feature**: 由 AI 驱动的多云成本管理和优化

## 成本数据获取优先级

1. **计费 API** — 调用各云厂商的官方计费 API 获取实际账单数据
2. **公开定价估算** — 根据 `pricing_plans` 定价 × 资源用量估算
3. **手动录入** — 用户手动填写计费规则作为兜底

## 数据模型

### `pricing_plans` — 定价表

各云厂商的公开定价数据，按实例类型/区域映射单价。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID PK | |
| `provider` | VARCHAR(50) | `azure`/`aws`/`tencent`/`alicloud`/`oracle`/`render` |
| `region` | VARCHAR(100) | 区域代码 |
| `service` | VARCHAR(50) | `compute`/`storage`/`network` |
| `tier` | VARCHAR(100) | 实例规格代号 |
| `price_per_hour` | DECIMAL(12,6) | 按小时单价（USD） |
| `price_per_month` | DECIMAL(12,6) | 按月估算价（USD） |
| `currency` | VARCHAR(10) | 默认 USD |
| `effective_from` | TIMESTAMP | 价格生效时间 |
| `effective_to` | TIMESTAMP | 价格失效时间 |
| `metadata` | JSONB | 额外定价维度（操作系统、预留实例类型等） |
| UNIQUE(provider, region, tier, effective_from) | | |

### `cost_data` — 成本明细

每次同步生成记录，保留历史。

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID PK | |
| `resource_cache_id` | UUID | FK -> `resources_cache.id` ON DELETE CASCADE |
| `account_id` | UUID | FK -> `cloud_accounts.id` |
| `provider` | VARCHAR(50) | 冗余，方便聚合查询 |
| `cloud_resource_id` | VARCHAR(500) | 冗余，方便聚合查询 |
| `cost_type` | VARCHAR(20) | `actual`(计费API) / `estimated`(估算) / `manual`(手动) |
| `amount` | DECIMAL(12,4) | 成本金额 |
| `currency` | VARCHAR(10) | 默认 USD |
| `billing_period_start` | TIMESTAMP | 账单周期开始 |
| `billing_period_end` | TIMESTAMP | 账单周期结束 |
| `usage_quantity` | DECIMAL(12,4) | 使用量 |
| `usage_unit` | VARCHAR(20) | `hours`/`GB`/`requests` |
| `metadata` | JSONB | 额外上下文 |
| `fetched_at` | TIMESTAMP | 同步时间 |
| INDEX(account_id, provider, billing_period_start) | | |

### `cost_optimization_suggestions` — 优化建议

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID PK | |
| `resource_cache_id` | UUID | FK -> `resources_cache.id` |
| `suggestion_type` | VARCHAR(30) | `resize`/`shutdown`/`delete`/`cross_cloud_migrate`/`rightsize` |
| `title` | VARCHAR(200) | |
| `description` | TEXT | |
| `estimated_savings` | DECIMAL(12,4) | |
| `currency` | VARCHAR(10) | |
| `confidence` | VARCHAR(10) | `high`/`medium`/`low` |
| `status` | VARCHAR(20) | `pending`/`approved`/`applied`/`dismissed`/`failed` |
| `source` | VARCHAR(10) | `ai`/`manual` |
| `confirmed_by` | UUID | FK -> `users.id` |
| `confirmed_at` | TIMESTAMP | |
| `execution_result` | TEXT | |

### `cost_optimization_rules` — 自动优化规则

| 字段 | 类型 | 说明 |
|------|------|------|
| `id` | UUID PK | |
| `name` | VARCHAR(200) | |
| `description` | TEXT | |
| `enabled` | BOOLEAN | 总开关 |
| `requires_confirm` | BOOLEAN | 是否需管理员确认 |
| `condition` | JSONB | 触发条件 `{"cost_gt": 100, "provider": "azure", "idle_days_gt": 30}` |
| `action` | JSONB | 执行动作 `{"type": "shutdown_instance", "resource_filter": {...}}` |
| `created_by` | UUID | FK -> `users.id` |
| `created_at` | TIMESTAMP | |
| `updated_at` | TIMESTAMP | |
| `last_triggered_at` | TIMESTAMP | |

## 架构组件

### CostFetcher — 计费 API 适配

每个云厂商一个 adapter，调用计费 API 获取实际成本数据：

| 云厂商 | API | 需要的额外权限 |
|--------|-----|---------------|
| Azure | Cost Management - Query API | `Cost Management Reader` 角色 |
| AWS | Cost Explorer - GetCostAndUsage | `ce:GetCostAndUsage` 策略 |
| Tencent | 云财务 DescribeBillDetail | 需要 CAM 财务相关权限 |
| Alibaba | Billing QueryBillOverview | `AliyunBSSReadOnlyAccess` |
| Oracle | 无计费 API | 跳过，走估算 |
| Render | 无计费 API | 跳过，走估算 |

Oracle 和 Render 无计费 API，始终走 CostEstimator。

### CostEstimator — 定价估算

- 根据 `resources_cache.spec` 中的 `instance_type`、`cpu`、`memory` 等信息
- 匹配 `pricing_plans` 中对应 `provider` + `region` + `tier` 的定价
- 根据资源状态折算（running 按全价，stopped 按存储价）
- 预填充 `pricing_plans`：内置常见实例类型的公开定价数据（初始版本覆盖 Azure + AWS 主流实例族，其他厂商逐步补充）

### CostAggregator — 查询聚合层

- 按云厂商、时间范围、资源类型、标签分组聚合
- 跨云对比查询
- 趋势分析（环比/同比）
- AI 工具和后端 API 的查询入口

### Optimizer — 优化规则引擎

- 定时扫描 `cost_optimization_rules`
- 检查条件是否满足（成本阈值、闲置天数等）
- 满足时生成 `cost_optimization_suggestions`
- `requires_confirm=true` → 等待管理员确认
- `requires_confirm=false` → 自动执行

## 成本同步周期

独立于资源同步（5 分钟），成本同步每天一次（UTC 00:00），支持手动触发。

```
cost sync (每天 00:00 + 手动)
  ├── CostFetcher.fill()  ── 有计费API的厂商
  │     ├── azure_adapter.fetch()
  │     ├── aws_adapter.fetch()
  │     ├── tencent_adapter.fetch()
  │     └── alicloud_adapter.fetch()
  ├── CostEstimator.fill() ── 无计费API的厂商
  │     ├── oracle_adapter.estimate()
  │     └── render_adapter.estimate()
  └── 写入 cost_data
```

## AI 工具

注册到 AI Agent registry：

| Tool | 权限 | 说明 |
|------|------|------|
| `get_cost_overview` | all | 总成本/按厂商汇总 |
| `get_cost_breakdown` | all | 按资源/标签/区域下钻 |
| `get_cost_trend` | all | 趋势分析 |
| `compare_cross_cloud_costs` | all | 跨云同规格成本对比 |
| `get_optimization_suggestions` | all | 获取优化建议 |
| `apply_optimization` | admin | 执行优化建议 |
| `create_optimization_rule` | admin | 创建自动优化规则 |
| `forecast_cost` | all | 预测下月成本 |

## API 端点

| Method | Path | 说明 |
|--------|------|------|
| GET | `/api/cost/overview` | 成本概览 |
| GET | `/api/cost/breakdown` | 成本下钻 |
| GET | `/api/cost/trend` | 成本趋势 |
| GET | `/api/cost/compare` | 跨云对比 |
| POST | `/api/cost/sync` | 手动触发成本同步 |
| GET | `/api/cost/optimizations` | 优化建议列表 |
| PUT | `/api/cost/optimizations/:id/status` | 更新建议状态 |
| POST | `/api/cost/optimizations/:id/apply` | 执行建议 |
| GET | `/api/cost/rules` | 规则列表 |
| POST | `/api/cost/rules` | 创建规则 |
| PUT | `/api/cost/rules/:id` | 更新规则 |
| DELETE | `/api/cost/rules/:id` | 删除规则 |
| PUT | `/api/cost/rules/:id/toggle` | 启用/禁用规则 |

## 前端页面

侧栏新增「成本」导航项，页面包含：

1. **成本概览** — 本月总成本、各厂商饼图、6 个月趋势折线图、环比/同比
2. **成本详情** — 资源维度成本表格，支持筛选/排序
3. **优化建议** — 建议列表（节省金额排序），确认/忽略操作
4. **自动规则** — 规则列表（含开关），新建/编辑规则表单
5. **AI 对话集成** — 成本查询结果在聊天中富文本展示

## AI 对话场景示例

```
用户: "对比一下 Azure 和 AWS 同配置的成本"
  → get_cost_overview(providers=[azure, aws], period=this_month)
  → compare_cross_cloud_costs(tier=Standard_D2s_v3)
  → AI 回复: "Azure Standard_D2s_v3 在 eastus 约 $70/月，AWS t3.medium 在 us-east-1 约 $60/月，建议迁移到 AWS"

AI 主动: "检测到 Azure 实例 idle-vm-01 已闲置 30 天，每月浪费 $45，建议关闭。"
  → 生成 cost_optimization_suggestions
  → 用户确认 → apply_optimization → stop_instance
```
