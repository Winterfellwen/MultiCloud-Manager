# Phase 3 设计：UI/UX 页面设计增强

> **目标：** 页面设计 2/5 → 4/5
> **关联审计：** `docs/superpowers/audits/2026-07-17-cloudops-ai-audit-report.md`
> **阶段：** Phase 3 of 8 (Phase 1: P0 修复, Phase 2: 导航)

---

## 1. AI Agent Markdown 渲染

### 现状

AI 回复为纯文本，代码块、表格、列表、标题格式均不渲染，关键缺陷。

### 方案

安装 `react-markdown` + `rehype-highlight`，在聊天消息中渲染 Markdown。

**新增依赖：**
```
react-markdown rehype-highlight @types/react-markdown
```

**改动：**
| 文件 | 改动 |
|------|------|
| `web-console/src/components/chat/ChatMessage.tsx` | 条件判断：如果是 AI 角色消息 → 用 ReactMarkdown 渲染 `content`，否则纯文本 |
| `web-console/src/index.css` 或全局样式 | 添加 Markdown 内容样式（h1-h6、code block、table、ul/ol、blockquote） |
| `web-console/src/components/chat/MarkdownRenderer.tsx` | (可选) 封装 ReactMarkdown 配置，包括 code 块高亮 |

**交互细节：**
- 代码块添加复制按钮（`copy-to-clipboard`）
- 行内代码灰色背景
- 表格带边框
- 链接在新标签页打开
- 安全：禁用 `linkify`，过滤 XSS（react-markdown 默认不执行 HTML）

---

## 2. 表格列排序

### 现状

Resources、Costs 页面的表格点击表头无反应，无法排序。

### 方案

在 `TableWithPagination` 组件中添加排序功能，或每个页面单独实现。

**除非 `TableWithPagination` 已有排序机制，否则方案：**

修改 `web-console/src/components/ui/table-with-pagination.tsx`：
- 添加 `sortable` 属性到 `Column` 定义
- 点击表头切换升序/降序/无排序
- 排序箭头图标在表头显示（▲/▼）

**受影响页面：**
| 页面 | 可排序列 |
|------|---------|
| Resources | name, type, provider, region, status, monthlyCost |
| Costs | provider, service, totalAmount, currency |

**排序逻辑：**
- 纯前端排序（数据已加载到内存）
- 字符串按 localeCompare，数字按数值比较
- date 类型按时间戳比较

---

## 3. 图表可视化

### 现状

成本页仅有表格，无任何图表（recharts 已安装但未使用）。监控页仅有表格告警。

### 方案

使用 recharts 添加可视化图表。

**成本页图表：**
| 图表类型 | 内容 | 位置 |
|---------|------|------|
| 饼图 (PieChart) | 按服务/提供商费用分布 | 汇总卡片下方 |
| 柱状图 (BarChart) | 每日/月费用趋势 | 饼图下方 |

**监控页图表：**
| 图表类型 | 内容 | 位置 |
|---------|------|------|
| 面积图 (AreaChart) | 实例 CPU 使用率时序 (已有，确认是否工作) | 实例详情页 |
| 柱状图 (BarChart) | 告警数量按严重级别分布 | Events tab 上方 |
| 摘要卡片 | "7 严重, 33 警告" 汇总 | Security tab 上方 |

**改动文件：**
| 文件 | 改动 |
|------|------|
| `web-console/src/pages/Costs.tsx` | 添加成本饼图 + 柱状趋势图 |
| `web-console/src/components/monitor/SecurityTab.tsx` | 添加安全摘要卡片 |
| `web-console/src/pages/Monitor.tsx` | Events tab 添加严重级别分布柱状图 |

**数据流：**
- 成本饼图：复用已存在的 `summary` 数据，按 provider 聚合
- 监控柱状图：复用 `events` 数据，按 severity 计数
- 无新增 API 调用

---

## 4. 时间范围选择器

### 现状

Dashboard 无时间范围选择器。Costs 页面有原生 `<input type="date">` 但无预设快捷选项。

### 方案

| 页面 | 改动 |
|------|------|
| Dashboard | 添加时间范围选择器（预设：24h / 7d / 30d），影响 AI 洞察刷新 |
| Costs | 在日期输入下方/旁边添加预设快捷按钮（本月 / 上月 / 近 7 天 / 近 30 天） |

**交互细节：**
- 预设按钮：`今天` / `近 7 天` / `近 30 天` / `本月`
- 选择预设时自动更新日期输入值
- 预设按钮与日期输入双向同步

---

## 5. 状态标签本地化

### 现状

资源状态显示原始英文（`running`、`in-use`、`available`），未本地化。

### 方案

在 `i18n` 中添加状态翻译映射，在 `StatusBadge` 组件中应用。

**新增 i18n 键：**
```json
{
  "status": {
    "running": "运行中",
    "stopped": "已停止",
    "in-use": "使用中",
    "available": "可用",
    "attached": "已挂载",
    "detached": "已卸载",
    "creating": "创建中",
    "deleting": "删除中",
    "error": "错误",
    "unknown": "未知"
  }
}
```

**改动文件：**
| 文件 | 改动 |
|------|------|
| `web-console/src/components/StatusBadge.tsx` | 在显示 status 文本时通过 `t()` 翻译 |
| `web-console/src/i18n/locales/en.json` | 添加 status.* 键 |
| `web-console/src/i18n/locales/zh.json` | 添加 status.* 翻译 |

---

## 安全考虑

- Markdown 渲染使用安全的 react-markdown（默认不渲染原始 HTML）
- 排序纯前端，无新增 API
- 图表纯前端，复用现有数据
- 时间选择器仅影响前端查询参数

---

## 测试计划

| 功能 | 验证点 |
|------|--------|
| Markdown 渲染 | AI 回复中代码块/表格/列表/标题正确渲染，代码块有复制按钮 |
| 表格排序 | 点击表头切换排序状态，箭头图标变化，数据正确排序 |
| 成本图表 | 饼图/柱状图显示正确数据，hover 显示数值 |
| 时间选择器 | 预设按钮正确更新日期范围，双向同步 |
| 状态本地化 | 各页面状态显示翻译后文字而非英文 |
