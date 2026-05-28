# 微信小程序自动化测试实战指南

> 基于 miniprogram-automator 的全量页面测试经验总结，覆盖环境搭建、导航策略、元素操作、异常处理、截图报告等完整流程。

---

## 1. 环境与连接

### 1.1 前置条件

- Node.js >= 18
- 微信开发者工具（含 CLI）
- `miniprogram-automator`（`npm i miniprogram-automator --save-dev`）
- 开发者工具设置 → 勾选「CLI/HTTP 调用」，端口默认 9420

### 1.2 连接方式

| 方式 | 用法 | 适用场景 |
|------|------|----------|
| `connect` | `automator.connect({ wsEndpoint })` | 开发者工具已打开 |
| `launch` | `automator.launch({ cliPath, projectPath })` | 从零启动 |

**connect 模式**更稳定，避免 CLI 启动时中文路径 `spawn EINVAL` 问题。

```javascript
// 等待 WebSocket 就绪的轮询模式
for (let i = 0; i < 60; i++) {
  try {
    const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9420' });
    console.log('OK:', (await mp.currentPage()).path);
    mp.disconnect();
    return;
  } catch (e) {
    await sleep(1000);
  }
}
```

### 1.3 Launcher.js 补丁

CLI 含中文路径时 spawn 报 `EINVAL`，需给 `node_modules/miniprogram-automator/out/Launcher.js` 第 27 行加 `shell: true`。

---

## 2. 导航策略（核心）

微信小程序页面分两类：Tab 页（`app.json` tabBar 定义）和子页。导航方式不同。

### 2.1 Tab 页导航 — `switchTab`

```javascript
// ✅ 优先用 automator 原生方法（最可靠）
await mp.switchTab('/pages/index/index');

// ⚠️ callWxMethod 有参数格式坑，容易挂起（见 2.5 节）
// await mp.callWxMethod('switchTab', { url: '/pages/user/profile' });
```

### 2.2 子页导航 — `redirectTo`

```javascript
// ✅ 优先用 automator 原生方法
await mp.redirectTo('/pages/accounts/list');
```

### 2.3 兜底 — `reLaunch`

当 switchTab / redirectTo 都失败时，用 `reLaunch` 重建整个页面栈：

```javascript
// ✅ 用 automator 原生方法
await mp.reLaunch('/pages/index/index');
await sleep(3000); // 等待页面完全加载
```

**重要**：`reLaunch` 会触发 `App.onLaunch`，可能触发认证重定向。需要在 `app.js` 中加自动化模式检测：

```javascript
// app.js
checkAuth() {
  if (wx.getStorageSync('__automation__')) return; // 跳过认证
  // ... 原有逻辑
}
```

测试脚本连接后立即设置标志：

```javascript
await mp.callWxMethod('setStorageSync', { key: '__automation__', data: '1' });
```

### 2.4 推荐的导航函数封装

```javascript
async function safeNavTab(mp, url) {
  const targetPath = url.replace(/^\//, '');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await navWithTimeout(() => mp.switchTab(url), 12000);
      await sleep(3000);
      const page = await reacquirePage(mp);
      if (page) {
        try {
          const p = await mp.currentPage();
          if (p && p.path.endsWith(targetPath)) return page;
        } catch (e) {}
      }
    } catch (e) {}
    await sleep(1000);
    try {
      await navWithTimeout(() => mp.callWxMethod('switchTab', { url }), 8000);
      await sleep(3000);
      const page = await reacquirePage(mp);
      if (page) {
        try {
          const p = await mp.currentPage();
          if (p && p.path.endsWith(targetPath)) return page;
        } catch (e) {}
      }
    } catch (e2) {}
  }
  // 兜底 reLaunch
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await navWithTimeout(() => mp.callWxMethod('reLaunch', { url }), 20000);
      await sleep(4000);
      const page = await reacquirePage(mp, 5);
      if (page) {
        try {
          const p = await mp.currentPage();
          if (p && p.path.endsWith(targetPath)) return page;
        } catch (e) {}
      }
    } catch (e) {}
    await sleep(2000);
  }
  return null;
}
```

### 2.5 ⚠️ callWxMethod 参数格式陷阱

**核心发现**：`callWxMethod` 用于导航（`switchTab`/`redirectTo`/`reLaunch`）时容易挂起，而 automator 原生方法稳定可靠。

经过对照实验验证（空闲 90 秒、快速操作 40 次、12 页面连续导航均无断连），**WebSocket 连接本身非常稳定**。挂起的真正原因是 `callWxMethod` 的参数序列化问题：

```javascript
// ❌ 容易挂起 — callWxMethod 把 { url: '...' } 原样传给 DevTools WebSocket 协议
await mp.callWxMethod('switchTab', { url: '/pages/index/index' });
await mp.callWxMethod('reLaunch', { url: '/pages/index/index' });

// ✅ 稳定可靠 — automator 原生方法内部处理了参数序列化
await mp.switchTab('/pages/index/index');
await mp.reLaunch('/pages/index/index');
```

