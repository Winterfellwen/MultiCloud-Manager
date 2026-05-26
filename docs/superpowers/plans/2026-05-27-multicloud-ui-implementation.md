# MultiCloud UI 统一实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** 构建桌面 Web SPA（单 HTML，响应式，双主题）+ 重写小程序 UI

**Architecture:** 桌面版为单 HTML SPA，所有页面在同一文件中通过 JS 路由切换，CSS 变量驱动双主题；小程序提取同一套设计 tokens 到 WXSS

**Tech Stack:** 纯 HTML + CSS + JS（桌面版），WXML + WXSS（小程序）

---

### Task 1: HTML Shell + CSS Design Tokens + Theme System

**Files:**
- Create: `web/index.html`（完整 SPA，本 task 只搭骨架）

- [ ] **Step 1: 创建 web/ 目录**

```powershell
$path = "E:\AI\multicloud\web"; if (-not (Test-Path $path)) { New-Item -ItemType Directory -Path $path -Force }
```

- [ ] **Step 2: 写 HTML 骨架 + CSS reset + 设计系统变量 + 双主题切换**

创建 `E:\AI\multicloud\web\index.html`，包含：
- HTML5 文档头（`<meta name="viewport" content="width=device-width, initial-scale=1.0">`）
- CSS reset（`* { margin:0; padding:0; box-sizing:border-box; }`）
- `:root` 暗色设计 tokens + `html.light` 浅色 tokens
- 字体、圆角、阴影变量
- `<body>` 空容器（后续 task 填充）
- 底部 `<script>` 含主题初始化逻辑: 读 `localStorage('theme')`，默认 `dark`，`toggleTheme()` 函数切换 `html.light` class
- 所有元素 transition 0.3s

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>MultiCloud Manager</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif; }

:root {
  --primary: #6366f1;
  --primary-hover: #818cf8;
  --danger: #ef4444;
  --success: #22c55e;
  --warning: #f59e0b;
  --info: #3b82f6;
  --bg: #0f1117;
  --surface: #1a1d27;
  --surface-hover: #22263a;
  --border: #2a2d3a;
  --text: #e1e4ed;
  --text-secondary: #8b8fa3;
  --azure: #0078d4;
  --tencent: #00a4ff;
  --oracle: #f80000;
  --render: #46e3b7;
  --radius-sm: 8px;
  --radius: 12px;
  --radius-lg: 16px;
  --radius-full: 9999px;
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
  --shadow: 0 4px 12px rgba(0,0,0,0.15);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.2);
  --sidebar-w: 240px;
  --topbar-h: 56px;
}

html.light {
  --bg: #f5f7fa;
  --surface: #ffffff;
  --surface-hover: #f0f2f5;
  --border: #e4e7ed;
  --text: #1a1a2e;
  --text-secondary: #666666;
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.08);
  --shadow: 0 4px 12px rgba(0,0,0,0.04);
  --shadow-lg: 0 8px 24px rgba(0,0,0,0.06);
}

* { transition: background-color 0.3s, color 0.3s, border-color 0.3s, box-shadow 0.3s; }
body { background: var(--bg); color: var(--text); }
/* ... rest of task 2 layout CSS */
</style>
</head>
<body>
<div id="app"><!-- layout shell here --></div>
<script>
(function initTheme() {
  const t = localStorage.getItem('theme') || 'dark';
  if (t === 'light') document.documentElement.classList.add('light');
})();
function toggleTheme() {
  document.documentElement.classList.toggle('light');
  localStorage.setItem('theme',
    document.documentElement.classList.contains('light') ? 'light' : 'dark');
}
</script>
</body>
</html>
```

---

### Task 2: Layout Shell + 响应式导航

**Files:**
- Modify: `web/index.html`

- [ ] **Step 1: 写桌面端布局（sidebar + topbar + content）**

在 `<body>` 的 `#app` 内：

```html
<div id="app">
  <aside id="sidebar"><!-- 左侧导航 --></aside>
  <div id="main">
    <header id="topbar"><!-- 顶部栏 --></header>
    <main id="content"><!-- 页面容器 --></main>
  </div>
</div>
```

