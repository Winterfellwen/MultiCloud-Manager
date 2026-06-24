# 拓扑视图功能设计文档

## 概述

为 CloudOps AI 多云管理平台添加自动拓扑图生成功能，支持网络和存储两种视角，帮助用户直观理解云资源之间的关系。

## 需求摘要

- **视角**：网络视角 + 存储视角（计费视角后续迭代）
- **交互**：可拖拽、缩放、点击查看详情
- **筛选**：多维筛选（云厂商、区域、资源类型、状态、云账号）
- **数据**：增强后端数据采集，存储更多资源关系

## 技术选型

| 组件 | 选择 | 理由 |
|------|------|------|
| 可视化库 | @xyflow/react (React Flow) | 专为节点图设计，内置拖拽/缩放/小地图 |
| 自动布局 | dagre | 分层图布局算法，适合展示层级关系 |
| 状态管理 | @tanstack/react-query | 与现有项目一致 |

## 数据模型

### 资源关系存储

在 `cloud_resources.attributes` JSON 中增加关系字段：

| 资源类型 | 新增字段 | 目标类型 |
|---------|---------|---------|
| instance | `vpcId` | vpc |
| instance | `subnetId` | (隐含 VPC) |
| instance | `securityGroupIds` | securitygroup |
| database | `vpcId` | vpc |
| cache | `vpcId` | vpc |
| loadbalancer | `targetInstanceIds` | instance |

### Topology API

```
GET /topology?view=network|storage&provider=xxx&region=xxx&resourceType=xxx&status=xxx&cloudAccountId=xxx

Response: {
  nodes: TopologyNode[],
  edges: TopologyEdge[]
}
```

**TopologyNode:**
```typescript
interface TopologyNode {
  id: string;
  type: string;
  label: string;
  provider: string;
  region: string;
  status: string;
  category: string;
  icon: string;
  data: Record<string, unknown>;
}
```

**TopologyEdge:**
```typescript
interface TopologyEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  label?: string;
}
```

## 前端架构

### 页面结构

```
/topology
├── TopologyPage.tsx
├── components/
│   ├── TopologyCanvas.tsx
│   ├── TopologyFilter.tsx
│   ├── ViewSwitcher.tsx
│   ├── ResourceNode.tsx
│   ├── ResourceEdge.tsx
│   └── NodeDetailPanel.tsx
```

### 视角定义

**网络视角：** VPC、子网、实例、负载均衡器、安全组、集群
**存储视角：** 实例、磁盘、数据库、缓存、对象存储

### 交互功能

- 拖拽节点（React Flow 内置）
- 缩放画布（鼠标滚轮）
- 小地图（MiniMap）
- 点击节点 → 右侧详情面板
- 双击节点 → 跳转资源详情页
- 框选节点
- dagre 自动布局

## Demo 模式

### 模拟数据

- 3 个 VPC，每个 2-3 个子网
- 每个子网 5-10 个实例
- 每个实例 1-2 个磁盘
- 2 个负载均衡器，各关联 3-5 个实例
- 3 个数据库，2 个 Redis 缓存

### Demo API

```typescript
export function demoGetTopology(
  view: 'network' | 'storage',
  filters?: TopologyFilters
): Promise<{ nodes: TopologyNode[], edges: TopologyEdge[] }>
```

## 导航集成

侧边栏新增入口（位于「资源总览」之后）：

```
资源总览
拓扑视图        ← 新增（Network 图标）
云厂商管理
```

## i18n

```json
{
  "nav": { "topology": "拓扑视图" },
  "topology": {
    "title": "拓扑视图",
    "networkView": "网络",
    "storageView": "存储",
    "filters": { ... },
    "nodeDetail": { ... },
    "empty": "暂无资源数据",
    "loading": "加载拓扑数据中..."
  }
}
```

## 实施顺序

| 阶段 | 内容 | 预估工作量 |
|------|------|-----------|
| Phase 1 | 后端：Provider 关系提取 + Topology API | 2-3 天 |
| Phase 2 | 前端：基础画布 + 节点渲染 + Demo 模式 | 2-3 天 |
| Phase 3 | 前端：筛选面板 + 视角切换 + 详情面板 | 2-3 天 |
| Phase 4 | 前端：自动布局 + 交互优化 + 测试 | 1-2 天 |

**总计：约 7-11 天**

## 测试策略

- 单元测试：拓扑数据转换逻辑、筛选逻辑
- 组件测试：ResourceNode、FilterPanel、ViewSwitcher
- 集成测试：完整拓扑页面渲染、交互流程
- E2E 测试：Demo 模式下浏览拓扑、切换视角、筛选

## 性能考虑

- 大量节点 (>500)：启用 React Flow 虚拟化渲染
- 复杂筛选：使用 React Query 缓存
- 自动布局：使用 Web Worker 计算

## 错误处理

- API 失败：错误提示 + 重试按钮
- 无数据：空状态引导用户同步资源
- 关系不完整：显示孤立节点，虚线表示推测关系
