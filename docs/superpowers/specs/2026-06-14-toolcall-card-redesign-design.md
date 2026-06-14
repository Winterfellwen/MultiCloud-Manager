# ToolCallCard 流式输出优化设计

**日期:** 2026-06-14
**状态:** 已确认
**范围:** 前端组件 `ToolCallCard` 重设计

---

## 背景

当前 `ToolCallCard` 在流式输出时存在以下问题：
1. 无参数工具（如 `list_cloud_resources`）显示空 `{}`，可读性差
2. `shell_exec` 等命令类工具，用户更关心执行的命令而非参数结构
3. 运行中无法展开查看当前执行的命令/参数
4. 缺少运行状态的视觉反馈（进度动画、耗时）

---

## 设计目标

1. 为不同类型工具提供可读的一行摘要
2. 运行中支持展开查看参数，完成后可展开查看完整参数+结果
3. 运行中显示进度动画和实时计时

---

## 工具分类与摘要格式

### 分类定义

| 类型 | 工具 | 关键信息 |
|------|------|----------|
| **Action-focused** | `list_cloud_resources`, `get_cloud_stats`, `sync_cloud_resources`, `list_cloud_accounts`, `get_cloud_credentials`, `get_cost_*`, `compare_cross_cloud_costs`, `get_optimization_suggestions`, `apply_optimization`, `create_optimization_rule`, `forecast_cost` | 工具名/动作 |
| **Command-focused** | `shell_exec`, `run_script` | 参数中的命令 |
| **API-focused** | `cloud_api_request` | HTTP 方法 + URL |
| **Resource-focused** | `start_instance`, `stop_instance`, `restart_instance` | 目标资源 ID |

### 摘要格式化规则

```
getToolSummary(tool: ToolCall): string
```

**Action-focused:**
- 无参数: 返回工具描述（如 "List all cloud resources"）
- 有过滤参数: 拼接描述（如 "List Azure resources in eastus"）

**Command-focused:**
- `shell_exec`: 显示 `command` 参数，截断到 50 字符 + "..."
- `run_script`: 显示 `script` 参数第一行，截断到 50 字符 + "..."

**API-focused:**
- 显示 `{method} {url}`，url 截断到 50 字符 + "..."

**Resource-focused:**
- 显示 `{action}: {resource_id}`（如 "Start: vm-abc123"）

---

## 卡片状态行为

### 收起状态（Collapsed）

```
┌─────────────────────────────────────┐
│ ▶  shell_exec: cat docs/...  ●○○  │  <- Running
├─────────────────────────────────────┤
│ ▶  shell_exec: cat docs/...  ✓    │  <- Done
├─────────────────────────────────────┤
│ ▶  shell_exec: cat docs/...  ✗    │  <- Error
└─────────────────────────────────────┘
```

### 展开状态（Expanded）

**Running（默认展开）:**
```
┌─────────────────────────────────────┐
│ ▼  shell_exec                    ⏱  │
├─────────────────────────────────────┤
│ Command                             │
│ cat docs/cloud-api/azure.md         │
└─────────────────────────────────────┘
```

**Done（默认收起，点击展开）:**
```
┌─────────────────────────────────────┐
│ ▼  shell_exec                    ✓  │
├─────────────────────────────────────┤
│ Command                             │
│ cat docs/cloud-api/azure.md         │
│ Result                              │
│ ┌─────────────────────────────────┐ │
│ │ Azure API docs content...       │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

**Error（默认收起，点击展开）:**
```
┌─────────────────────────────────────┐
│ ▼  shell_exec                    ✗  │
├─────────────────────────────────────┤
│ Command                             │
│ cat docs/cloud-api/azure.md         │
│ Error                               │
│ ┌─────────────────────────────────┐ │
│ │ file not found                  │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

---

## 运行状态指示器

### 动画

Running 状态显示三个圆点循环动画：
```css
@keyframes progress-dot {
  0%, 20% { opacity: 1; }
  50% { opacity: 0.3; }
  80%, 100% { opacity: 1; }
}

.progress-dots span:nth-child(1) { animation-delay: 0s; }
.progress-dots span:nth-child(2) { animation-delay: 0.2s; }
.progress-dots span:nth-child(3) { animation-delay: 0.4s; }
```

### 计时器

Running 状态显示实时计时（秒），每秒更新：
```
●○○  2.3s
```

---

## 默认展开/收起行为

| 状态 | 默认 |
|------|------|
| Running | 展开（显示 Parameters） |
| Done | 收起 |
| Error | 收起 |

---

## 参数/结果展示字段名映射

不同工具的参数使用更友好的字段名：

| 工具 | 参数字段 | 显示名称 |
|------|---------|---------|
| `shell_exec` | `command` | `Command` |
| `run_script` | `script` | `Script` |
| `cloud_api_request` | `method` + `url` | `Request` |
| `start_instance` | `resource_id` | `Resource` |
| `stop_instance` | `resource_id` | `Resource` |
| `restart_instance` | `resource_id` | `Resource` |
| 其他 | 原始字段名 | `Parameters` |

---

## 代码改动清单

### 1. `ToolCallCard.tsx`

```typescript
// 新增
function getToolSummary(tool: ToolCall): string
function getStatusIcon(status: string): JSX.Element
function getParamsLabel(toolName: string): string
function ProgressDots(): JSX.Element
function ElapsedTimer(): JSX.Element
```

**改动：**
- 添加 `useState` for elapsed time
- 添加 `useEffect` for timer interval
- 添加 `getToolSummary()` 计算摘要
- 修改 header 显示摘要而非工具名
- Running 时默认 `expanded = true`
- Running 时只显示 Parameters，不显示 Result

### 2. `index.css`

```css
/* 新增 */
.tool-summary          /* 摘要文本样式 */
.progress-dots         /* 动画圆点容器 */
.progress-dots span    /* 单个圆点 */
.elapsed-time          /* 计时器文本 */
```

### 3. `MessageItem.tsx`

**改动：**
- 移除 streaming 时的 `.tool-calls-inline` + `.tool-block` 渲染
- 改为统一使用 `<ToolCallCard />` 渲染所有工具调用

---

## 测试场景

1. `list_cloud_resources` 无参数调用 → 显示 "List all cloud resources"
2. `list_cloud_resources` with cloud_type=azure → 显示 "List Azure resources"
3. `shell_exec` with command → 显示命令（截断50字符）
4. `cloud_api_request` → 显示 "GET https://..."
5. `start_instance` → 显示 "Start: vm-xxx"
6. Running 状态 → 显示动画 + 计时器，默认展开
7. Done 状态 → 显示 ✓，默认收起，点击展开有 Result
8. Error 状态 → 显示 ✗，默认收起，点击展开有 Error
