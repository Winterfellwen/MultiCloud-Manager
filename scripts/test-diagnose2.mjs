// 诊断2：监控 loadSessionHistory 调用次数和消息追加逻辑
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

// 注入脚本监控 store 状态变化
await page.addInitScript(() => {
  window.__chatDebug = {
    loadSessionHistoryCalls: [],
    messagesBySessionSnapshots: [],
  };

  // 监控 console.error
  const origError = console.error;
  console.error = function(...args) {
    if (args[0]?.includes?.('loadSessionHistory') || args[0]?.includes?.('Failed')) {
      window.__chatDebug.loadSessionHistoryCalls.push({
        time: Date.now(),
        args: args.map(a => typeof a === 'string' ? a : String(a)).join(' '),
      });
    }
    origError.apply(console, args);
  };
});

// 登录
await page.goto('http://localhost:3006/login', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.locator('#username').fill('testadmin');
await page.locator('#password').fill('testadmin123');
await page.locator('button:has-text("登录")').click();
await page.waitForURL('**/dashboard**', { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(2000);

// 导航到对话页
await page.goto('http://localhost:3006/chat/react', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// 清除旧的 localStorage（确保干净环境）
await page.evaluate(() => {
  localStorage.removeItem('cloudops:chat:sessions');
  localStorage.removeItem('cloudops:chat:currentSessionKey');
  localStorage.removeItem('cloudops:chat:runIdToSession');
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// 发送消息
const testMessage = `诊断2-${Date.now()}`;
console.log(`发送消息: "${testMessage}"`);

await page.waitForSelector('textarea', { timeout: 10000 });
await page.locator('textarea').fill(testMessage);
await page.waitForTimeout(500);
await page.locator('button:has-text("发送")').click();
await page.waitForTimeout(5000);

// 发送后检查
const afterSend = await page.evaluate(() => {
  const text = document.body.innerText;
  const count = (text.match(new RegExp(window.__chatDebug?.testMsg || '诊断2', 'g')) || []).length;
  return {
    messageCount: count,
    localStorage: {
      sessions: JSON.parse(localStorage.getItem('cloudops:chat:sessions') || '[]').length,
      runIdToSession: Object.keys(JSON.parse(localStorage.getItem('cloudops:chat:runIdToSession') || '{}')).length,
    },
  };
});
console.log(`发送后消息出现次数: ${afterSend.messageCount}`);
console.log(`发送后 localStorage: sessions=${afterSend.localStorage.sessions}, runIdToSession=${afterSend.localStorage.runIdToSession}`);

// 刷新前记录 store 状态
const storeStateBeforeRefresh = await page.evaluate(() => {
  // 尝试访问 Zustand store
  const store = window.__chatStore || null;
  return {
    hasStore: !!store,
  };
});

// 刷新
console.log('\n--- 刷新页面 ---');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(5000);

// 刷新后检查
const afterRefresh = await page.evaluate((msg) => {
  const text = document.body.innerText;
  const escaped = msg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const count = (text.match(new RegExp(escaped, 'g')) || []).length;

  return {
    messageCount: count,
    localStorage: {
      sessions: JSON.parse(localStorage.getItem('cloudops:chat:sessions') || '[]').length,
      currentSessionKey: localStorage.getItem('cloudops:chat:currentSessionKey'),
      runIdToSession: JSON.parse(localStorage.getItem('cloudops:chat:runIdToSession') || '{}'),
    },
    debug: window.__chatDebug || {},
  };
}, testMessage);

console.log(`\n刷新后消息出现次数: ${afterRefresh.messageCount}`);
console.log(`刷新后 localStorage:`);
console.log(`  sessions: ${afterRefresh.localStorage.sessions}`);
console.log(`  currentSessionKey: ${afterRefresh.localStorage.currentSessionKey}`);
console.log(`  runIdToSession: ${JSON.stringify(afterRefresh.localStorage.runIdToSession)}`);
console.log(`  loadSessionHistory 错误调用: ${afterRefresh.debug.loadSessionHistoryCalls?.length || 0}`);

// 再次刷新（测试第二次刷新）
console.log('\n--- 第二次刷新 ---');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(5000);

const afterRefresh2 = await page.evaluate((msg) => {
  const text = document.body.innerText;
  const escaped = msg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const count = (text.match(new RegExp(escaped, 'g')) || []).length;
  return { messageCount: count };
}, testMessage);
console.log(`第二次刷新后消息出现次数: ${afterRefresh2.messageCount}`);

// 第三次刷新
console.log('\n--- 第三次刷新 ---');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(5000);

const afterRefresh3 = await page.evaluate((msg) => {
  const text = document.body.innerText;
  const escaped = msg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const count = (text.match(new RegExp(escaped, 'g')) || []).length;
  return { messageCount: count };
}, testMessage);
console.log(`第三次刷新后消息出现次数: ${afterRefresh3.messageCount}`);

// 截图
await page.screenshot({ path: 'test-screenshots/diag2-final.png', fullPage: true });

await browser.close();
console.log('\n=== 诊断完成 ===');
