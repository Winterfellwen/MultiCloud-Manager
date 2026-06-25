# 拓扑视图重设计

## 概述

将现有平面拓扑图升级为支持自动聚簇、多维分组、详情弹窗和动画过渡的现代化拓扑可视化系统。核心目标：300+ 节点下保持视觉清晰，点击节点时提供丰富的上下文信息。

## 核心设计

### 1. 自动聚簇（ClusterNode）

当节点数 > 阈值（默认 50）时，自动将同类型/同区域的节点折叠为 **ClusterNode**：

```
┌─────────────────────────┐
│  ▼ VPC-1 (12 节点)      │   ← 折叠态：显示名称 + 子节点数 + 状态摘要
│  ● ● ● ● ● ● ● ● ● ● │
└─────────────────────────┘
         ↓ 双击展开
┌─────────┐ ┌─────────┐
│Instance │ │Instance │   ← 展开态：显示子节点
│  ...    │ │  ...    │
└─────────┘ └─────────┘
```

**ClusterNode 规格：**
- 类型：`cluster`（React Flow 自定义节点）
- 显示：折叠图标 + 名称 + 子节点数 + 状态分布小圆点
- 交互：双击展开/折叠；点击展开详情弹窗
- 动画：`framer-motion` `AnimatePresence` + `layout` 属性实现展开/折叠过渡
- 边连接：折叠态用聚合边（粗线 + 子节点数标签），展开态用原始边

**聚簇策略（按 groupingMode 动态切换）：**

| 分组模式 | 聚簇维度 | 聚簇条件 |
|---------|---------|---------|
| hierarchy（默认） | `type` + `parentId` | 同类型且有父子关系 |
| semantic | `category` | 同资源分类（compute/network/database） |
| team | `data.cloudAccountId` | 同云账号 |
| cost | `region` | 同区域 |

### 2. 分组模式切换

顶部工具栏新增分组模式切换器（4 个按钮）：

```
[ 层级 ] [ 语义 ] [ 团队 ] [ 成本 ]
```

切换时触发：
1. 根据新模式重新计算聚簇
2. `framer-motion` `layoutId` 驱动节点位置动画（~300ms ease-out）
3. dagre 重新布局（Web Worker）

### 3. 节点详情弹窗

点击节点（非双击）弹出居中 Modal，替代现有侧边面板：

**弹窗结构：**
```
┌──────────────────────────────────────┐
│  ×                                    │
│  [Instance-42]  ● running  aws/ap-east│
│                                      │
│  ┌──────┬────────┬──────┬──────────┐│
│  │概览   │指标    │日志   │连接      ││
│  ├──────┴────────┴──────┴──────────┤│
│  │                                  ││
│  │  (Tab content)                  ││
│  │                                  ││
│  └──────────────────────────────────┘│
│                                      │
│  [ 跳转详情 ]                       │
└──────────────────────────────────────┘
```

**Tab 定义：**

| Tab | 内容 | 数据来源 |
|-----|------|---------|
| 概览 | 基本属性（CPU/内存/磁盘/状态/标签） | 节点 data |
| 指标 | CPU/内存/网络使用率折线图 | 后续 API |
| 日志 | 最近日志条目（最多 50 条） | 后续 API |
| 连接 | 上下游节点列表 + 关系类型 | edges 过滤 |

**弹窗规格：**
- 宽度：`max-w-2xl`（响应式）
- 动画：`framer-motion` scale + fade（`initial={{ scale: 0.95, opacity: 0 }}`）
- 背景遮罩：`bg-black/40 backdrop-blur-sm`
- ESC 关闭 + 点击遮罩关闭

### 4. 动画系统

| 场景 | 动画 | 实现 |
|------|------|------|
| 聚簇展开/折叠 | 子节点飞入/飞出 | `framer-motion` `AnimatePresence` + `layout` |
| 分组模式切换 | 节点位置平滑过渡 | React Flow `fitView({ duration: 300 })` |
| 弹窗打开/关闭 | scale + fade | `framer-motion` `motion.div` |
| 节点 hover | 微放大 + 阴影增强 | CSS `transition: all 0.15s` |
| 加载态 | 骨架屏脉冲 | Tailwind `animate-pulse` |

