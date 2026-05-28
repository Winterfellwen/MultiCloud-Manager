# 微信小程序自动化测试实战指南

> 基于 miniprogram-automator 的全量页面测试经验总结，覆盖环境搭建、导航策略、元素操作、异常处理等完整流程。

---

## 1. 环境与连接

### 1.1 前置条件

- Node.js >= 18
- 微信开发者工具（含 CLI）
- `miniprogram-automator`（`npm i miniprogram-automator --save-dev`）
- 开发者工具安全设置 → 勾选「CLI/HTTP 调用」

### 1.2 启动自动化模式

**正确命令**：使用 `cli auto` 而不是 `cli open`

```bash
# 语法
cli auto --project <项目路径> --auto-port <端口>

# 示例
cli auto --project E:\AI\multicloud\miniprogram --auto-port 9420
```

**验证成功**：看到 `√ auto` 表示启动成功，然后用 `netstat -an | findstr <端口>` 确认端口监听。

### 1.3 连接方式

```javascript
// 连接到已运行的 DevTools（auto 模式）
const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9420' });
```

---

## 2. 登录模拟

### 2.1 账号密码登录

```javascript
await mp.redirectTo('/pages/login/login');
await sleep(2000);

const page = await mp.currentPage();
const inputs = await page.$$('input');

// 第一个输入框是用户名，第二个是密码
await inputs[0].input('admin');
await sleep(300);
await inputs[1].input('Test.1234');
await sleep(300);

// 点击登录按钮
const loginBtn = await page.$('button.btn-login');
await loginBtn.tap();

// 等待页面跳转（重要！）
await sleep(3000);
```

### 2.2 微信登录

```javascript
await mp.redirectTo('/pages/login/login');
await sleep(2000);

const page = await mp.currentPage();
const wechatBtn = await page.$('button.btn-wechat');
await wechatBtn.tap();

// 等待页面跳转
await sleep(3000);
```

### 2.3 登录后页面跳转检测

**重要**：登录后页面会跳转，不能立即用 `mp.currentPage()` 获取，需要等待：

```javascript
async function waitForPage(mp, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const page = await mp.currentPage();
      if (page && page.path && !page.path.includes('login')) {
        return page;
      }
    } catch (e) {}
    await sleep(500);
  }
  return await mp.currentPage();
}

// 使用
const page = await waitForPage(mp, 5000);
console.log('登录后页面:', page.path); // 应该是 pages/index/index
```

---

## 3. AI助手交互

### 3.1 输入消息并发送

```javascript
// 切换到AI助手Tab
await mp.switchTab('/pages/agent/chat');
await sleep(2000);

// 等待输入框渲染（可能需要重试）
let input = null;
for (let i = 0; i < 5; i++) {
  await sleep(500);
  const page = await mp.currentPage();
  input = await page.$('input.message-input');
  if (input) break;
}

if (input) {
  // 输入消息
  await input.input('列出当前所有资源');
  await sleep(500);
  
  // 点击发送
  const sendBtn = await page.$('button.send-btn');
  await sendBtn.tap();
  
  // 等待AI回复
  await sleep(5000);
  
  // 获取回复内容
  const data = await page.data();
  const msgs = data.messages || [];
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === 'assistant' && msgs[i].content) {
      console.log('AI回复:', msgs[i].content);
      break;
    }
  }
}
```

---

## 4. 导航策略

### 4.1 Tab页导航

```javascript
// Tab页必须用 switchTab
await mp.switchTab('/pages/index/index');
await mp.switchTab('/pages/agent/chat');
await mp.switchTab('/pages/resources/list');
await mp.switchTab('/pages/user/profile');
```

### 4.2 子页导航

```javascript
// 子页用 redirectTo
await mp.redirectTo('/pages/accounts/list');
await mp.redirectTo('/pages/terraform/upload');
```

### 4.3 兜底导航

```javascript
// 如果上面的方法失败，用 reLaunch
await mp.reLaunch('/pages/index/index');
await sleep(3000);
```

### 4.4 重要规则

- **不要用 `callWxMethod` 做导航**（容易挂起）
- 导航操作一律用 `mp.switchTab()`、`mp.redirectTo()`、`mp.reLaunch()`
- `callWxMethod` 仅用于非导航的 wx API（如 `setStorageSync`）

---

## 5. 元素操作

### 5.1 查找元素

```javascript
// 单个
const el = await page.$('.btn-submit');

// 多个
const inputs = await page.$$('input');
const buttons = await page.$$('button');
```

### 5.2 输入文本

```javascript
await input.input('admin');
await sleep(300); // 等待 bindinput 回调完成
```

### 5.3 点击

```javascript
await element.tap();
await sleep(500); // 等待事件处理完成
```

---

## 6. 页面遍历

### 6.1 完整页面列表

```javascript
const pages = [
  { name: '首页', path: '/pages/index/index', type: 'tab' },
  { name: 'AI助手', path: '/pages/agent/chat', type: 'tab' },
  { name: '资源列表', path: '/pages/resources/list', type: 'tab' },
  { name: '个人中心', path: '/pages/user/profile', type: 'tab' },
  { name: '登录页', path: '/pages/login/login', type: 'sub' },
  { name: '账号列表', path: '/pages/accounts/list', type: 'sub' },
  { name: '添加账号', path: '/pages/accounts/add', type: 'sub' },
  { name: '团队成员', path: '/pages/team/members', type: 'sub' },
  { name: 'Terraform配置', path: '/pages/terraform/list', type: 'sub' },
  { name: 'Terraform上传', path: '/pages/terraform/upload', type: 'sub' },
  { name: '用户管理', path: '/pages/admin/users/users', type: 'sub' },
];
```

### 6.2 遍历代码

```javascript
for (const p of pages) {
  try {
    if (p.type === 'tab') {
      await mp.switchTab(p.path);
    } else {
      await mp.redirectTo(p.path);
    }
    await sleep(1500);
    const page = await mp.currentPage();
    console.log('✅', p.name, '-', page.path);
  } catch (e) {
    console.log('❌', p.name, '-', e.message);
  }
}
```

---

## 7. 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| 登录后页面没跳转 | 没有等待足够时间 | 用 `waitForPage()` 函数等待 |
| 输入框找不到 | 页面未完全渲染 | 循环重试查找 |
| switchTab 失败 | 当前页已经是Tab页 | 先导航到其他页再切换 |
| `page destroyed` | 页面导航竞态 | 重新获取页面引用 |
| AI回复为空 | 消息未发送成功 | 检查输入框和发送按钮 |

---

## 8. 测试流程模板

```javascript
const automator = require('miniprogram-automator');
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  // 1. 连接
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9420' });
  await mp.callWxMethod('setStorageSync', { key: '__automation__', data: '1' });

  // 2. 登录
  await mp.redirectTo('/pages/login/login');
  await sleep(2000);
  const page = await mp.currentPage();
  const inputs = await page.$$('input');
  await inputs[0].input('admin');
  await inputs[1].input('Test.1234');
  await page.$('button.btn-login').then(b => b.tap());
  await sleep(3000);

  // 3. AI助手
  await mp.switchTab('/pages/agent/chat');
  await sleep(2000);
  // ... 输入消息并发送

  // 4. 遍历页面
  // ... 遍历所有页面

  mp.disconnect();
})();
```
