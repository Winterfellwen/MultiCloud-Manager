import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on('console', m => logs.push(m.text()));

await page.goto('http://localhost', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.setItem('lang', 'zh'));
await page.reload({ waitUntil: 'networkidle' });
await page.goto('http://localhost/login', { waitUntil: 'networkidle' });
await page.click('button:has-text("Demo")');
await page.waitForURL('**/dashboard', { timeout: 10000 });
await page.waitForTimeout(2000);
await page.goto('http://localhost/topology', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(3000);

// Fill search
await page.fill('input[placeholder*="搜索"]', 'AWS-VPC-1');
await page.waitForTimeout(1500);

// Use dispatchEvent to trigger React synthetic event
await page.evaluate(() => {
  const btn = document.querySelector('.absolute.top-full button');
  if (btn) {
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    btn.dispatchEvent(event);
  }
});
await page.waitForTimeout(2000);

console.log('Logs:', logs.filter(l => l.includes('SEARCH')));
console.log('URL:', page.url());

await browser.close();
