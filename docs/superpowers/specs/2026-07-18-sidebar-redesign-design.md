# 侧边栏二级菜单 Redesign 设计文档

**日期**: 2026-07-18
**状态**: 已批准 (设计中)
**作者**: AI 助手 (基于用户反馈迭代)

## 背景与目标

当前右侧侧边栏存在三个核心问题，用户反馈"二级菜单不好用"：

1. **展开/收缩分组的动画不直观** — 分组展开/收缩时无过渡动画，条目瞬间闪出/消失，交互生硬。
2. **条目间距或字体大小不舒服** — 组标题与条目字号分级不明显，条目 padding 偏小，激活态使用重阴影（box-shadow）视觉偏重。
3. **分组编排不合理** — "仪表盘"组和"成本"组各只有一个与组名完全相同的条目，存在"组名=唯一条目名"的冗余；"系统"组堆积了 5 个条目（工具/MCP/用户/审计/AI设置），职责混杂。

**目标**：重新设计侧边栏的导航结构、视觉层级与展开动画，使其更直观、舒适、合理。保持现有的权限过滤、i18n、折叠模式（collapsed）与移动端抽屉等能力不变。

## 设计原则

- **消除冗余**：不再为单一条目创建"同名组"。只有真正含多个子项的才用分组。
- **清晰分级**：组标题（section header）与条目（nav item）在字号、字重、颜色上明确区分。
- **轻量激活态**：用左侧 accent 竖条 + 浅底，替代当前的重阴影。
- **平滑动画**：分组展开/收缩使用 CSS 过渡，不再瞬间闪现。
- **保持兼容**：权限过滤（`hasPermission`）、i18n 标签、折叠模式 hover 弹窗、移动端抽屉、localStorage 持久化全部保留。

---

## 一、导航结构（编排方案 A：单条目提升）

### 新结构

```
📊 仪表盘          (顶级项, 无分组)
💰 成本            (顶级项, 无分组)

🤖 AI 代理         (分组)
   ├─ AI Agent 聊天
   ├─ AI Ops
   ├─ 知识库
   └─ AI 设置        ← 从"系统"组移入

📦 资源管理        (分组)
   ├─ 资源列表
   ├─ 拓扑图
   └─ 云账号

📈 监控            (分组)
   ├─ 监控面板
   └─ 通知

👥 管理            (分组, 新增)
   ├─ 用户管理       ← 从"系统"组移入
   └─ 审计日志       ← 从"系统"组移入

⚙️ 系统            (分组, 默认收起)
   ├─ 工具
   └─ MCP 配置
```

### 与现状的对比

| 现状问题 | 新方案 |
|---------|--------|
| 仪表盘组只有"仪表盘"一个条目 | 仪表盘提升为顶级项 |
| 成本组只有"成本"一个条目 | 成本提升为顶级项 |
| AI 设置藏在系统组 | 移入 AI 代理组（与 AI 功能聚合） |
| 系统组堆积 5 项 | 拆分出"管理"组（用户+审计），系统组仅留工具+MCP |
| 所有分组默认展开 | 仅"系统"组默认收起，其余默认展开 |

### 路由映射（不变）

所有 `to` 路径保持不变（如 `/dashboard`、`/costs`、`/chat/react`、`/ai-ops`、`/knowledge-base`、`/resources`、`/topology`、`/cloud-accounts`、`/monitor`、`/notifications`、`/users`、`/audit`、`/tools`、`/mcp`、`/ai-settings`）。

---

## 二、视觉层级与间距（间距字体优化）

### 字体与颜色分级

| 元素 | 字号 | 字重 | 颜色 (CSS var) | 其他 |
|------|------|------|---------------|------|
| 顶级项 / 分组内条目 | 14px | medium (500) | `text-foreground` (激活) / `text-muted-foreground` (默认) | — |
| 组标题 (section header) | 12px | semibold (600) | `text-slate-600` (`#475569`) | uppercase + `tracking-wide` (字间距) |
| Logo 文字 | 18px (lg) | bold (700) | `text-foreground` | — |

> 说明：组标题采用 12px 半粗体大写 + 字间距，与 14px 中等字重条目形成清晰的两级差异，解决"分级不明显"问题。

### 间距规范

| 元素 | Padding | 外边距 |
|------|---------|--------|
| 顶级项 | `py-2.5 px-4` (10px / 16px) | `mb-2` (8px) 与下一项间隔 |
| 分组内条目 | `py-2 px-4` (8px / 16px) | 条目间 `gap-0.5` (2px) |
| 组标题 | `py-2 px-3` (8px / 12px) | 与上一组 `mt-4` (16px) 间隔 |
| 分组容器 | — | 组间 `space-y-2` 或 `mt-4` |

> 相比现状（条目 `py-2 px-3`、组间无显式大间隔），新方案增大了顶级项 padding 与组间 margin，缓解"间距不舒服"。

### 激活态（轻量化）

- **激活条目**：左侧 `border-l-[3px]` accent 竖条（`border-primary`）+ `bg-background`（白底）+ `font-semibold` + `text-foreground`
- **默认条目**：`border-l-[3px] border-transparent`（占位对齐）+ `text-muted-foreground` + hover `bg-background/80 hover:text-foreground`
- **移除**现状的 `shadow-md ring-1 ring-border` 重阴影，改用更轻量的左侧 accent 条

### 顶级项 vs 分组内条目

