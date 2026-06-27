# 拓扑图分组模式增强设计文档

## 1. 背景与目标

**现状**：拓扑图有 4 种分组模式，但存在以下问题：
- 「语义」命名抽象，用户难以理解实际含义
- 「成本」模式仅按 `region` 分组，无法直观看出费用分布
- 团队模式使用 `cloudAccountId`，无法区分业务团队
- 缺少「云厂商」视角（多云运维核心需求）

**目标**：
1. 重命名「语义」为「资源类型」，含义更直观
2. 重命名「成本」为「费用」，与页面名称一致
3. 费用模式：改为费用梯度分档（免费/低/中/高）
4. 团队模式：基于 `tags.team` 识别业务团队
5. 新增云厂商模式：按 provider 分组

---

## 2. 分组模式总览

| 模式 | 图标 | 含义 | 分组键 |
|------|------|------|--------|
| 层级 | GitBranch | 按基础设施层级结构 | `${type}:${parentId}` |
| 资源类型 | Layers | 按资源功能分类 | `category` |
| 云厂商 | Cloud | 按云服务提供商 | `provider` |
| 团队 | Users | 按业务团队 | `tags.team` → `cloudAccountId` → `unknown` |
| 费用 | DollarSign | 按月费用梯度 | `costBracket(monthlyCost)` |

---

## 3. 架构设计

### 3.1 类型扩展 (`types/topology.ts`)

```typescript
export type GroupMode = 'hierarchy' | 'resourceType' | 'provider' | 'team' | 'cost';

export const GROUP_MODE_LABELS: Record<GroupMode, string> = {
  hierarchy: '层级',
  resourceType: '资源类型',
  provider: '云厂商',
  team: '团队',
  cost: '费用',
};
```

### 3.2 分组键逻辑 (`useTopologyCluster.ts`)

| 模式 | 分组键 | 标签格式 |
|------|--------|----------|
| hierarchy | `${type}:${parentId}` | `instance (85)` |
| resourceType | `category` | `计算 (42)` `存储 (18)` |
| provider | `provider` | `aws (85)` `azure (32)` |
| team | `tags.team → cloudAccountId → unknown` | `SRE (25)` `Backend (18)` |
| cost | `costBracket(monthlyCost)` | `免费 (12)` `低 ≤$10 (28)` `中 $10-100 (38)` `高 >$100 (7)` |

### 3.3 费用梯度计算

```typescript
function getCostBracket(monthlyCost: string | number | null): string {
  const cost = parseFloat(String(monthlyCost || '0'));
  if (cost === 0) return 'free';
  if (cost <= 10) return 'low';
  if (cost <= 100) return 'medium';
  return 'high';
}
```

标签映射：
- `free` → `免费 (N)`
- `low` → `低 ≤$10 (N)`
- `medium` → `中 $10-100 (N)`
- `high` → `高 >$100 (N)`

### 3.4 团队分组键

```typescript
function getTeamKey(node: TopologyNode): string {
  return node.data?.tags?.team 
    || node.data?.cloudAccountId 
    || 'unknown';
}
```

---

## 4. UI 变更

### 4.1 GroupModeSwitcher (`components/topology/GroupModeSwitcher.tsx`)

按钮顺序：`层级 → 资源类型 → 云厂商 → 团队 → 费用`

图标映射：
- 层级 → `GitBranch`
- 资源类型 → `Layers`
- 云厂商 → `Cloud`
- 团队 → `Users`
- 费用 → `DollarSign`

---

## 5. 实现顺序

1. `types/topology.ts` — 重命名 GroupMode，更新标签
2. `hooks/useTopologyCluster.ts` — 实现 5 种分组键逻辑
3. `components/topology/GroupModeSwitcher.tsx` — 更新按钮和图标
4. `pages/Topology.tsx` — 更新默认模式引用
5. 类型检查 + 构建验证

---

## 6. 验收标准

| 场景 | 预期 |
|------|------|
| 切换到「资源类型」 | 按 compute/storage/database/network 等分组 |
| 切换到「云厂商」 | 显示 7 个 provider 簇，标签如 `aws (85)` |
| 切换到「费用」 | 显示 4 个费用档簇，标签如 `中 $10-100 (38)` |
| 切换到「团队」 | 显示业务团队簇，如 `SRE (25)` `Backend (18)` |
| 切换到「层级」 | 行为不变 |

---

## 7. 风险与对策

| 风险 | 对策 |
|------|------|
| `monthlyCost` 为字符串/空值 | `parseFloat(String(cost || '0'))` 安全处理 |
| `tags.team` 缺失 | 回退到 `cloudAccountId` 再回退 `unknown` |
| 费用阈值需调整 | 定义为常量，便于后期调整 |

---

## 8. 后续扩展（不在本次范围）

- 分组阈值可配置化（现为 >3 成簇）
- 支持多维组合分组（如：云厂商 + 费用）
- 层级模式支持完整路径分组