**规则**：导航操作一律用 `mp.switchTab()`、`mp.redirectTo()`、`mp.reLaunch()`，不要用 `callWxMethod` 包装。`callWxMethod` 仅用于非导航的 wx API（如 `setStorageSync`、`getStorageSync`）。

---

## 3. 元素操作

### 3.1 查找元素

```javascript
// 单个
const el = await page.$('.btn-submit');

// 多个
const inputs = await page.$$('input');
const buttons = await page.$$('button');

// 支持的选择器：类名、标签名、复合选择器
await page.$$('.input-field');
await page.$$('view.container text');
```

### 3.2 输入文本

```javascript
// element.input() 触发 bindinput 事件（需 automator >= 0.9.0）
await inputs[0].input('admin');
await inputs[1].input('Test@20181025');

// 验证输入是否生效
const data = await page.data();
console.log(data.username); // 'admin'
```

**注意事项**：
- `input()` 只能操作 `<input>` 和 `<textarea>` 组件
- 密码字段用 `type="password"`，不是 `password="true"`
- 输入后需 `sleep(300)` 等待 `bindinput` 回调完成

### 3.3 点击

```javascript
await element.tap();
await sleep(500); // 等待事件处理完成
```

### 3.4 读取属性

```javascript
const placeholder = await element.attribute('placeholder');
const disabled = await element.attribute('disabled');
const text = await element.text();
```

### 3.5 滑动

```javascript
async function swipeInElement(el, distance, steps) {
  const size = await el.size();
  const centerX = size.width / 2;
  const startY = size.height / 3;
  const toY = startY - distance;

  await el.touchstart({ x: centerX, y: startY });
  for (let i = 0; i < steps; i++) {
    const progress = (i + 1) / steps;
    await el.touchmove({
      x: centerX,
      y: startY + (toY - startY) * progress
    });
    await sleep(80);
  }
  await el.touchend({ x: centerX, y: toY });
  await sleep(400);
  return true;
}
```

---

## 4. 页面状态管理

### 4.1 reacquirePage — 页面引用刷新

`mp.currentPage()` 返回的页面代理可能在导航后失效，需重试获取：

```javascript
async function reacquirePage(mp, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const p = await mp.currentPage();
      if (p) return p;
    } catch (e) {}
    await sleep(1000);
  }
  return null;
}
```

### 4.2 waitForElement — 等待元素渲染

异步 API 加载密集的页面，元素可能延迟出现：

```javascript
async function waitForElement(page, selector, timeout = 8000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    try {
      const els = await page.$$(selector);
      if (els && els.length > 0) return els[0];
    } catch (e) {}
    await sleep(500);
  }
  return null;
}
```

### 4.3 capturePageState — 状态快照

```javascript
async function capturePageState(page, mp, label) {
  const state = { label, path: null, texts: [], buttons: [], inputs: [], screenshots: [] };
  try { const p = await mp.currentPage(); state.path = p ? p.path : null; } catch (e) {}
  if (page) {
    try { state.dataKeys = Object.keys(await page.data()); } catch (e) {}
    try {
      const els = await page.$$('text') || [];
      for (const el of els) {
        try {
          const t = await el.text();
          if (t && t.trim()) state.texts.push(t.trim().substring(0, 60));
        } catch (e) {}
      }
    } catch (e) {}
    // ... buttons, inputs 同理
  }
  state.screenshots.push(await mp.screenshot({ path: `.../${label}.png` }));
  return state;
}
```

---

## 5. 异常处理

### 5.1 page destroyed — 最常见的错误

**原因**：页面导航后、异步 API 回调触发重定向、DevTools 页面生命周期竞态。

**对策**：
1. 每次导航后调用 `reacquirePage` 刷新引用
2. 所有元素操作包 `try/catch`
3. 关键操作后调用 `reacquirePage` 再获取引用
4. 测试入口函数整体重试（仅对 destroyed/timeout 错误重试）

```javascript
async function testPage(name, fn) {
  // ...
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await fn(entry);
      // pass
      return;
    } catch (e) {
      if (attempt < 2 && (e.message.includes('destroyed') || e.message.includes('timeout'))) {
        await sleep(3000); // 等待状态稳定
        entry.interactions = [];
        entry.screenshots = [];
        continue;
      }
      throw e;
    }
  }
}
```

### 5.2 API 401 重定向

后端返回 401 时，`api.js` 通常会 `wx.redirectTo('/pages/login/login')`，导致当前页面被销毁。

**对策**：在 `api.js` 中加自动化模式检测：

```javascript
if (res.statusCode === 401) {
  // 不在自动化模式下才重定向
  if (!wx.getStorageSync('__automation__')) {
    wx.redirectTo({ url: '/pages/login/login' });
  }
  reject(new Error('Session expired'));
  return;
}
```

