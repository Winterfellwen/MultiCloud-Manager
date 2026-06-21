// 快速诊断：截图对话页面
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto('http://localhost:3006/login', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.locator('#username').fill('testadmin');
await page.locator('#password').fill('testadmin123');
await page.locator('button:has-text("登录")').click();
await page.waitForURL('**/dashboard**', { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(2000);

await page.goto('http://localhost:3006/chat', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
await page.screenshot({ path: 'test-screenshots/quick-chat-page.png', fullPage: true });

// 获取页面所有按钮和链接
const buttons = await page.locator('button').allTextContents();
console.log('Buttons:', buttons);

const links = await page.locator('a').evaluateAll(els => els.map(e => ({ text: e.textContent?.trim(), href: e.href })));
console.log('Links:', JSON.stringify(links, null, 2));

// 检查是否有 textarea
const textareaCount = await page.locator('textarea').count();
console.log(`Textarea count: ${textareaCount}`);

// 获取页面 HTML 片段
const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 2000));
console.log('\nBody text:');
console.log(bodyText);

await browser.close();