CSS：
```css
#app { display: flex; height: 100vh; overflow: hidden; }
#sidebar { width: var(--sidebar-w); background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; flex-shrink: 0; }
#main { flex: 1; display: flex; flex-direction: column; min-width: 0; }
#topbar { height: var(--topbar-h); background: var(--surface); border-bottom: 1px solid var(--border); display: flex; align-items: center; justify-content: space-between; padding: 0 24px; flex-shrink: 0; }
#content { flex: 1; overflow-y: auto; padding: 24px; }
```

侧边栏 logo + 导航项（用 data-page 属性）：
```html
<div class="logo-area">
  <span class="logo-icon">☁</span>
  <span class="logo-text">MultiCloud</span>
</div>
<nav class="side-nav">
  <button class="nav-item active" data-page="dashboard"><span class="nav-icon">◉</span>首页</button>
  <button class="nav-item" data-page="chat"><span class="nav-icon">◉</span>AI</button>
  <button class="nav-item" data-page="resources"><span class="nav-icon">◉</span>资源</button>
  <button class="nav-item" data-page="accounts"><span class="nav-icon">◉</span>账户</button>
  <button class="nav-item" data-page="team"><span class="nav-icon">◉</span>团队</button>
  <button class="nav-item" data-page="terraform"><span class="nav-icon">◉</span>TF</button>
  <button class="nav-item" data-page="profile"><span class="nav-icon">◉</span>我的</button>
</nav>
```

底部主题切换：
```html
<div class="sidebar-footer">
  <button onclick="toggleTheme()" id="themeBtn">🌙 深色</button>
</div>
```

- [ ] **Step 2: 写手机端响应式布局**

```css
/* 手机端隐藏 sidebar，显示底部 Tab */
@media (max-width: 767px) {
  #sidebar { display: none; }
  #app { flex-direction: column; }
  #main { flex-direction: column; }
  #content { flex: 1; overflow-y: auto; padding: 16px; padding-bottom: 72px; }
  #topbar { padding: 0 16px; }
  .mobile-tabbar { display: flex; position: fixed; bottom: 0; left: 0; right: 0; height: 56px; background: var(--surface); border-top: 1px solid var(--border); z-index: 100; }
}

@media (min-width: 768px) {
  .mobile-tabbar { display: none; }
}
```

- [ ] **Step 3: 写 JS 页面路由**

```javascript
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) el.classList.add('active');
  const nav = document.querySelector(`.nav-item[data-page="${page}"]`);
  if (nav) nav.classList.add('active');
  // 手机端 Tab
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  const tab = document.querySelector(`.tab-item[data-page="${page}"]`);
  if (tab) tab.classList.add('active');
}

document.querySelectorAll('.nav-item, .tab-item').forEach(el => {
  el.addEventListener('click', () => showPage(el.dataset.page));
});
```

---

### Task 3: 仪表盘页面 (Dashboard)

**Files:**
- Modify: `web/index.html`

- [ ] **Step 1: 在 `#content` 内添加 dashboard 页面结构**

```html
<div id="page-dashboard" class="page active">
  <div class="page-header"><h2>多云管理平台</h2><p>统一管理您的云资源</p></div>
  <div class="stats-row" id="statsRow">
    <div class="stat-card"><span class="stat-val">--</span><span class="stat-lbl">云资源</span></div>
    <div class="stat-card"><span class="stat-val">--</span><span class="stat-lbl">云账号</span></div>
    <div class="stat-card"><span class="stat-val">--</span><span class="stat-lbl">Terraform</span></div>
    <div class="stat-card"><span class="stat-val">--</span><span class="stat-lbl">团队成员</span></div>
  </div>
  <section class="section">
    <h3>快捷操作</h3>
    <div class="action-grid">
      <button class="action-card" onclick="showPage('resources')">🖥 资源列表</button>
      <button class="action-card" onclick="showPage('accounts')">☁ 添加账户</button>
      <button class="action-card" onclick="showPage('terraform')">📦 Terraform</button>
      <button class="action-card" onclick="showPage('team')">👥 团队成员</button>
    </div>
  </section>
  <section class="section" id="recentSection">
    <h3>最近活动</h3>
    <div id="recentList"><div class="empty-state">暂无活动记录</div></div>
  </section>
</div>
```

