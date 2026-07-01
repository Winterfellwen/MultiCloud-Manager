import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const logs = [];
page.on('console', msg => { if (msg.text().includes('search-debug')) logs.push(msg.text()); });

await page.goto('http://localhost', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.setItem('lang', 'zh'));
await page.reload({ waitUntil: 'networkidle' });
await page.goto('http://localhost/login', { waitUntil: 'networkidle' });
await page.click('button:has-text("Demo")');
await page.waitForURL('**/dashboard', { timeout: 10000 });
await page.waitForTimeout(2000);
await page.goto('http://localhost/topology', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(3000);

const searchInput = await page.$('input[placeholder*="搜索"]');
await searchInput.fill('AWS-VPC-1');
await page.waitForTimeout(1500);
await page.evaluate(() => {
  const dropdown = document.querySelector('.absolute.top-full');
  const btn = dropdown?.querySelector('button');
  if (btn) btn.click();
});
await page.waitForTimeout(3000);

console.log('Debug logs:', logs);
await page.screenshot({ path: '/Users/xinruiwen/AI-Wen/MultiCloud-Manager/final-debug.png' });
await browser.close();