- 顶级项（仪表盘、成本）：与分组内条目同字号，但**不带左侧缩进**，且激活态同样用左侧 accent 条
- 为区分"顶级项"与"分组"，顶级项可加轻微 `bg-muted/50` 底色或仅依赖位置（位于所有分组上方）

---

## 三、展开/收缩动画（动画优化）

### 技术方案

使用 CSS `max-height` + `transition` 实现平滑展开/收缩，替代现状的瞬间显隐：

```css
/* 分组内容容器 */
.group-content {
  overflow: hidden;
  max-height: 1000px;          /* 展开态：足够大的值 */
  transition: max-height 0.25s ease;
}
.group-content.collapsed {
  max-height: 0;               /* 收缩态：完全收起 */
}

/* Chevron 图标旋转 */
.chevron {
  transition: transform 0.2s ease;
}
.chevron.collapsed {
  transform: rotate(-90deg);   /* 或 0deg，视初始方向 */
}
```

> 注：`max-height` 过渡在内容高度变化时有轻微"缓动末尾延迟"，但相比 `display:none` 切换已显著改善。若需要更精确，可改用 CSS Grid `grid-template-rows: 0fr / 1fr` 技巧（现代浏览器支持）。

### 行为

- 分组标题点击 → 切换 `expandedGroups[key]` 状态（已存在，持久化于 localStorage `sidebar:expandedGroups`）
- 状态变化 → 内容容器 `max-height` 在 `0` 与 `1000px` 间过渡（0.25s），Chevron 同步旋转（0.2s）
- 路由切换时：若当前活动分组未展开，自动展开（保留现状行为）
- **默认状态**：系统组默认收起（`expandedGroups` 初始值不含 `system`），其余默认展开

### 折叠模式（collapsed）兼容

- 现状的 `CollapsedNav` hover 弹窗（300ms 延迟）结构不变，但弹窗内的条目样式同步应用新视觉规范（间距、激活态、字体分级）
- 弹窗内分组同样支持平滑展开/收缩

---

## 四、技术实现要点

### 涉及文件

| 文件 | 改动 |
|------|------|
| `web-console/src/components/Sidebar.tsx` | 重构 `NAV_GROUPS` 数据结构（支持顶级项 vs 分组）；重写渲染逻辑应用新视觉规范；添加展开动画 CSS class |
| `web-console/src/i18n/locales/zh.json` / `en.json` | 新增 `nav.group.admin`（`管理`）标签；其余标签沿用 |
| `web-console/src/index.css` | 新增 `.sidebar-group-content` / `.sidebar-chevron` 动画类（或使用 Tailwind arbitrary values 内联） |

### 数据结构变更

现状 `NavGroup` 强制每个组有 `items` 数组。新方案需支持"顶级项"（无子项）。建议：

```ts
interface NavNode {
  type: 'item' | 'group';
  key: string;
  label: string;
  icon: LucideIcon;
  to?: string;                          // type==='item' 时
  permission?: { resource: string; action: string };
  children?: NavItem[];                 // type==='group' 时
  defaultCollapsed?: boolean;           // 系统组默认收起
}
```

`NAV_GROUPS` 改为 `NavNode[]`，渲染时根据 `type` 分支：
- `item` → 渲染为顶级导航链接（带激活态 accent 条）
- `group` → 渲染为组标题 + 可折叠子列表

### 权限过滤

保留现状逻辑：每个 `item` / `group.children[].permission` 经 `hasPermission(user.role, ...)` 过滤，无权限则隐藏。

### i18n

所有 `label` 通过 `t()` 解析，新增 `nav.group.admin` 键。中英文均需添加。

### 折叠模式（collapsed）与移动端

- `CollapsedNav` 组件同步更新为新 `NavNode[]` 结构
- 移动端抽屉（`Layout.tsx` 中的 `framer-motion` 动画）不变，仅内部内容应用新样式

### 主题兼容

所有颜色使用现有 CSS 变量（`text-foreground`、`text-muted-foreground`、`bg-background`、`bg-muted`、`border-primary` 等），自动适配 light/dark 模式。不引入硬编码颜色。

---

## 五、测试与验收

### 功能验收

- [ ] 仪表盘、成本作为顶级项显示，无冗余组名
- [ ] AI 代理组含 4 项（聊天/AI Ops/知识库/AI 设置）
- [ ] 新增"管理"组含用户管理、审计日志
- [ ] 系统组仅含工具、MCP 配置，且默认收起
- [ ] 点击组标题 → 子列表平滑展开/收缩（0.25s），Chevron 旋转
- [ ] 激活条目显示左侧 3px accent 条 + 浅底
- [ ] 权限过滤正常（viewer 角色看不到无权限项）
- [ ] 折叠模式 hover 弹窗样式同步更新
- [ ] 移动端抽屉导航正常

### 视觉验收

- [ ] 组标题（12px 大写）与条目（14px）分级清晰
- [ ] 顶级项与分组间有合理间距（16px）
- [ ] 浅/暗色主题下对比度正常

### 回归测试

- [ ] 路由跳转正常，active 高亮正确
- [ ] localStorage `sidebar:expandedGroups` 持久化生效
- [ ] 现有所有页面可通过侧边栏访问

---

## 六、范围之外（YAGNI）

- 不新增导航项或新页面
- 不改变路由结构
- 不引入新的状态管理库
- 不做侧边栏可拖拽宽度调整
- 不改动 Topbar、Layout 的整体布局（仅 Sidebar 内部重构）
