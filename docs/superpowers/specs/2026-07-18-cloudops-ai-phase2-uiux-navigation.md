# Phase 2 设计：UI/UX 导航与交互增强

> **目标：** Navigation & IA 3→5，Interaction Design & Visual Feedback 3→5
> **关联审计：** `docs/superpowers/audits/2026-07-17-cloudops-ai-audit-report.md`
> **阶段：** Phase 2 of 8（Phase 1: P0 修复已完成）

---

## 1. 侧边栏分组

### 现状

15 项扁平列表，每项有 Lucide 图标，激活态高亮。无分类、无折叠、无搜索。

### 方案

按功能域分为 6 组，每组有标题行，可折叠收起/展开组内项。

| 功能域 | 图标 | 包含项 |
|--------|------|--------|
| 仪表盘 | LayoutDashboard | Dashboard |
| AI Agent | Bot | Chat, AI Ops, Knowledge Base |
| 资源管理 | Boxes | Resources, Topology, Cloud Accounts |
| 监控告警 | Activity | Monitor, Notifications |
| 成本管理 | DollarSign | Costs |
| 系统设置 | Settings2 | Tools, MCP, Users, Audit, AI Settings |

**交互细节：**
- 标题行灰色小字，点击可折叠/展开组
- 当前页面所在组自动展开
- 其他组默认折叠（仅显示标题行）
- hover 标题行显示背景色，提示可点击
- 折叠箭头图标在标题行右侧

### 改动文件

| 文件 | 改动 |
|------|------|
| `web-console/src/components/Sidebar.tsx` | 重写 NAV_ITEMS 为分组结构，添加组折叠状态、标题行渲染 |

---

## 2. 桌面端侧边栏折叠

### 现状

侧边栏固定 240px，无法折叠。

### 方案

VS Code 风格：点击 Topbar 的折叠按钮 → 收缩为 56px 图标栏 → hover 弹出浮层面板。

**状态机：**
| 状态 | 宽度 | 交互 |
|------|------|------|
| 展开 | 240px | 完整导航树，可交互 |
| 折叠 | 56px | 仅显示各组图标（取组内第一个图标或组图标），无文字 |
| Hover | 弹出浮层 280px | 鼠标进入图标栏区域 → 300ms 延迟后弹出浮层面板（完整导航树）→ 鼠标离开浮层面板 → 300ms 延迟后收回 |

**细节：**
- 折叠状态图标栏只显示每组一个代表图标（Dashboard / Bot / Boxes / Activity / DollarSign / Settings2）
- 展开/折叠状态持久化到 localStorage
- Topbar 添加折叠按钮（位于搜索按钮左侧）

### 改动文件

| 文件 | 改动 |
|------|------|
| `web-console/src/components/Layout.tsx` | 添加 sidebarCollapsed 状态，传递给 Sidebar 和 Topbar |
| `web-console/src/components/Sidebar.tsx` | 接收 collapsed prop，渲染图标栏或展开导航树；hover 弹出浮层 |
| `web-console/src/components/Topbar.tsx` | 添加折叠按钮（PanelLeftClose/PanelLeftOpen 图标） |

---

## 3. 面包屑导航

### 现状

无面包屑。用户无法感知当前页面在导航层级中的位置。

### 方案

在 Topbar 下方、内容区顶部显示面包屑导航。

**路由 → 面包屑映射：**
| 路由 | 面包屑 |
|------|--------|
| `/dashboard` | 仪表盘 |
| `/resources` | 资源管理 > 所有资源 |
| `/instances/:id` | 资源管理 > 实例详情 |
| `/topology` | 资源管理 > 拓扑视图 |
| `/cloud-accounts` | 资源管理 > 云厂商管理 |
| `/monitor` | 监控告警 > 监控中心 |
| `/notifications` | 监控告警 > 通知管理 |
| `/costs` | 成本管理 |
| `/chat/react` | AI Agent > AI 助手 |
| `/ai-ops` | AI Agent > AI Ops |
| `/knowledge-base` | AI Agent > 知识库 |
| `/tools` | 系统设置 > 工具箱 |
| `/mcp` | 系统设置 > MCP |
| `/users` | 系统设置 > 用户管理 |
| `/audit` | 系统设置 > 审计日志 |
| `/ai-settings` | 系统设置 > AI 设置 |

**交互细节：**
- 每一级可点击跳转
- 最后一项不加粗，灰色文字
- 分隔符用 `/` 或 `>`（与主题一致）
- 响应式：移动端只显示当前页面名称

### 改动文件

