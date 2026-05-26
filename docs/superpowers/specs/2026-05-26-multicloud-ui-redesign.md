# MultiCloud UI 统一重建设计文档

**版本**：v1.0
**日期**：2026-05-26
**目标**：以手机网页版 UI 为蓝本，统一桌面网页版和微信小程序的视觉设计

---

## 1. 项目范围

| 交付物 | 技术栈 | 说明 |
|--------|--------|------|
| 桌面网页版 | 纯静态 HTML + CSS + JS (SPA) | 响应式布局，自适应桌面和手机，替换当前 `backend/static/index.html` |
| 微信小程序重构 | WXML + WXSS + JS | 复写 UI 层，匹配新设计系统 |
| 双主题 | CSS 变量驱动 | 暗色（默认）+ 浅色，用户偏好持久化 |

### 功能覆盖（全量）

| 页面 | 桌面导航 | 手机 Tab | 功能说明 |
|------|---------|----------|---------|
| 首页/仪表盘 | 首页 | 首页 | 统计卡片 + 快捷操作 + 最近活动 |
| AI 对话 | AI | AI | 聊天界面 + 执行模式 + 计划卡片 |
| 资源管理 | 资源 | 资源 | 资源列表 + 筛选 + 控制操作 |
| 账户管理 | 账户 | — | 账户列表 + 添加表单 |
| 团队管理 | 团队 | 团队 | 成员列表 + 邀请 |
| Terraform | TF | — | 模板列表 + 上传 + Plan/Apply |
| 用户中心 | 我的 | 我的 | 个人信息 + 设置 + 退出 |

---

## 2. 设计系统 (Design Tokens)

### 2.1 颜色体系

```css
:root {
  /* 核心 */
  --primary: #6366f1;
  --primary-hover: #818cf8;
  --danger: #ef4444;
  --success: #22c55e;
  --warning: #f59e0b;
  --info: #3b82f6;

  /* 暗色模式（默认） */
  --bg: #0f1117;
  --surface: #1a1d27;
  --surface-hover: #22263a;
  --border: #2a2d3a;
  --text: #e1e4ed;
  --text-secondary: #8b8fa3;

  /* 云平台色标 */
  --azure: #0078d4;
  --tencent: #00a4ff;
  --oracle: #f80000;
  --render: #46e3b7;
}

html.light {
  --bg: #f5f7fa;
  --surface: #ffffff;
  --surface-hover: #f0f2f5;
  --border: #e4e7ed;
  --text: #1a1a2e;
  --text-secondary: #666666;
}
```

### 2.2 排版

```css
--font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI',
               'PingFang SC', 'Microsoft YaHei', sans-serif;
--font-size-xs: 11px;
--font-size-sm: 12px;
--font-size-base: 14px;
--font-size-lg: 16px;
--font-size-xl: 20px;
--font-size-2xl: 24px;
--font-size-3xl: 32px;
```

### 2.3 圆角与间距

```css
--radius-sm: 8px;
--radius: 12px;
--radius-lg: 16px;
--radius-full: 9999px;

--space-1: 4px;
--space-2: 8px;
--space-3: 12px;
--space-4: 16px;
--space-5: 20px;
--space-6: 24px;
--space-8: 32px;
--space-10: 40px;
```

### 2.4 阴影

```css
--shadow-sm: 0 1px 3px rgba(0,0,0,0.3);
--shadow: 0 4px 12px rgba(0,0,0,0.15);
--shadow-lg: 0 8px 24px rgba(0,0,0,0.2);
```

浅色模式阴影透明度降低：`rgba(0,0,0,0.08)` / `rgba(0,0,0,0.04)`

---

## 3. 布局与导航

### 3.1 响应式断点

| 断点 | 布局 | 导航方式 |
|------|------|---------|
| < 768px | 手机 | 底部 Tab 栏 (5个) |
| ≥ 768px | 桌面/平板 | 左侧固定导航栏 (240px) |

### 3.2 桌面布局

```
┌──────────┬───────────────────────────────────────┐
│ 240px    │ 内容区 (flex: 1)                      │
│          │                                       │
│  Logo    │  ┌── 顶部栏 ──────────────────────┐  │
│          │  │  页面标题     🌙/☀  [用户头像] │  │
│  [首页]  │  ├─────────────────────────────────┤  │
│  [AI]    │  │                                   │  │
│  [资源]  │  │   页面主要内容                     │  │
│  [账户]  │  │                                   │  │
│  [团队]  │  │                                   │  │
│  [TF]    │  │                                   │  │
│  [我的]  │  └───────────────────────────────────┘  │
│          │                                       │
└──────────┴───────────────────────────────────────┘
```

- 左侧导航：固定 240px，深色背景，图标+文字，当前页高亮
- 顶部栏：页面标题居左，主题切换 + 用户头像居右
- 内容区：flex 自适应，overflow-y: auto

### 3.3 手机布局

```
┌─────────────────────────────┐
│  ← 返回      标题     🌙/☀ │  顶部导航栏
├─────────────────────────────┤
│                             │
│       内容区 (flex: 1)      │
│       页面内容              │
│                             │
├────┬────┬────┬────┬────────┤
│首页│ AI │资源│团队│  我的  │  底部 Tab
└────┴────┴────┴────┴────────┘
```