CSS for dashboard:
```css
.stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 24px; }
.stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; text-align: center; }
.stat-val { display: block; font-size: 32px; font-weight: 700; color: var(--primary); }
.stat-lbl { display: block; font-size: 13px; color: var(--text-secondary); margin-top: 4px; }
.section { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 20px; margin-bottom: 16px; }
.section h3 { font-size: 16px; margin-bottom: 16px; }
.action-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.action-card { background: var(--bg); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 16px; cursor: pointer; color: var(--text); font-size: 14px; text-align: center; }
.action-card:hover { border-color: var(--primary); background: var(--surface-hover); }
@media (max-width: 767px) { .stats-row { grid-template-columns: repeat(2, 1fr); } .action-grid { grid-template-columns: repeat(2, 1fr); } }
```

---

### Task 4: AI 对话页面

**Files:**
- Modify: `web/index.html`

- [ ] **Step 1: 添加 AI 对话页面结构**

```html
<div id="page-chat" class="page">
  <div class="chat-container">
    <div class="chat-header-bar">
      <h2>AI 云助手</h2>
      <select id="modeSelect">
        <option value="plan_only">仅生成方案</option>
        <option value="step_confirm">分步确认</option>
        <option value="risk_review" selected>风险审查模式</option>
        <option value="auto_execute">全自动执行</option>
      </select>
    </div>
    <div class="quick-actions">
      <button onclick="quickChat('查看所有云账户')">查看账户</button>
      <button onclick="quickChat('列出所有资源')">查看资源</button>
      <button onclick="quickChat('创建一个新的虚拟机')">新建VM</button>
    </div>
    <div class="chat-messages" id="chatMessages">
      <div class="msg agent">你好，我是 MultiCloud AI Agent，可以帮你管理多云资源。</div>
    </div>
    <div class="chat-input-bar">
      <input type="text" id="chatInput" placeholder="输入指令..." autocomplete="off">
      <button id="sendBtn" onclick="sendChat()">发送</button>
    </div>
  </div>
</div>
```

CSS:
```css
.chat-container { display: flex; flex-direction: column; height: 100%; }
.chat-header-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.chat-header-bar select { background: var(--surface); border: 1px solid var(--border); color: var(--text); padding: 6px 12px; border-radius: var(--radius-sm); font-size: 13px; }
.chat-messages { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding: 12px 0; }
.msg { max-width: 85%; padding: 10px 14px; border-radius: var(--radius); font-size: 14px; line-height: 1.5; word-break: break-word; }
.msg.user { align-self: flex-end; background: var(--primary); color: #fff; border-bottom-right-radius: 4px; }
.msg.agent { align-self: flex-start; background: var(--surface); border: 1px solid var(--border); border-bottom-left-radius: 4px; }
.chat-input-bar { display: flex; gap: 8px; padding-top: 12px; border-top: 1px solid var(--border); }
.chat-input-bar input { flex: 1; padding: 10px 14px; border: 1px solid var(--border); border-radius: var(--radius-full); background: var(--bg); color: var(--text); font-size: 14px; outline: none; }
.chat-input-bar input:focus { border-color: var(--primary); }
.chat-input-bar button { padding: 10px 20px; border: none; border-radius: var(--radius-full); background: var(--primary); color: #fff; cursor: pointer; font-size: 14px; }
.chat-input-bar button:disabled { opacity: 0.5; }
.plan-card { margin-top: 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 12px; background: var(--bg); }
.plan-step { padding: 8px 12px; border-left: 4px solid var(--primary); margin: 6px 0; background: var(--surface); border-radius: 0 var(--radius-sm) var(--radius-sm) 0; font-size: 13px; }
```

JS functions:
```javascript
function sendChat(text) { /* ... fetch API /agent/chat, render response msg + plan card ... */ }
function quickChat(text) { /* ... same logic ... */ }
```

---

### Task 5: 资源列表页面

**Files:**
- Modify: `web/index.html`

- [ ] **Step 1: 添加资源页面结构**

