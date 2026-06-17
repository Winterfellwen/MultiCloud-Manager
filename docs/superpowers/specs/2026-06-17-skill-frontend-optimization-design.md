# MultiCloud Manager 技能系统与前端优化设计文档

> **日期**: 2026-06-17
> **范围**: 阶段一（技能系统升级 + 前端模块化拆分）
> **参考**: Anthropic Skills (SKILL.md 标准)、SaaS Boilerplate 前端架构

---

## 一、现状分析

### 1.1 技能系统现状

当前技能系统位于 `internal/agent/skill/`，仅包含两个文件：

- `engine.go`: 轻量级开关机制，`map[string]*SkillState` 存储启用状态
- `loader.go`: 从 JSON 配置文件加载 `Shell`、`MCPServers`、`Skills`、`Vault` 配置

**问题**：
- 技能只是布尔开关，无结构化定义
- 技能与工具注册、权限控制完全脱节
- 无法传参、条件触发、组合执行
- 无阶段化流程（如 `/spec` `/plan` `/build`）

### 1.2 前端现状

前端为单文件 SPA：`web/index.html`（约 7809 行），内嵌 CSS + JS。

**问题**：
- JS 逻辑全部挤在一个文件，协作困难
- 无状态管理，纯 DOM 操作
- 无组件复用机制
- API 调用分散，无统一封装

---

## 二、设计目标

### 2.1 技能系统升级目标

1. **SKILL.md 格式支持**: 技能以结构化 Markdown 文件定义，包含 YAML 元数据 + Markdown 正文
2. **工具绑定**: 技能声明可用工具集合，Agent 自动加载对应工具
3. **触发机制**: 支持指令关键词 + 场景自动激活
4. **阶段化流程**: 参考软件开发生命周期，支持 `/spec` `/plan` `/build` `/test` `/review` `/ship` 阶段指令
5. **参数配置**: 技能可声明配置参数，用户可自定义阈值、范围等

### 2.2 前端模块化拆分目标

1. **JS 按功能模块拆分**: accounts.js、resources.js、chat.js、cost.js 等
2. **轻量级状态管理**: 引入 EventEmitter 模式，不引入框架
3. **UI 组件抽离**: Toast、Modal、Table、Dropdown 等复用组件
4. **API 统一封装**: api.js 统一处理 fetch、错误、认证
5. **保持单文件部署**: 构建时合并，不增加部署复杂度

---

## 三、技能系统设计

### 3.1 SKILL.md 格式规范

参考 Anthropic Skills 标准，定义以下格式：

```markdown
---
name: cloud-cost-optimize
description: 分析云成本并给出优化建议
triggers:
  - keywords: ["成本", "费用", "优化", "省钱"]
    priority: 1
  - keywords: ["账单", "支出"]
    priority: 2
tools:
  - getCostOverview
  - getCostTrend
  - getOptimizationSuggestions
  - applyOptimization
config:
  - name: threshold
    type: number
    default: 100
    description: 成本阈值（美元）
  - name: period
    type: string
    default: "30d"
    description: 分析周期
---

## 使用流程

1. 调用 `getCostOverview` 获取本月成本概览
2. 调用 `getCostTrend` 分析趋势
3. 调用 `getOptimizationSuggestions` 获取建议
4. 如需执行优化，调用 `applyOptimization`

## 注意事项

- 仅对 admin 角色开放执行权限
- 优化前建议先查看趋势确认异常
```

### 3.2 技能加载与执行流程

```
用户输入
    │
    ▼
┌─────────────────┐
│  SkillMatcher   │  ← 检测输入是否匹配技能 triggers
│  (关键词匹配)    │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
 匹配成功   匹配失败
    │         │
    ▼         ▼
┌─────────┐  ┌─────────────┐
│ 加载    │  │ 使用默认    │
│ SKILL.md│  │ 系统提示词  │
│ 内容    │  │             │
└────┬────┘  └─────────────┘
     │
     ▼
┌─────────────────┐
│ 注入技能上下文   │
│ - 技能描述      │
│ - 可用工具列表  │
│ - 配置参数      │
│ - 使用流程      │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 构建系统提示词   │
│ (基础提示词 +    │
│  技能上下文)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ 调用 LLM        │
└─────────────────┘
```