- 底部 Tab: 首页 / AI / 资源 / 团队 / 我的
- 账户管理和 Terraform 作为二级页面，从首页或菜单进入

---

## 4. 页面详情

### 4.1 首页/仪表盘

**布局**：垂直排列，有滚动
**组件**：
- 统计卡片行（4 个：资源/账户/模板/成员）- 数字大号显示
- 快捷操作网格（4 个入口：资源列表/添加账户/Terraform/团队成员）
- 最近活动列表（操作日志，实时滚动）

### 4.2 AI 对话页

**布局**：全屏聊天界面
**组件**：
- 顶部栏：标题 "AI 云助手" + 执行模式选择器（下拉：仅生成方案/分步确认/风险审查/全自动）
- 消息列表（scroll-view）：
  - 用户消息：右对齐，紫色背景气泡
  - AI 消息：左对齐，surface 背景气泡，可含计划卡片
  - 系统消息：居中，小字，灰色背景
- 计划卡片：标题 + 步骤列表（带云平台色标左侧边框）+ [执行计划] 按钮
- 快速操作按钮行（查看账户/查看资源/新建VM）
- 输入栏：输入框 + 发送按钮

### 4.3 资源列表页

**布局**：列表 + 筛选栏
**组件**：
- 筛选栏：云平台选择器（多选）、状态筛选、搜索框
- 资源卡片列表：名称 + 状态点 + 云平台标签 + 区域 + 规格 + 操作按钮
- 分页/加载更多

### 4.4 账户管理页

**布局**：列表 + 浮动添加按钮
**组件**：
- 账户卡片列表：云平台图标 + 名称 + 状态 + 最后同步时间 + 删除按钮
- 添加云账户：点击 → 展开云平台选择 Grid → 展开表单（字段动态根据云平台变化）
- 表单：账户名称 + 各平台认证字段 + 引导链接

### 4.5 团队管理页

**布局**：列表
**组件**：
- 当前团队名称 + 成员数量
- 成员列表（头像 + 名称 + 角色标签 + 移除按钮，仅管理员可见）
- [+ 邀请] 按钮 → 弹出邀请表单

### 4.6 Terraform 模板页

**布局**：列表 + 上传按钮
**组件**：
- 模板卡片：名称 + 版本号 + 创建时间 + 操作按钮组 [Plan] [Apply] [删除]
- 上传模板：文件上传 + 名称 + 描述 + 变量定义 + 关联账户选择

### 4.7 用户中心页

**布局**：列表
**组件**：
- 用户头像大图 + 名称 + 邮箱
- 设置列表项：主题切换、通知设置、修改密码、使用统计、操作日志
- 退出登录按钮（红色）

---

## 5. 双主题切换

### 5.1 切换机制

```javascript
// 初始化
const theme = localStorage.getItem('theme') || 'dark'
document.documentElement.className = theme === 'light' ? 'light' : ''

// 切换
function toggleTheme() {
  const isLight = document.documentElement.classList.toggle('light')
  localStorage.setItem('theme', isLight ? 'light' : 'dark')
  updateThemeIcon(isLight)
}
```

### 5.2 存储

| 存储方式 | 键 | 值 |
|---------|-----|-----|
| localStorage | `theme` | `"dark"` / `"light"` |

### 5.3 过渡动画

```css
* { transition: background-color 0.3s, color 0.3s, border-color 0.3s; }
```

---

## 6. 小程序适配策略

### 6.1 设计 tokens 映射

WXSS 不支持 CSS 变量跨文件共享，但支持 `@import`：

```css
/* miniprogram/styles/tokens.wxss */
@import "tokens-dark.wxss";
```

小程序主题切换通过 page 类名控制：

```css
page.dark { --bg: #0f1117; }
page.light { --bg: #f5f7fa; }
```

### 6.2 布局差异

| 特性 | 网页版 | 小程序 |
|------|--------|--------|
| 导航 | div + click | navigator + switchTab |
| 路由 | JS 控制 hash/URL | 原生 pages |
| 主题 | html class | page class + setStorageSync |
| 图标 | SVG/Unicode | image 或 iconfont |

### 6.3 组件对应

| 网页版 | 小程序 |
|--------|--------|
| `nav button` | `navigator` + tabBar |
| `#chatMessages` | `scroll-view` + wx:for |
| [发送] button | button + bindtap |
| form input | input + bindinput |

---

## 7. 交付标准

1. 桌面版单 HTML 文件，无需构建工具，直接双击可打开
2. 响应式：375px / 768px / 1440px 三个断点视觉完整
3. 双主题切换流畅，偏好持久化
4. 小程序 WXSS tokens 体系建立，所有页面统一风格
5. 手机网页版（当前 backend/static/index.html）被桌面版的手机模式取代
6. 所有页面均正常工作，stub 页面完善

---

## 8. 非目标

- 不改动后端 Go 代码
- 不改动小程序业务逻辑（只改 UI 层）
- Terraform 执行器功能不在此范围