```html
<div id="page-resources" class="page">
  <div class="page-header"><h2>资源列表</h2></div>
  <div class="filter-bar">
    <select id="resCloudFilter"><option value="">全部云平台</option><option value="azure">Azure</option><option value="tencent">腾讯云</option><option value="oracle">Oracle</option><option value="render">Render</option></select>
    <select id="resStatusFilter"><option value="">全部状态</option><option value="running">运行中</option><option value="stopped">已停止</option></select>
    <input type="text" id="resSearch" placeholder="搜索资源...">
  </div>
  <div id="resourceList"></div>
</div>
```

CSS:
```css
.filter-bar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.filter-bar select, .filter-bar input { padding: 8px 12px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface); color: var(--text); font-size: 13px; }
.filter-bar input { flex: 1; min-width: 150px; }
.resource-card { display: flex; justify-content: space-between; align-items: center; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px 16px; margin-bottom: 8px; }
.resource-card:hover { border-color: var(--primary); }
.res-info { flex: 1; }
.res-name { font-weight: 600; font-size: 14px; }
.res-meta { font-size: 12px; color: var(--text-secondary); margin-top: 2px; }
.res-actions { display: flex; gap: 6px; align-items: center; }
.res-actions button { padding: 4px 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: none; color: var(--text); font-size: 12px; cursor: pointer; }
.res-actions button:hover { border-color: var(--primary); color: var(--primary); }
.status-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; margin-right: 4px; vertical-align: middle; }
```

---

### Task 6: 账户管理页面

**Files:**
- Modify: `web/index.html`

- [ ] **Step 1: 添加账户页面结构**

```html
<div id="page-accounts" class="page">
  <div class="page-header"><h2>云账户管理</h2></div>
  <div id="accountList"></div>
  <button class="add-btn" onclick="showAddAccount()">+ 添加云账户</button>
  <div id="addAccountForm" style="display:none"></div>
</div>
```

复用现有手机网页版中的 `cloudConfigs` 配置 + 表单渲染逻辑 + 云平台选择器。

```css
.account-card { display: flex; align-items: center; gap: 12px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 14px; margin-bottom: 8px; }
.account-icon { width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; color: #fff; font-weight: 700; font-size: 14px; flex-shrink: 0; }
.add-btn { width: 100%; padding: 12px; border: 2px dashed var(--border); border-radius: var(--radius); background: none; color: var(--text-secondary); font-size: 14px; cursor: pointer; text-align: center; margin-top: 8px; }
.add-btn:hover { border-color: var(--primary); color: var(--primary); }
.cloud-selector-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 16px; }
.cloud-option { padding: 16px; text-align: center; background: var(--surface); border: 2px solid var(--border); border-radius: var(--radius); cursor: pointer; }
.cloud-option:hover, .cloud-option.selected { border-color: var(--primary); }
.form-group { margin-bottom: 12px; }
.form-group label { display: block; font-size: 12px; color: var(--text-secondary); margin-bottom: 4px; }
.form-group input { width: 100%; padding: 10px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg); color: var(--text); font-size: 14px; outline: none; }
.form-group input:focus { border-color: var(--primary); }
```

---

### Task 7: 剩余页面（团队/Terraform/个人中心）

**Files:**
- Modify: `web/index.html`

- [ ] **Step 1: 团队管理页**

```html
<div id="page-team" class="page">
  <div class="page-header"><h2>团队管理</h2><span class="badge" id="teamMemberCount">0 人</span></div>
  <div class="section"><h3>开发团队</h3><div id="memberList"></div></div>
</div>
```

- [ ] **Step 2: Terraform 模板页**

```html
<div id="page-terraform" class="page">
  <div class="page-header"><h2>Terraform 模板</h2></div>
  <div id="tfTemplateList"></div>
  <button class="add-btn" onclick="showUploadTF()">+ 上传模板</button>
  <div id="tfUploadForm" style="display:none"></div>
</div>
```

- [ ] **Step 3: 个人中心页**

