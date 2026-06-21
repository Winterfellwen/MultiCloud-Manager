// 诊断3：直接查询后端 chat.history 返回的事件
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

// 登录
await page.goto('http://localhost:3006/login', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.locator('#username').fill('testadmin');
await page.locator('#password').fill('testadmin123');
await page.locator('button:has-text("登录")').click();
await page.waitForURL('**/dashboard**', { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(2000);

// 获取 token
const token = await page.evaluate(() => {
  // zustand persist 存储在 cloudops-auth key
  const raw = localStorage.getItem('cloudops-auth');
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return parsed?.state?.accessToken || null;
    } catch {}
  }
  return null;
});
console.log(`Token: ${token?.slice(0, 30)}...`);

// 导航到对话页
await page.goto('http://localhost:3006/chat/react', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// 清除旧的 localStorage
await page.evaluate(() => {
  localStorage.removeItem('cloudops:chat:sessions');
  localStorage.removeItem('cloudops:chat:currentSessionKey');
  localStorage.removeItem('cloudops:chat:runIdToSession');
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// 发送消息
const testMessage = `诊断3-${Date.now()}`;
console.log(`发送消息: "${testMessage}"`);

await page.waitForSelector('textarea', { timeout: 10000 });
await page.locator('textarea').fill(testMessage);
await page.waitForTimeout(500);
await page.locator('button:has-text("发送")').click();
await page.waitForTimeout(5000);

// 获取 sessionKey
const sessionKey = await page.evaluate(() => localStorage.getItem('cloudops:chat:currentSessionKey'));
console.log(`SessionKey: ${sessionKey}`);

// 直接通过 WebSocket 查询 chat.history
const historyResult = await page.evaluate(async ({ sk, tk }) => {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://localhost:3005/ws?token=${tk}`);
    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('WebSocket timeout'));
    }, 10000);

    ws.onopen = () => {
      const id = 'req-history-1';
      const handler = (event) => {
        try {
          const frame = JSON.parse(event.data);
          if (frame.type === 'res' && frame.id === id) {
            ws.close();
            clearTimeout(timeout);
            resolve(frame.payload);
          }
        } catch {}
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ type: 'req', id, method: 'chat.history', params: { sessionKey: sk } }));
    };

    ws.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('WebSocket error'));
    };
  });
}, { sk: sessionKey, tk: token });

console.log('\n=== chat.history 返回的事件 ===');
console.log(`事件总数: ${historyResult.events?.length || 0}`);
console.log(`inFlightRun: ${JSON.stringify(historyResult.inFlightRun)}`);

if (historyResult.events) {
  // 按类型分组统计
  const typeCount = {};
  for (const evt of historyResult.events) {
    typeCount[evt.type] = (typeCount[evt.type] || 0) + 1;
  }
  console.log('\n事件类型统计:');
  for (const [type, count] of Object.entries(typeCount)) {
    console.log(`  ${type}: ${count}`);
  }

  // 显示所有 user_message 事件
  const userMessages = historyResult.events.filter(e => e.type === 'user_message');
  console.log(`\nuser_message 事件详情 (${userMessages.length} 条):`);
  userMessages.forEach((evt, i) => {
    console.log(`  [${i}] seq=${evt.seq}, runId=${evt.payload?.runId}, message="${evt.payload?.message}"`);
  });

  // 显示所有事件
  console.log('\n所有事件:');
  historyResult.events.forEach((evt, i) => {
    console.log(`  [${i}] seq=${evt.seq}, type=${evt.type}, runId=${evt.payload?.runId}`);
  });
}

await browser.close();
console.log('\n=== 诊断完成 ===');