### 3.3 技能与工具权限绑定

技能声明 `tools` 列表后，Agent 在执行该技能时：
- 仅暴露声明的工具给 LLM
- 未声明的工具不可见
- 支持 viewer 角色的只读过滤（与现有 `ReadOnlyTools` 机制叠加）

### 3.4 阶段化指令

参考软件开发生命周期，支持以下阶段指令：

| 指令 | 功能 | 适用场景 |
|------|------|----------|
| `/spec` | 定义规格，明确要做什么 | 用户意图不明确时 |
| `/plan` | 规划执行步骤 | 复杂任务拆解 |
| `/build` | 执行操作 | 创建/修改资源 |
| `/test` | 验证结果 | 确认操作成功 |
| `/review` | 评审输出 | 检查配置合理性 |
| `/ship` | 确认并应用 | 最终确认 |

阶段指令在 SKILL.md 中定义支持哪些阶段，Agent 根据当前阶段调整提示词。

### 3.5 新增/修改文件

| 文件 | 操作 | 说明 |
|------|------|------|
| `internal/agent/skill/parser.go` | 新建 | SKILL.md 解析器（YAML 前置元数据 + Markdown 正文） |
| `internal/agent/skill/matcher.go` | 新建 | 触发匹配引擎（关键词匹配、优先级排序） |
| `internal/agent/skill/skill.go` | 新建 | Skill 结构体定义 |
| `internal/agent/skill/loader.go` | 修改 | 扩展为支持从目录加载 SKILL.md 文件 |
| `internal/agent/skill/engine.go` | 修改 | 扩展为支持技能上下文注入、工具过滤 |
| `internal/agent/prompt.go` | 修改 | PromptBuilder 支持注入技能上下文 |
| `internal/agent/runtime.go` | 修改 | Runtime 初始化时加载技能目录 |
| `skills/` | 新建目录 | 存放 SKILL.md 文件 |
| `skills/cloud-cost-optimize/SKILL.md` | 新建 | 成本优化技能示例 |
| `skills/cloud-resource-query/SKILL.md` | 新建 | 资源查询技能示例 |
| `skills/cloud-security-audit/SKILL.md` | 新建 | 安全审计技能示例 |

---

## 四、前端模块化设计

### 4.1 目录结构

```
web/
├── index.html              # 主骨架（精简 HTML + 内联关键 CSS）
├── css/
│   ├── variables.css       # CSS 变量（主题色、字体、间距）
│   ├── base.css           # 重置 + 全局样式
│   ├── layout.css         # 侧边栏、topbar、content 布局
│   └── components.css     # 卡片、表格、表单、弹窗等组件
├── js/
│   ├── app.js             # 入口：初始化、路由、全局事件
│   ├── api.js             # API 封装：fetch、错误处理、认证头
│   ├── state.js           # EventEmitter 轻量级状态管理
│   ├── utils.js           # 工具函数（debounce、formatDate 等）
│   ├── components/        # UI 组件
│   │   ├── toast.js       # Toast 通知
│   │   ├── modal.js       # 弹窗
│   │   ├── table.js       # 表格（排序、分页）
│   │   ├── dropdown.js    # 下拉菜单
│   │   └── chart.js       # Chart.js 封装
│   └── pages/             # 页面逻辑
│       ├── dashboard.js   # Dashboard 页面
│       ├── accounts.js    # Accounts 页面
│       ├── resources.js   # Resources 页面
│       ├── sync.js        # Sync 页面
│       ├── cost.js        # Cost 页面
│       ├── terminal.js    # Terminal 页面
│       ├── chat.js        # AI Chat 页面
│       └── profile.js     # Profile 页面
└── static/
    └── icons.svg          # SVG 图标集合
```

### 4.2 状态管理设计

使用 EventEmitter 模式实现轻量级状态管理：

