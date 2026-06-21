// 诊断脚本：详细分析刷新后消息重复的原因
import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

console.log('=== 诊断刷新后消息重复 ===\n');

// 1. 登录
await page.goto('http://localhost:3006/login', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.locator('#username').fill('testadmin');
await page.locator('#password').fill('testadmin123');
await page.locator('button:has-text("登录")').click();
await page.waitForURL('**/dashboard**', { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(2000);

// 2. 导航到对话页
await page.goto('http://localhost:3006/chat/react', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// 等待 textarea 出现（可能需要先创建会话）
await page.waitForSelector('textarea', { timeout: 10000 }).catch(async () => {
  console.log('textarea 未找到，尝试创建新会话...');
  const newChatBtn = page.locator('button:has-text("新对话"), button:has-text("新建")').first();
  if (await newChatBtn.count() > 0) {
    await newChatBtn.click();
    await page.waitForTimeout(2000);
  }
});
await page.waitForSelector('textarea', { timeout: 10000 });
console.log('textarea 已就绪');

// 4. 发送消息
const testMessage = `诊断测试-${Date.now()}`;
console.log(`发送消息: "${testMessage}"`);

const textarea = page.locator('textarea').first();
await textarea.fill(testMessage);
await page.waitForTimeout(500);

// 发送前记录 localStorage
const localStorageBefore = await page.evaluate(() => {
  return {
    sessions: JSON.parse(localStorage.getItem('cloudops:chat:sessions') || '[]'),
    currentSessionKey: localStorage.getItem('cloudops:chat:currentSessionKey'),
    runIdToSession: JSON.parse(localStorage.getItem('cloudops:chat:runIdToSession') || '{}'),
  };
});
console.log('\n发送前 localStorage:');
console.log(`  sessions 数量: ${localStorageBefore.sessions.length}`);
console.log(`  currentSessionKey: ${localStorageBefore.currentSessionKey}`);
console.log(`  runIdToSession 数量: ${Object.keys(localStorageBefore.runIdToSession).length}`);

// 发送
await page.locator('button:has-text("发送")').click();
await page.waitForTimeout(5000);

// 发送后记录状态
const stateAfterSend = await page.evaluate(() => {
  const sessions = JSON.parse(localStorage.getItem('cloudops:chat:sessions') || '[]');
  const currentSessionKey = localStorage.getItem('cloudops:chat:currentSessionKey');
  const runIdToSession = JSON.parse(localStorage.getItem('cloudops:chat:runIdToSession') || '{}');
  return { sessions, currentSessionKey, runIdToSession };
});
console.log('\n发送后 localStorage:');
console.log(`  sessions 数量: ${stateAfterSend.sessions.length}`);
console.log(`  currentSessionKey: ${stateAfterSend.currentSessionKey}`);
console.log(`  runIdToSession: ${JSON.stringify(stateAfterSend.runIdToSession)}`);

// 获取页面上的消息
const messagesAfterSend = await page.evaluate(() => {
  // 尝试获取所有消息文本
  const allText = document.body.innerText;
  return allText;
});

// 统计测试消息出现次数
const countAfterSend = (messagesAfterSend.match(new RegExp(testMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
console.log(`\n发送后页面中测试消息出现次数: ${countAfterSend}`);

// 5. 刷新页面
console.log('\n--- 刷新页面 ---');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(5000);

// 刷新后记录状态
const stateAfterRefresh = await page.evaluate(() => {
  const sessions = JSON.parse(localStorage.getItem('cloudops:chat:sessions') || '[]');
  const currentSessionKey = localStorage.getItem('cloudops:chat:currentSessionKey');
  const runIdToSession = JSON.parse(localStorage.getItem('cloudops:chat:runIdToSession') || '{}');
  return { sessions, currentSessionKey, runIdToSession };
});
console.log('\n刷新后 localStorage:');
console.log(`  sessions 数量: ${stateAfterRefresh.sessions.length}`);
console.log(`  currentSessionKey: ${stateAfterRefresh.currentSessionKey}`);
console.log(`  runIdToSession: ${JSON.stringify(stateAfterRefresh.runIdToSession)}`);

// 获取刷新后的消息
const messagesAfterRefresh = await page.evaluate(() => {
  return document.body.innerText;
});

const countAfterRefresh = (messagesAfterRefresh.match(new RegExp(testMessage.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length;
console.log(`\n刷新后页面中测试消息出现次数: ${countAfterRefresh}`);

// 6. 检查 WebSocket 请求
console.log('\n--- 检查 chat.history 调用 ---');
const wsHistoryCalls = await page.evaluate(() => {
  // 无法直接访问 WebSocket，但可以检查性能条目
  const entries = performance.getEntriesByType('resource');
  return entries.filter(e => e.name.includes('ws')).length;
});
console.log(`WebSocket 相关资源数: ${wsHistoryCalls}`);

// 7. 截图
await page.screenshot({ path: 'test-screenshots/diag-after-refresh.png', fullPage: true });

// 8. 获取消息列表的 HTML 结构
const messageStructure = await page.evaluate(() => {
  // 查找消息容器
  const msgContainers = document.querySelectorAll('[class*="message"], [class*="bubble"], [class*="chat"]');
  const result = [];
  msgContainers.forEach((el, i) => {
    if (i < 20) {
      result.push({
        index: i,
        className: el.className?.slice(0, 80),
        text: el.textContent?.slice(0, 100),
      });
    }
  });
  return result;
});
console.log('\n消息容器结构:');
messageStructure.forEach(m => {
  console.log(`  [${m.index}] class="${m.className}" text="${m.text}"`);
});

// 9. 获取所有包含测试消息的元素
const testMessageElements = await page.evaluate((msg) => {
  const elements = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if (walker.currentNode.textContent.includes(msg)) {
      const parent = walker.currentNode.parentElement;
      elements.push({
        text: walker.currentNode.textContent.slice(0, 100),
        parentTag: parent?.tagName,
        parentClass: parent?.className?.slice(0, 80),
        grandparentClass: parent?.parentElement?.className?.slice(0, 80),
      });
    }
  }
  return elements;
}, testMessage);
console.log(`\n包含测试消息的文本节点: ${testMessageElements.length}`);
testMessageElements.forEach((el, i) => {
  console.log(`  [${i}] <${el.parentTag}> class="${el.parentClass}"`);
  console.log(`       text="${el.text}"`);
});

await browser.close();
console.log('\n=== 诊断完成 ===');