```html
<div id="page-profile" class="page">
  <div class="profile-header">
    <div class="avatar">👤</div>
    <h2>用户名</h2>
    <p class="text-secondary">user@example.com</p>
  </div>
  <div class="section">
    <div class="setting-row"><span>🌙 深色模式</span><label class="switch"><input type="checkbox" id="themeSwitch" onchange="toggleTheme()"><span class="slider"></span></label></div>
    <div class="setting-row"><span>🔔 通知设置</span><span class="arrow">></span></div>
    <div class="setting-row"><span>🔑 修改密码</span><span class="arrow">></span></div>
    <div class="setting-row"><span>📊 使用统计</span><span class="arrow">></span></div>
    <div class="setting-row"><span>📋 操作日志</span><span class="arrow">></span></div>
  </div>
  <button class="logout-btn" onclick="handleLogout()">退出登录</button>
</div>
```

CSS：
```css
.profile-header { text-align: center; padding: 32px 0; }
.profile-header .avatar { font-size: 64px; margin-bottom: 8px; }
.setting-row { display: flex; justify-content: space-between; align-items: center; padding: 14px 0; border-bottom: 1px solid var(--border); cursor: pointer; }
.setting-row:last-child { border-bottom: none; }
.switch { position: relative; width: 44px; height: 24px; display: inline-block; }
.switch input { opacity: 0; width: 0; height: 0; }
.slider { position: absolute; inset: 0; background: var(--border); border-radius: 24px; cursor: pointer; transition: 0.3s; }
.slider:before { content: ''; position: absolute; width: 18px; height: 18px; left: 3px; bottom: 3px; background: #fff; border-radius: 50%; transition: 0.3s; }
.switch input:checked + .slider { background: var(--primary); }
.switch input:checked + .slider:before { transform: translateX(20px); }
.logout-btn { width: 100%; padding: 12px; border: 1px solid var(--danger); border-radius: var(--radius-sm); background: none; color: var(--danger); font-size: 14px; cursor: pointer; margin-top: 16px; }
.logout-btn:hover { background: var(--danger); color: #fff; }
```

---

### Task 8: 替换旧手机网页版 + API 模拟数据

**Files:**
- Modify: `web/index.html`
- Modify: `backend/static/index.html`（替换）

- [ ] **Step 1: 在所有页面 JS 中添加 API 调用和模拟数据 fallback**

后端可能未运行，所以加模拟数据：

```javascript
const API = '/api';
// 模拟数据
const mockData = {
  accounts: [
    { id: '1', name: 'Azure 生产环境', cloud_type: 'azure', is_active: true, last_sync: '2分钟前' },
    { id: '2', name: '腾讯云开发环境', cloud_type: 'tencent', is_active: true, last_sync: '5分钟前' }
  ],
  resources: [
    { id: 'r1', name: 'prod-web-01', cloud_type: 'azure', type: 'VM', region: 'southeastasia', status: 'running', spec: 'Standard_D2s_v3' },
    { id: 'r2', name: 'db-mysql-01', cloud_type: 'tencent', type: 'Database', region: '广州', status: 'running', spec: '2C4G 50GB' }
  ],
  members: [
    { id: 'u1', name: '张三', role: 'admin', avatar: '👤' },
    { id: 'u2', name: '李四', role: 'member', avatar: '👤' }
  ],
  templates: [
    { id: 't1', name: '标准 VM 模板', version: 2, created_at: '2026-05-20' }
  ]
};
```

每次 `load*` 函数先尝试 fetch API，失败则 fallback 到 mockData。

- [ ] **Step 2: 替换 `backend/static/index.html`**

将新 `web/index.html` 复制到 `backend/static/index.html`，确保后端直接 serve 新版。

```powershell
Copy-Item -Path "E:\AI\multicloud\web\index.html" -Destination "E:\AI\multicloud\backend\static\index.html" -Force
```

---

### Task 9: 小程序 WXSS Design Tokens 重写

**Files:**
- Create: `miniprogram/styles/tokens.wxss`
- Modify: `miniprogram/app.wxss`
- Modify: `miniprogram/pages/*/*.wxml`（所有页面）
- Modify: `miniprogram/pages/*/*.wxss`（所有页面）
- Modify: `miniprogram/components/*/*.wxml`（所有组件）
- Modify: `miniprogram/components/*/*.wxss`（所有组件）