```javascript
// js/state.js
class StateManager extends EventTarget {
  constructor() {
    super();
    this._state = {
      user: null,
      theme: localStorage.getItem('theme') || 'dark',
      currentPage: 'dashboard',
      notifications: [],
      sidebarCollapsed: false,
      // 各页面状态
      accounts: { list: [], loading: false },
      resources: { list: [], filter: 'all', loading: false },
      chat: { sessions: [], currentSession: null, messages: [] },
    };
  }

  get(key) {
    return key ? this._state[key] : this._state;
  }

  set(key, value) {
    const oldValue = this._state[key];
    this._state[key] = value;
    this.dispatchEvent(new CustomEvent(`state:${key}`, {
      detail: { key, value, oldValue }
    }));
  }

  // 支持嵌套路径
  setPath(path, value) {
    // 实现...
  }
}

const state = new StateManager();
export default state;
```

### 4.3 API 封装设计

```javascript
// js/api.js
const API_BASE = '/api';

class APIClient {
  constructor() {
    this.token = localStorage.getItem('token');
  }

  async request(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    const headers = {
      'Content-Type': 'application/json',
      ...(this.token && { 'Authorization': `Bearer ${this.token}` }),
      ...options.headers,
    };

    const response = await fetch(url, { ...options, headers });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new APIError(response.status, error.message || 'Request failed');
    }

    return response.json();
  }

  get(endpoint) { return this.request(endpoint, { method: 'GET' }); }
  post(endpoint, data) { return this.request(endpoint, { method: 'POST', body: JSON.stringify(data) }); }
  delete(endpoint) { return this.request(endpoint, { method: 'DELETE' }); }
}

// 各模块 API
export const accountsAPI = {
  list: () => api.get('/accounts'),
  create: (data) => api.post('/accounts', data),
  update: (id, data) => api.post(`/accounts/${id}`, data),
  delete: (id) => api.delete(`/accounts/${id}`),
  sync: (id) => api.post(`/accounts/${id}/sync`),
};

export const resourcesAPI = {
  list: () => api.get('/resources'),
  sync: () => api.post('/resources/sync'),
  action: (id, action) => api.post(`/resources/${id}/${action}`),
};

export const chatAPI = {
  sessions: () => api.get('/agent/sessions'),
  createSession: (data) => api.post('/agent/sessions', data),
  stream: (sessionId, message) => { /* SSE 处理 */ },
};
```

### 4.4 组件设计

#### Toast 组件
```javascript
// js/components/toast.js
export class Toast {
  static show(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), duration);
  }
}
```

#### Modal 组件
```javascript
// js/components/modal.js
export class Modal {
  constructor(options) {
    this.title = options.title;
    this.content = options.content;
    this.onConfirm = options.onConfirm;
    this.onCancel = options.onCancel;
  }

  show() { /* 渲染弹窗 */ }
  hide() { /* 关闭弹窗 */ }
}
```

### 4.5 页面模块设计

每个页面模块遵循统一接口：

```javascript
// js/pages/accounts.js
export const accountsPage = {
  name: 'accounts',

  async init() {
    // 初始化页面
    this.render();
    this.bindEvents();
    await this.loadData();
  },

  render() {
    // 渲染页面结构
  },

  bindEvents() {
    // 绑定事件
  },

  async loadData() {
    // 加载数据
    state.setPath('accounts.loading', true);
    try {
      const data = await accountsAPI.list();
      state.setPath('accounts.list', data);
    } catch (err) {
      Toast.show(err.message, 'error');
    } finally {
      state.setPath('accounts.loading', false);
    }
  },

  destroy() {
    // 清理资源
  }
};
```

### 4.6 构建流程

保持单文件部署，使用 Go 嵌入或简单脚本合并：

```go
// internal/api/router.go
// 使用 embed 嵌入构建后的单个 HTML 文件
//go:embed all:web/dist
var webFS embed.FS
```