### 5.3 超时保护

所有导航和操作加超时，防止单个操作卡死整个测试：

```javascript
async function navWithTimeout(fn, timeout = 12000) {
  return Promise.race([
    fn(),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeout))
  ]);
}
```

---

## 6. 测试流程设计

### 6.1 前置准备

```javascript
// 连接
const mp = await automator.connect({ wsEndpoint });

// 设置自动化标志
await mp.callWxMethod('setStorageSync', { key: '__automation__', data: '1' });

// 监听控制台
mp.on('console', msg => {
  if (msg.type === 'error') console.log('[console.error]', msg.args.join(' '));
});
```

### 6.2 测试间状态重置

每个测试前回到首页，保持干净状态：

```javascript
async function navToHome(mp) {
  try {
    await mp.switchTab('/pages/index/index');
    await sleep(2000);
    return await reacquirePage(mp);
  } catch (e) {}
  try {
    await mp.reLaunch('/pages/index/index');
    await sleep(3000);
    return await reacquirePage(mp, 5);
  } catch (e) {}
  return null;
}
```

### 6.3 截图策略

```javascript
// 每个测试的开始和结束各截一张
await mp.screenshot({
  path: `automation-results/screenshots/${label}.png`
});
```

---

## 7. Mock 技巧

### 7.1 evaluate 直接操作内部状态

```javascript
// 设置登录态（跳过登录流程）
await mp.evaluate(() => {
  const app = getApp();
  const token = 'mock-token-' + Date.now();
  app.globalData.token = token;
  app.globalData.userInfo = { id: 1, username: 'admin', role: 'admin' };
  wx.setStorageSync('token', token);
});
```

### 7.2 callWxMethod 调用小程序 API

```javascript
// ✅ 获取存储
const token = await mp.callWxMethod('getStorageSync', 'token');

// ✅ 设置存储
await mp.callWxMethod('setStorageSync', '__automation__', '1');

// ✅ 直接调用页面方法
await page.callMethod('onModeChange', { detail: { value: 'auto_execute' } });

// ❌ 不要用 callWxMethod 做导航（容易挂起）
// await mp.callWxMethod('switchTab', { url: '/pages/index/index' });
```

---

## 8. 常见问题速查

| 问题 | 原因 | 解决 |
|------|------|------|
| `spawn EINVAL` | CLI 路径含中文 | Launcher.js 加 `shell: true` |
| `page destroyed` | 页面导航竞态 | `reacquirePage` + 重试 |
| switchTab/reLaunch 挂起 | `callWxMethod` 参数序列化问题 | 用 automator 原生方法（`mp.switchTab`/`mp.reLaunch`） |
| 登录页反复跳 | API 401 重定向 | `__automation__` 标志 + api.js 检测 |
| 输入不生效 | `input()` 未触发 bindinput | 检查 automator 版本 >= 0.9.0 |
| 元素找不到 | 页面未完全渲染 | `waitForElement` 等待 |
| 密码字段判断错 | 用 `password="true"` 而非 `type="password"` | 检查 WXML 中 input 的实际属性 |

---

## 9. 完整测试脚本结构

```javascript
const automator = require('miniprogram-automator');
const sleep = ms => new Promise(r => setTimeout(r, ms));

const results = { summary: { total: 0, passed: 0, failed: 0 }, pages: [] };

(async () => {
  // 1. 连接
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9420' });
  await mp.callWxMethod('setStorageSync', '__automation__', '1');

  // 2. 定义测试
  const tests = [
    { name: '首页', nav: '/pages/index/index', type: 'tab' },
    { name: '登录', nav: '/pages/login/login', type: 'sub' },
    // ...
  ];

  // 3. 逐个执行
  for (const test of tests) {
    results.summary.total++;
    try {
      const page = test.type === 'tab'
        ? await safeNavTab(mp, test.nav)
        : await safeNavSub(mp, test.nav);
      if (!page) throw new Error('navigation failed');
      // ... 执行测试操作
      results.summary.passed++;
      results.pages.push({ name: test.name, status: 'ok' });
    } catch (e) {
      results.summary.failed++;
      results.pages.push({ name: test.name, status: 'fail', error: e.message });
    }
  }

  // 4. 输出报告
  console.log(JSON.stringify(results, null, 2));
  mp.disconnect();
})();
```

---

## 10. 调试技巧

1. **加 `--inspect` 调试测试脚本**：`node --inspect automate-test-all.js`
2. **打印页面 data**：`console.log(await page.data())` 检查状态绑定
3. **监听 console.error**：`mp.on('console', ...)` 捕获小程序运行时错误
4. **分步执行**：先单独测试导航，再测元素操作，最后组合
5. **检查 DevTools 端口**：设置 → 本地设置 → 调试端口号（默认 9420）
