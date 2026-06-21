// 诊断7：拦截 WebSocket 消息，监控 loadSessionHistory 调用
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

// 拦截 WebSocket 消息
await page.addInitScript(() => {
  window.__wsMessages = [];
  const origWebSocket = window.WebSocket;
  window.WebSocket = class extends origWebSocket {
    constructor(url, protocols) {
      super(url, protocols);
      this.addEventListener('message', (event) => {
        try {
          const frame = JSON.parse(event.data);
          if (frame.type === 'res' && frame.payload?.events !== undefined) {
            window.__wsMessages.push({
              time: Date.now(),
              method: 'chat.history',
              eventCount: frame.payload.events?.length || 0,
              inFlightRun: frame.payload.inFlightRun,
            });
          }
          if (frame.type === 'event') {
            window.__wsMessages.push({
              time: Date.now(),
              type: 'event',
              event: frame.event,
              payloadType: frame.payload?.type,
              runId: frame.payload?.runId,
            });
          }
        } catch {}
      });
    }
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

await page.goto('http://localhost:3006/chat/react', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// 清除旧数据
await page.evaluate(() => {
  localStorage.removeItem('cloudops:chat:sessions');
  localStorage.removeItem('cloudops:chat:currentSessionKey');
  localStorage.removeItem('cloudops:chat:runIdToSession');
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// 清空 WS 消息记录
await page.evaluate(() => { window.__wsMessages = []; });

// 发送消息
const testMessage = `诊断7-${Date.now()}`;
console.log(`发送消息: "${testMessage}"`);

await page.waitForSelector('textarea', { timeout: 10000 });
await page.locator('textarea').fill(testMessage);
await page.waitForTimeout(500);
await page.locator('button:has-text("发送")').click();
await page.waitForTimeout(8000);

// 获取发送后的 WS 消息
const wsMessagesAfterSend = await page.evaluate(() => window.__wsMessages);
console.log(`\n发送后 WS 消息: ${wsMessagesAfterSend.length}`);
wsMessagesAfterSend.forEach((m, i) => {
  if (m.method) {
    console.log(`  [${i}] ${m.method}: events=${m.eventCount}, inFlightRun=${JSON.stringify(m.inFlightRun)}`);
  } else {
    console.log(`  [${i}] event: ${m.event}/${m.payloadType}, runId=${m.runId}`);
  }
});

// 刷新前清空记录
await page.evaluate(() => { window.__wsMessages = []; });

// 刷新
console.log('\n--- 刷新 ---');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(8000);

// 获取刷新后的 WS 消息
const wsMessagesAfterRefresh = await page.evaluate(() => window.__wsMessages);
console.log(`\n刷新后 WS 消息: ${wsMessagesAfterRefresh.length}`);
wsMessagesAfterRefresh.forEach((m, i) => {
  if (m.method) {
    console.log(`  [${i}] ${m.method}: events=${m.eventCount}, inFlightRun=${JSON.stringify(m.inFlightRun)}`);
  } else {
    console.log(`  [${i}] event: ${m.event}/${m.payloadType}, runId=${m.runId}`);
  }
});

// 获取刷新后消息数量
const countAfterRefresh = await page.evaluate((msg) => {
  const escaped = msg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const text = document.body.innerText;
  const matches = text.match(new RegExp(escaped, 'g')) || [];
  return matches.length;
}, testMessage);
console.log(`\n刷新后测试消息出现次数: ${countAfterRefresh}`);

// 获取 AI 回复内容
const aiReplies = await page.evaluate(() => {
  // 查找 AI 回复的文本
  const text = document.body.innerText;
  return text;
});
console.log(`\n页面文本（后 1000 字符）:`);
console.log(aiReplies.slice(-1000));

await browser.close();
