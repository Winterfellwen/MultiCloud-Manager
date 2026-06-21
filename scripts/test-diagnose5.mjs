// 诊断5：检查发送后消息出现 3 次的原因
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
const testMessage = `诊断5-${Date.now()}`;
console.log(`发送消息: "${testMessage}"`);

await page.waitForSelector('textarea', { timeout: 10000 });
await page.locator('textarea').fill(testMessage);
await page.waitForTimeout(500);
await page.locator('button:has-text("发送")').click();
await page.waitForTimeout(5000);

// 获取所有包含测试消息的元素详情
const messageElements = await page.evaluate((msg) => {
  const elements = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    if (walker.currentNode.textContent.includes(msg)) {
      const parent = walker.currentNode.parentElement;
      const grandparent = parent?.parentElement;
      const greatGrandparent = grandparent?.parentElement;
      const greatGreatGrandparent = greatGrandparent?.parentElement;
      elements.push({
        text: walker.currentNode.textContent.slice(0, 150),
        parent: { tag: parent?.tagName, class: parent?.getAttribute('class')?.slice(0, 80) },
        grandparent: { tag: grandparent?.tagName, class: grandparent?.getAttribute('class')?.slice(0, 80) },
        greatGrandparent: { tag: greatGrandparent?.tagName, class: greatGrandparent?.getAttribute('class')?.slice(0, 80) },
        greatGreatGrandparent: { tag: greatGreatGrandparent?.tagName, class: greatGreatGrandparent?.getAttribute('class')?.slice(0, 80) },
      });
    }
  }
  return elements;
}, testMessage);

console.log(`\n发送后包含测试消息的元素: ${messageElements.length}`);
messageElements.forEach((el, i) => {
  console.log(`\n  [${i}]`);
  console.log(`    text: "${el.text}"`);
  console.log(`    parent: <${el.parent.tag}> class="${el.parent.class}"`);
  console.log(`    grandparent: <${el.grandparent.tag}> class="${el.grandparent.class}"`);
  console.log(`    greatGrandparent: <${el.greatGrandparent.tag}> class="${el.greatGrandparent.class}"`);
  console.log(`    greatGreatGrandparent: <${el.greatGreatGrandparent.tag}> class="${el.greatGreatGrandparent.class}"`);
});

// 截图
await page.screenshot({ path: 'test-screenshots/diag5-after-send.png', fullPage: true });

// 检查 React 组件树中的消息
const reactMessages = await page.evaluate(() => {
  // 查找所有消息气泡
  const bubbles = document.querySelectorAll('[class*="bubble"], [class*="message"], [class*="chat-msg"]');
  const result = [];
  bubbles.forEach((el, i) => {
    if (i < 20) {
      result.push({
        index: i,
        class: el.getAttribute('class')?.slice(0, 80),
        text: el.textContent?.slice(0, 100),
      });
    }
  });
  return result;
});
console.log(`\n消息气泡元素: ${reactMessages.length}`);
reactMessages.forEach(m => {
  console.log(`  [${m.index}] class="${m.class}" text="${m.text}"`);
});

await browser.close();
console.log('\n=== 诊断完成 ===');
