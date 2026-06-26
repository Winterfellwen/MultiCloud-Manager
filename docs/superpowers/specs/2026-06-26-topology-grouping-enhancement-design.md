# 拓扑图分组模式增强设计文档

## 1. 背景与目标

**现状**：拓扑图有 4 种分组模式（层级/语义/团队/成本），但：
- 成本模式仅按 `region` 分组，无法直观看出费用分布
- 团队模式使用 `cloudAccountId`，无法区分业务团队
- 缺少「云厂商」视角（多云运维核心需求）

**目标**：
1. 成本模式：改为费用梯度分档（免费/低/中/高）
2. 团队模式：基于 `tags.team` 识别业务团队
3. 新增云厂商模式：按 provider 分组

---

## 2. 架构设计

### 2.1 类型扩展 (`types/topology.ts`)

```typescript
export type GroupMode = 'hierarchy' | 'semantic' | 'team' | 'cost' | 'provider';
```

### 2.2 分组键逻辑 (`useTopologyCluster.ts:22-34`)

| 模式 | 分组键 | 备注 |
|------|--------|------|
| hierarchy | `${type}:${parentId}` | 保持不变 |
| semantic | `category` | 保持不变 |
| team | `node.data.tags?.team \|\| node.data.cloudAccountId \|\| 'unknown'` | 优先 tags.team |
| cost | `costBracket(node)` | 复用 `useTopologyTree` 逻辑 |
| provider | `node.provider` | 新增 |

### 2.3 费用梯度计算 (复用 `useTopologyTree.ts` 逻辑)

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

### 2.4 团队分组键

```typescript
function getTeamKey(node: TopologyNode): string {
  return node.data?.tags?.team 
    || node.data?.cloudAccountId 
    || 'unknown';
}
```

---

## 3. UI 变更

### 3.1 GroupModeSwitcher (`components/topology/GroupModeSwitcher.tsx`)

在语义和团队之间插入 Provider，顺序：
`层级 → 语义 → 云厂商 → 团队 → 成本`

图标：`Cloud` (lucide-react)

---

## 4. 实现顺序

1. `types/topology.ts` — 增加 `provider` 到 `GroupMode`
2. `hooks/useTopologyCluster.ts` — 实现四种分组键逻辑
3. `components/topology/GroupModeSwitcher.tsx` — 增加 Provider 按钮
4. 类型检查 + 构建验证

---

## 5. 验收标准

| 场景 | 预期 |
|------|------|
| 切换到「云厂商」 | 显示 7 个 provider 簇，标签如 `aws (85)` |
| 切换到「成本」 | 显示 4 个费用档簇，标签如 `中 $10-100 (38)` |
| 切换到「团队」 | 显示业务团队簇，如 `SRE (25)` `Backend (18)` |
| 现有 3 模式 | 行为不变 |

---

## 6. 风险与对策

| 风险 | 对策 |
|------|------|
| `monthlyCost` 为字符串/空值 | `parseFloat(String(cost || '0'))` 安全处理 |
| `tags.team` 缺失 | 回退到 `cloudAccountId` 再回退 `unknown` |
| 费用阈值需调整 | 定义为常量，便于后期调整 |

---

## 7. 后续扩展（不在本次范围）

- 分组阈值可配置化（现为 >3 成簇）
- 支持多维组合分组（如：云厂商 + 成本）
- 层级模式支持完整路径分组