构建脚本（可选，Makefile）：
```makefile
.PHONY: build-web
build-web:
	@echo "Building web assets..."
	@cat web/css/variables.css web/css/base.css web/css/layout.css web/css/components.css > web/dist/style.css
	@cat web/js/state.js web/js/api.js web/js/utils.js \
	    web/js/components/*.js \
	    web/js/pages/*.js \
	    web/js/app.js > web/dist/app.js
	@cp web/index.html web/dist/index.html
	@sed -i 's|<!-- CSS_PLACEHOLDER -->|<style>'"$$(cat web/dist/style.css)'</style>|' web/dist/index.html
	@sed -i 's|<!-- JS_PLACEHOLDER -->|<script>'"$$(cat web/dist/app.js)'</script>|' web/dist/index.html
```

---

## 五、API 设计

### 5.1 技能管理 API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/skills` | 列出所有技能 |
| GET | `/api/skills/:name` | 获取技能详情 |
| POST | `/api/skills/:name/enable` | 启用技能 |
| POST | `/api/skills/:name/disable` | 禁用技能 |
| PUT | `/api/skills/:name/config` | 更新技能配置 |

### 5.2 技能数据结构

```go
type Skill struct {
    Name        string                 `json:"name"`
    Description string                 `json:"description"`
    Enabled     bool                   `json:"enabled"`
    Triggers    []SkillTrigger         `json:"triggers"`
    Tools       []string               `json:"tools"`
    Config      []SkillConfigParam     `json:"config"`
    Content     string                 `json:"content"` // Markdown 正文
}

type SkillTrigger struct {
    Keywords []string `json:"keywords"`
    Priority int      `json:"priority"`
}

type SkillConfigParam struct {
    Name        string      `json:"name"`
    Type        string      `json:"type"` // string, number, boolean
    Default     interface{} `json:"default"`
    Description string      `json:"description"`
}
```

---

## 六、安全设计

1. **技能文件安全**: SKILL.md 文件由管理员编写，存储在服务端，用户无法上传自定义技能
2. **工具权限叠加**: 技能声明的工具列表与现有 `ReadOnlyTools` 机制叠加，viewer 角色无法调用写入工具
3. **配置参数校验**: 技能配置参数在服务端校验类型和范围
4. **前端状态隔离**: 状态管理不存储敏感信息（token 仍存 localStorage，但 API 封装统一处理）

---

## 七、测试策略

1. **技能解析测试**: 测试 SKILL.md 解析器对各种格式文件的正确解析
2. **触发匹配测试**: 测试关键词匹配、优先级排序
3. **工具过滤测试**: 测试技能工具列表与只读白名单的叠加逻辑
4. **前端模块测试**: 测试状态管理、API 封装、组件渲染

---

## 八、实施计划

### 阶段一（本期）

1. 技能系统升级
   - 实现 SKILL.md 解析器
   - 实现触发匹配引擎
   - 扩展 PromptBuilder 支持技能上下文注入
   - 编写示例技能文件

2. 前端模块化拆分
   - 创建目录结构
   - 实现状态管理（state.js）
   - 实现 API 封装（api.js）
   - 拆分页面模块
   - 抽离 UI 组件
   - 更新 index.html 为精简骨架

### 阶段二（后续）

- AI 对话 Markdown 渲染
- 资源批量操作 + 确认弹窗
- 成本图表交互优化
- Terraform 完整工作流

### 阶段三（后续）

- 数据库连接池优化
- Redis 缓存 TTL 调整
- API 限流精细化
- 前端 CSP 安全头

---

## 九、风险评估

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| 前端模块化引入回归 bug | 高 | 保持现有功能不变，仅拆分代码，逐个页面验证 |
| 技能系统升级影响现有对话 | 中 | 默认技能全部启用，保持向后兼容 |
| 构建流程变更影响部署 | 中 | 保留原 index.html 作为 fallback，逐步切换 |

---

## 十、参考资源

1. [Anthropic Skills 官方仓库](https://github.com/anthropics/skills) (108k+ stars)
2. [Agent Skills 论文](https://arxiv.org/pdf/2602.12430.pdf)
3. [SaaS Boilerplate](https://github.com/apptension/saas-boilerplate) (2.5k stars)
4. [async-labs/saas](https://github.com/async-labs/saas) (4k stars)
