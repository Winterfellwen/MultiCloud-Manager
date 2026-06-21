// 诊断4：检查刷新后消息来源
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

// 发送消息
const testMessage = `诊断4-${Date.now()}`;
console.log(`发送消息: "${testMessage}"`);

await page.waitForSelector('textarea', { timeout: 10000 });
await page.locator('textarea').fill(testMessage);
await page.waitForTimeout(500);
await page.locator('button:has-text("发送")').click();
await page.waitForTimeout(5000);

// 发送后检查所有 localStorage
const localStorageAfterSend = await page.evaluate(() => {
  const result = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    result[key] = localStorage.getItem(key)?.slice(0, 200);
  }
  return result;
});
console.log('\n发送后所有 localStorage:');
for (const [key, value] of Object.entries(localStorageAfterSend)) {
  console.log(`  ${key}: ${value}`);
}

// 获取 sessionKey
const sessionKey = await page.evaluate(() => localStorage.getItem('cloudops:chat:currentSessionKey'));
console.log(`\nSessionKey: ${sessionKey}`);

// 刷新前获取页面上消息数量
const msgCountBeforeRefresh = await page.evaluate((msg) => {
  const text = document.body.innerText;
  const escaped = msg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (text.match(new RegExp(escaped, 'g')) || []).length;
}, testMessage);
console.log(`刷新前消息出现次数: ${msgCountBeforeRefresh}`);

// 刷新
console.log('\n--- 刷新页面 ---');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(5000);

// 刷新后立即检查 localStorage（在 loadSessionHistory 完成前）
const localStorageAfterRefresh = await page.evaluate(() => {
  const result = {};
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    result[key] = localStorage.getItem(key)?.slice(0, 200);
  }
  return result;
});
console.log('\n刷新后所有 localStorage:');
for (const [key, value] of Object.entries(localStorageAfterRefresh)) {
  console.log(`  ${key}: ${value}`);
}

// 刷新后消息数量
const msgCountAfterRefresh = await page.evaluate((msg) => {
  const text = document.body.innerText;
  const escaped = msg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (text.match(new RegExp(escaped, 'g')) || []).length;
}, testMessage);
console.log(`\n刷新后消息出现次数: ${msgCountAfterRefresh}`);

// 检查是否有多个会话
const sessions = await page.evaluate(() => {
  return JSON.parse(localStorage.getItem('cloudops:chat:sessions') || '[]');
});
console.log(`\n会话数量: ${sessions.length}`);
sessions.forEach((s, i) => {
  console.log(`  [${i}] key=${s.sessionKey}, title="${s.title}", messageCount=${s.messageCount}`);
});

// 获取页面上所有包含测试消息的元素详情
const messageElements = await page.evaluate((msg) => {
  const elements = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if (walker.currentNode.textContent.includes(msg)) {
      const parent = walker.currentNode.parentElement;
      const grandparent = parent?.parentElement;
      const greatGrandparent = grandparent?.parentElement;
      elements.push({
        text: walker.currentNode.textContent.slice(0, 150),
        parent: {
          tag: parent?.tagName,
          class: parent?.getAttribute('class')?.slice(0, 60),
        },
        grandparent: {
          tag: grandparent?.tagName,
          class: grandparent?.getAttribute('class')?.slice(0, 60),
        },
        greatGrandparent: {
          tag: greatGrandparent?.tagName,
          class: greatGrandparent?.getAttribute('class')?.slice(0, 60),
        },
      });
    }
  }
  return elements;
}, testMessage);

console.log(`\n包含测试消息的元素: ${messageElements.length}`);
messageElements.forEach((el, i) => {
  console.log(`  [${i}]`);
  console.log(`    text: "${el.text}"`);
  console.log(`    parent: <${el.parent.tag}> class="${el.parent.class}"`);
  console.log(`    grandparent: <${el.grandparent.tag}> class="${el.grandparent.class}"`);
  console.log(`    greatGrandparent: <${el.greatGrandparent.tag}> class="${el.greatGrandparent.class}"`);
});

// 截图
await page.screenshot({ path: 'test-screenshots/diag4-after-refresh.png', fullPage: true });

await browser.close();
console.log('\n=== 诊断完成 ===');
