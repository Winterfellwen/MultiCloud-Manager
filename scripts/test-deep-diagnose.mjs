// 深度诊断：精确追踪消息来源
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';

const SHOTS_DIR = './test-screenshots/diagnose';
mkdirSync(SHOTS_DIR, { recursive: true });

console.log('=== 深度诊断：消息双发 + 审批问题 ===\n');

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

// 注入监控脚本
let wsMessageCount = 0;
let chatSendRequests = 0;
let historyRequests = 0;
let eventMessages = 0;

await page.addInitScript(() => {
  window.__monitor = {
    wsMessages: [],
    chatSends: [],
    historyCalls: [],
    storeUpdates: [],
    apiErrors: [],
  };

  // 拦截 WebSocket 消息
  const origWebSocket = window.WebSocket;
  window.WebSocket = class extends origWebSocket {
    constructor(url, protocols) {
      super(url, protocols);
      this.addEventListener('message', (event) => {
        try {
          const frame = JSON.parse(event.data);
          if (frame.type === 'event') {
            window.__monitor.wsMessages.push({
              time: Date.now(),
              event: frame.event,
              payloadType: frame.payload?.type,
              runId: frame.payload?.runId,
              text: frame.payload?.text || frame.payload?.finalText || '',
            });
          } else if (frame.type === 'res') {
            if (frame.id?.toString().includes('chat.history') || frame.id === 'req-history' || frame.payload?.events !== undefined) {
              window.__monitor.historyCalls.push({
                time: Date.now(),
                eventCount: frame.payload?.events?.length || 0,
                hasInFlightRun: !!frame.payload?.inFlightRun,
                inFlightRunText: frame.payload?.inFlightRun?.bufferedText || '',
              });
            }
          }
        } catch {}
      });

      // 拦截发送
      const origSend = this.send.bind(this);
      this.send = (data) => {
        try {
          const frame = JSON.parse(data);
          if (frame.type === 'req' && frame.method === 'chat.send') {
            window.__monitor.chatSends.push({
              time: Date.now(),
              runId: frame.params?.clientRunId,
              message: frame.params?.message,
            });
          }
        } catch {}
        return origSend(data);
      };
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

// 导航到对话页
await page.goto('http://localhost:3006/chat/react', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// 清除所有 chat 相关 localStorage
await page.evaluate(() => {
  localStorage.removeItem('cloudops:chat:sessions');
  localStorage.removeItem('cloudops:chat:currentSessionKey');
  localStorage.removeItem('cloudops:chat:runIdToSession');
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// 截图初始状态
await page.screenshot({ path: `${SHOTS_DIR}/01-initial.png`, fullPage: true });

// 发送测试消息
const testMessage = `深度诊断-${Date.now()}`;
console.log(`[1] 发送消息: ${testMessage}`);

await page.waitForSelector('textarea', { timeout: 10000 });
await page.locator('textarea').fill(testMessage);
await page.waitForTimeout(500);

// 点击发送前记录
await page.screenshot({ path: `${SHOTS_DIR}/02-before-send.png`, fullPage: true });

await page.locator('button:has-text("发送")').click();
console.log('  已点击发送按钮');

// 等待 AI 回复完成（10 秒）
await page.waitForTimeout(12000);

// 发送后截图 + 获取监控数据
await page.screenshot({ path: `${SHOTS_DIR}/03-after-send.png`, fullPage: true });

const sendResult = await page.evaluate(() => {
  return {
    wsMessages: window.__monitor.wsMessages.length,
    chatSends: window.__monitor.chatSends.length,
    historyCalls: window.__monitor.historyCalls.length,
    chatSendDetails: window.__monitor.chatSends,
    historyDetails: window.__monitor.historyCalls,
    localStorage: {
      sessions: JSON.parse(localStorage.getItem('cloudops:chat:sessions') || '[]'),
      currentSessionKey: localStorage.getItem('cloudops:chat:currentSessionKey'),
      runIdToSession: JSON.parse(localStorage.getItem('cloudops:chat:runIdToSession') || '{}'),
    },
    messagesInStore: 0, // 无法直接访问 Zustand store
    pageText: document.body.innerText,
  };
});

console.log(`  chat.send 请求次数: ${sendResult.chatSends}`);
console.log(`  WebSocket 事件消息数: ${sendResult.wsMessages}`);
console.log(`  chat.history 请求次数: ${sendResult.historyCalls}`);
console.log(`  sessions count: ${sendResult.localStorage.sessions.length}`);
console.log(`  currentSessionKey: ${sendResult.localStorage.currentSessionKey}`);
console.log(`  runIdToSession: ${JSON.stringify(sendResult.localStorage.runIdToSession)}`);

// 统计页面中测试消息出现次数
const msgCountAfterSend = (sendResult.pageText.match(new RegExp(testMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
console.log(`  页面中测试消息出现次数: ${msgCountAfterSend}`);

// 刷新页面
console.log('\n[2] 刷新页面...');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(10000);

// 刷新后截图
await page.screenshot({ path: `${SHOTS_DIR}/04-after-refresh.png`, fullPage: true });

const refreshResult = await page.evaluate((msg) => {
  return {
    pageText: document.body.innerText,
    dialogs: document.querySelectorAll('[role="dialog"]').length,
    localStorage: {
      sessions: JSON.parse(localStorage.getItem('cloudops:chat:sessions') || '[]'),
      currentSessionKey: localStorage.getItem('cloudops:chat:currentSessionKey'),
      runIdToSession: JSON.parse(localStorage.getItem('cloudops:chat:runIdToSession') || '{}'),
    },
  };
}, testMessage);

const msgCountAfterRefresh = (refreshResult.pageText.match(new RegExp(testMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
console.log(`  刷新后页面中测试消息出现次数: ${msgCountAfterRefresh}`);
console.log(`  刷新后弹窗数量: ${refreshResult.dialogs}`);

// 检查是否有审批弹窗重新出现
const hasApprovalDialog = await page.evaluate(() => {
  const text = document.body.innerText;
  return text.includes('工具执行审批') || text.includes('审批');
});
console.log(`  刷新后是否有审批弹窗: ${hasApprovalDialog}`);

// 再次刷新测试
console.log('\n[3] 第二次刷新...');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(10000);
await page.screenshot({ path: `${SHOTS_DIR}/05-second-refresh.png`, fullPage: true });

const secondRefreshResult = await page.evaluate((msg) => {
  return {
    pageText: document.body.innerText,
    dialogs: document.querySelectorAll('[role="dialog"]').length,
  };
}, testMessage);

const msgCountSecondRefresh = (secondRefreshResult.pageText.match(new RegExp(testMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
console.log(`  第二次刷新后页面中测试消息出现次数: ${msgCountSecondRefresh}`);

// 结果汇总
console.log('\n=== 问题诊断结果 ===');

if (sendResult.chatSends > 1) {
  console.log(`❌ 消息双发：chat.send 被调用了 ${sendResult.chatSends} 次（应为 1）`);
  sendResult.chatSends.forEach((send, i) => {
    console.log(`  [${i}] runId=${send.runId}, message=${send.message}`);
  });
} else {
  console.log(`✓ chat.send 调用次数正常 (${sendResult.chatSends})`);
}

if (msgCountAfterSend > 1) {
  console.log(`❌ 发送后消息重复：页面中显示了 ${msgCountAfterSend} 次相同消息（应为 1）`);
  console.log('  可能原因：前端 handleEvent 收到了重复事件，或消息渲染组件重复渲染');
} else {
  console.log(`✓ 发送后消息数量正常`);
}

if (msgCountAfterRefresh > 1) {
  console.log(`❌ 刷新后消息重复：页面中显示了 ${msgCountAfterRefresh} 次相同消息`);
  console.log('  可能原因：loadSessionHistory 合并逻辑有问题，或 inFlightRun 与数据库事件都产生了消息');
} else if (msgCountAfterRefresh === 0) {
  console.log(`⚠️  刷新后消息消失：chat.history 可能返回空事件（数据库未持久化）`);
} else {
  console.log(`✓ 刷新后消息数量正常`);
}

if (hasApprovalDialog) {
  console.log(`❌ 审批弹窗重新弹出：刷新后审批弹窗再次出现`);
} else {
  console.log(`✓ 刷新后无审批弹窗`);
}

await browser.close();
