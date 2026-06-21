// 诊断6：详细检查消息区 DOM 结构
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

// 发送消息
const testMessage = `诊断6-${Date.now()}`;
console.log(`发送消息: "${testMessage}"`);

await page.waitForSelector('textarea', { timeout: 10000 });
await page.locator('textarea').fill(testMessage);
await page.waitForTimeout(500);
await page.locator('button:has-text("发送")').click();
await page.waitForTimeout(5000);

// 获取整个消息区的 HTML
const messageAreaHTML = await page.evaluate(() => {
  // 查找消息列表容器
  const containers = document.querySelectorAll('[class*="flex-1"], [class*="message"], [class*="overflow"]');
  let result = [];
  containers.forEach((el) => {
    const text = el.textContent?.trim();
    if (text && text.length > 10 && text.length < 5000) {
      result.push({
        tag: el.tagName,
        class: el.getAttribute('class')?.slice(0, 100),
        text: text.slice(0, 300),
        childCount: el.children.length,
      });
    }
  });
  return result.slice(0, 15);
});

console.log('\n发送后页面容器:');
messageAreaHTML.forEach((el, i) => {
  console.log(`  [${i}] <${el.tag}> class="${el.class}" children=${el.childCount}`);
  console.log(`       text: "${el.text}"`);
});

// 获取所有文本节点
const allText = await page.evaluate(() => document.body.innerText);
console.log('\n页面所有文本（前 2000 字符）:');
console.log(allText.slice(0, 2000));

// 刷新
console.log('\n--- 刷新 ---');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(5000);

// 刷新后获取消息区
const messageAreaAfterRefresh = await page.evaluate(() => {
  const containers = document.querySelectorAll('[class*="flex-1"], [class*="message"], [class*="overflow"]');
  let result = [];
  containers.forEach((el) => {
    const text = el.textContent?.trim();
    if (text && text.length > 10 && text.length < 5000) {
      result.push({
        tag: el.tagName,
        class: el.getAttribute('class')?.slice(0, 100),
        text: text.slice(0, 300),
        childCount: el.children.length,
      });
    }
  });
  return result.slice(0, 15);
});

console.log('\n刷新后页面容器:');
messageAreaAfterRefresh.forEach((el, i) => {
  console.log(`  [${i}] <${el.tag}> class="${el.class}" children=${el.childCount}`);
  console.log(`       text: "${el.text}"`);
});

// 获取刷新后所有文本
const allTextAfterRefresh = await page.evaluate(() => document.body.innerText);
console.log('\n刷新后页面所有文本（前 2000 字符）:');
console.log(allTextAfterRefresh.slice(0, 2000));

await browser.close();
