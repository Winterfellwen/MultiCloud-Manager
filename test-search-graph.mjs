import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto('http://localhost', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.setItem('lang', 'zh'));
await page.reload({ waitUntil: 'networkidle' });

// Demo login
await page.goto('http://localhost/login', { waitUntil: 'networkidle' });
await page.click('button:has-text("Demo")');
await page.waitForURL('**/dashboard', { timeout: 10000 });
await page.waitForTimeout(2000);

// Go to topology
await page.goto('http://localhost/topology', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(3000);

// Search
const searchInput = await page.$('input[placeholder*="搜索"]');
await searchInput.fill('AWS-VPC-1');
await page.waitForTimeout(1500);

// Click first result
const clicked = await page.evaluate(() => {
  const dropdown = document.querySelector('.absolute.top-full');
  if (!dropdown) return 'no dropdown';
  const btn = dropdown.querySelector('button');
  if (!btn) return 'no button';
  btn.click();
  return 'clicked';
});
console.log('Click result:', clicked);
await page.waitForTimeout(3000);

// Take screenshot
await page.screenshot({ path: '/Users/xinruiwen/AI-Wen/MultiCloud-Manager/search-graph.png' });
console.log('Screenshot saved');

// Check if we're in graph mode
const graphButton = await page.$('button:has-text("关系图")');
const isGraphActive = await graphButton?.evaluate(el => el.classList.contains('bg-primary'));
console.log('Graph mode active:', isGraphActive);

await browser.close();
