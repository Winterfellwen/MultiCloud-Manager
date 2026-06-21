// 调试脚本：获取登录页面结构
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:3006/login', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// 获取所有 input 和 button
const inputs = await page.locator('input').all();
console.log(`Inputs: ${inputs.length}`);
for (let i = 0; i < inputs.length; i++) {
  const attrs = await inputs[i].evaluate(el => ({
    type: el.type,
    name: el.name,
    placeholder: el.placeholder,
    id: el.id,
    className: el.className?.slice(0, 50),
  }));
  console.log(`  [${i}]`, JSON.stringify(attrs));
}

const buttons = await page.locator('button').all();
console.log(`\nButtons: ${buttons.length}`);
for (let i = 0; i < buttons.length; i++) {
  const text = await buttons[i].textContent();
  console.log(`  [${i}] "${text?.trim()}"`);
}

// 获取页面标题和 URL
console.log(`\nTitle: ${await page.title()}`);
console.log(`URL: ${page.url()}`);

await browser.close();