| 文件 | 改动 |
|------|------|
| `web-console/src/components/Breadcrumb.tsx` | 新建组件，根据路由配置映射生成面包屑 |
| `web-console/src/components/Layout.tsx` | 在 Topbar + DemoBanner 下方、main 上方添加 `<Breadcrumb />` |

---

## 4. 移动端抽屉关闭按钮

### 现状

移动端抽屉只能通过点击遮罩关闭或路由切换自动关闭，无显式关闭按钮。

### 方案

在抽屉右上角添加 X 按钮（`X` 图标），点击关闭抽屉。

### 改动文件

| 文件 | 改动 |
|------|------|
| `web-console/src/components/Layout.tsx` | 在 drawer motion.div 内添加关闭按钮 |

---

## 5. Topbar 图标 Tooltip

### 现状

Notification bell、语言切换、主题切换等按钮均为 icon-only，无 tooltip。

### 方案

使用已有的 `<Tooltip>` 组件包装所有 icon-only 按钮：
- Notification bell → "通知"
- 语言切换 → "切换语言"
- 主题切换 → "切换主题 (当前: 深色/浅色)"
- 搜索 → "搜索 (Cmd+K)"（已实现）
- 侧边栏折叠 → "折叠侧边栏"

---

## 6. 骨架加载 (Skeleton)

### 现状

所有页面加载时显示 spinner（`<Loader2 className="animate-spin" />`），感知速度差。

### 方案

为以下页面添加骨架屏组件，模拟最终内容布局：

| 页面 | 骨架内容 |
|------|---------|
| Dashboard | 4 个卡片占位（灰色矩形 pulse）+ 2 行图表占位 |
| Resources | 表格行占位 × 5（columns: name/type/provider/region/status） |
| Monitor | tab bar 占位 + 表格行占位 × 3 |
| Costs | 汇总卡片占位 × 3 + 表格行占位 × 5 |

**技术方案：**
- 使用 Tailwind `animate-pulse` + `bg-muted` 类
- 骨架组件与页面同目录：`DashboardSkeleton.tsx`、`ResourcesSkeleton.tsx` 等
- 或复用通用 `<Skeleton>` 组件

### 改动文件

| 文件 | 改动 |
|------|------|
| `web-console/src/components/ui/skeleton.tsx` | 如果不存在则新建通用 Skeleton 组件 |
| `web-console/src/pages/Dashboard.tsx` | isLoading 时渲染 DashboardSkeleton |
| `web-console/src/pages/Resources.tsx` | isLoading 时渲染 ResourcesSkeleton |
| `web-console/src/pages/Monitor.tsx` | isLoading 时渲染 MonitorSkeleton |
| `web-console/src/pages/Costs.tsx` | isLoading 时渲染 CostsSkeleton |

---

## 7. AI 洞察可折叠

### 现状

Dashboard 的 AI 健康洞察列表一次性渲染所有风险项（10+ 条），不可折叠展开。

### 方案

- 默认显示前 3 条
- 底部显示"展开全部 (N 条)"按钮
- 点击展开全部，按钮变为"收起"
- 展开状态不与后端同步（纯前端状态）

---

## 8. 页面过渡动画

### 现状

Layout.tsx 已有 `AnimatePresence mode="wait"` 包裹 `Outlet`，使用 `fadeUp` 变体。
需要验证是否在所有子页面正常工作。

### 改动

- 修复 Chat 页面在整体布局外时导致的动画异常（`isChatPage ? 'p-0'` 的 padding 变化导致闪动）
- 确保所有路由子页面都能触发 exit/enter 动画

---

## 安全考虑

- 侧边栏折叠/展开状态仅前端存储（localStorage），无新安全风险
- 面包屑纯前端组件，无 API 调用
- 骨架屏纯展示组件，不影响数据流

---

## 测试计划

| 功能 | 测试类型 | 验证点 |
|------|---------|--------|
| 侧边栏分组 | 手动 | 6 组正确分类，点击折叠/展开组内项，当前页面组自动展开 |
| 侧边栏折叠 | 手动 | 点击折叠 → 56px 图标栏 → hover 弹出浮层 → 离开收回 |
| 面包屑 | 手动 | 各路由显示正确面包屑路径，每级可点击 |
| 移动端抽屉 | 手动 | X 按钮关闭抽屉，遮罩关闭正常 |
| 骨架加载 | 视觉 | 各页面首次加载显示骨架，数据到达后平滑切换 |
| AI 洞察折叠 | 手动 | 默认 3 条，展开全部，收起 |
| 页面动画 | 手动 | 路由切换有淡入上移过渡动画 |