### 5. Web Worker 布局

dagre 计算移至 Web Worker，避免阻塞主线程：

```typescript
// workers/dagre-layout.worker.ts
// 接收 nodes + edges → 执行 dagre.layout → 返回 positioned nodes
// 主线程通过 postMessage 通信
```

**触发时机：**
- 初始加载
- 分组模式切换
- 筛选条件变更
- 节点展开/折叠

## 技术架构

### 新增文件

```
web-console/src/
├── components/topology/
│   ├── ClusterNode.tsx          # 聚簇节点
│   ├── GroupModeSwitcher.tsx    # 分组模式切换器
│   ├── NodeDetailModal.tsx      # 节点详情弹窗（替代 NodeDetailPanel）
│   ├── NodeDetailTabs/
│   │   ├── OverviewTab.tsx      # 概览 tab
│   │   ├── MetricsTab.tsx       # 指标 tab（placeholder）
│   │   ├── LogsTab.tsx          # 日志 tab（placeholder）
│   │   └── ConnectionsTab.tsx   # 连接 tab
│   └── TopologyCanvas.tsx       # 重构：集成 ClusterNode + Worker
├── workers/
│   └── dagre-layout.worker.ts   # dagre Web Worker
├── hooks/
│   └── useTopologyCluster.ts    # 聚簇计算逻辑
└── types/
    └── topology.ts              # 新增 ClusterNode / GroupMode 类型
```

### 类型扩展

```typescript
// types/topology.ts 新增

export type GroupMode = 'hierarchy' | 'semantic' | 'team' | 'cost';

export interface ClusterData {
  id: string;
  label: string;
  groupMode: GroupMode;
  childNodeIds: string[];
  collapsed: boolean;
  statusSummary: Record<string, number>;  // { running: 5, stopped: 2 }
  category: TopologyCategory;
  icon: string;
}

// TopologyNode 扩展
export interface TopologyNode {
  // ...existing fields
  parentId?: string;  # 聚簇时的父 cluster ID
}
```

### 现有文件修改

| 文件 | 修改 |
|------|------|
| `types/topology.ts` | 新增 `GroupMode`、`ClusterData` 类型；`TopologyNode` 增加 `parentId` |
| `TopologyCanvas.tsx` | 集成 ClusterNode nodeType；调用 Worker；移除 NodeDetailPanel，改用 NodeDetailModal |
| `ResourceNode.tsx` | 微调样式适配聚簇态（compact mode） |
| `Topology.tsx` | 顶部增加 GroupModeSwitcher |
| `TopologyFilter.tsx` | 保持不变 |
| `i18n/locales/{zh,en}.json` | 新增分组模式/弹窗 tab 翻译 |

## Demo 模式扩展

现有 demo 数据已包含 VPC → Subnet → Instance 层级关系。增强：

- 增加 `cloudAccountId` 到所有节点 data（用于 team 分组）
- 增加 `data.monthlyCost` 字段（用于 cost 分组展示）
- 总节点数从 ~80 扩展到 ~150（增加更多子节点）

## i18n

```json
{
  "topology": {
    "groupMode": {
      "hierarchy": "层级",
      "semantic": "语义",
      "team": "团队",
      "cost": "成本"
    },
    "cluster": {
      "nodes": "个节点",
      "expand": "展开",
      "collapse": "折叠"
    },
    "detailModal": {
      "overview": "概览",
      "metrics": "指标",
      "logs": "日志",
      "connections": "连接",
      "viewDetails": "跳转详情",
      "noMetrics": "指标数据待接入",
      "noLogs": "日志数据待接入"
    }
  }
}
```

## 实施阶段

| 阶段 | 内容 | 预估 |
|------|------|------|
| Phase 1 | 聚簇逻辑 + ClusterNode + 分组切换 | 2-3 天 |
| Phase 2 | 详情弹窗 + Tab 内容 | 1-2 天 |
| Phase 3 | 动画 + Web Worker + Demo 扩展 | 1-2 天 |

## 性能目标

- 300 节点：聚簇后渲染 < 100 个可视节点，首屏 < 1s
- 分组切换：< 500ms（含动画）
- 弹窗打开：< 200ms