- [ ] **Step 1: 创建 tokens.wxss**

```css
/* miniprogram/styles/tokens.wxss */
page {
  --primary: #6366f1;
  --primary-hover: #818cf8;
  --danger: #ef4444;
  --success: #22c55e;
  --warning: #f59e0b;
  --bg: #0f1117;
  --surface: #1a1d27;
  --surface-hover: #22263a;
  --border: #2a2d3a;
  --text: #e1e4ed;
  --text-secondary: #8b8fa3;
  --radius-sm: 8rpx;
  --radius: 12rpx;
  --radius-lg: 16rpx;
  --azure: #0078d4;
  --tencent: #00a4ff;
  --oracle: #f80000;
  --render: #46e3b7;
}

page.light {
  --bg: #f5f7fa;
  --surface: #ffffff;
  --surface-hover: #f0f2f5;
  --border: #e4e7ed;
  --text: #1a1a2e;
  --text-secondary: #666666;
}
```

- [ ] **Step 2: 重写 app.wxss**

```css
@import "/styles/tokens.wxss";
page { background: var(--bg); color: var(--text); font-size: 28rpx; }
```

- [ ] **Step 3: 重写 app.json**（更新 tabBar 颜色匹配新主题）

```json
{
  "tabBar": {
    "color": "#8b8fa3",
    "selectedColor": "#6366f1",
    "backgroundColor": "#1a1d27",
    "borderStyle": "black"
  }
}
```

- [ ] **Step 4: 重写每个页面和组件的 WXML/WXSS**（以下为各页面核心改动）

**首页 (index)**：
- WXML: 统一用 `var(--xxx)` 颜色，卡片用 `var(--surface)` 背景 + `var(--border)` 边框
- WXSS: 替换 `#1890ff` → `var(--primary)`，`#f5f7fa` → `var(--bg)`

**AI 对话 (chat)**：
- WXSS: 替换蓝色泡泡背景 `#1890ff` → `var(--primary)`，对话背景 → `var(--bg)`
- 输入框、按钮颜色同步

**其他 stub 页面**：填充真实布局（组件卡片、列表等），使用 tokens 变量

**组件**：
- `ResourceCard.wxss`：替换所有硬编码颜色为 `var(--xxx)`
- `CloudSelector.wxss`：`active` 状态色 `#409eff` → `var(--primary)`
- `StatusBadge.wxss`：保留语义色，背景用 `var(--surface)`
- `OperationButton.wxss`：Primary 色 `#1890ff` → `var(--primary)`

- [ ] **Step 5: 小程序主题切换逻辑**

在 `app.js` 中加主题切换能力：
```javascript
globalData: { theme: 'dark' },
setTheme(theme) {
  this.globalData.theme = theme;
  wx.setStorageSync('theme', theme);
  wx.setNavigationBarColor({
    frontColor: theme === 'dark' ? '#ffffff' : '#000000',
    backgroundColor: theme === 'dark' ? '#1a1d27' : '#ffffff'
  });
}
```

每个页面 onLoad 时：
```javascript
const app = getApp();
const theme = wx.getStorageSync('theme') || 'dark';
if (theme === 'light') this.setData({ isLight: true });
```

WXML 用 class 控制：
```html
<page class="{{isLight ? 'light' : ''}}">
```

---

### Task 10: 集成测试 + 最终清理

**Files:**
- All the above

- [ ] **Step 1: 桌面版功能验证**

打开 `web/index.html`（直接浏览器打开），验证：
- 桌面端显示左侧导航栏，手机端（resize 到 <768px）显示底部 Tab
- 点击导航/Tab 切换页面
- 深色/浅色主题切换正常
- 所有页面显示 mock 数据

- [ ] **Step 2: 后端 serve 验证**

```powershell
Set-Location -Path "E:\AI\multicloud\backend"
go run main.go
```

浏览器访问 `http://localhost:8080`，验证新版页面被 serve。

- [ ] **Step 3: 旧文件清理**

确认新 `backend/static/index.html` 替换成功，删除旧的备份文件。
