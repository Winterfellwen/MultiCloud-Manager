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

// Screenshot before search
await page.screenshot({ path: '/Users/xinruiwen/AI-Wen/MultiCloud-Manager/before.png' });
console.log('Before: root level');

// Type in search
const searchInput = await page.$('input[placeholder*="搜索"]');
await searchInput.fill('AWS-VPC-1');
await page.waitForTimeout(1500);

// Screenshot with dropdown
await page.screenshot({ path: '/Users/xinruiwen/AI-Wen/MultiCloud-Manager/dropdown.png' });

// Click first result using evaluate to ensure click happens
const clicked = await page.evaluate(() => {
  const dropdown = document.querySelector('.absolute.top-full');
  if (!dropdown) return 'no dropdown';
  const btn = dropdown.querySelector('button');
  if (!btn) return 'no button';
  btn.click();
  return 'clicked';
});
console.log('Click result:', clicked);
await page.waitForTimeout(2000);

// Screenshot after click
await page.screenshot({ path: '/Users/xinruiwen/AI-Wen/MultiCloud-Manager/after.png' });
console.log('After: check screenshot');

// Check breadcrumb text
const breadcrumb = await page.textContent('.flex.items-center.gap-1 px-4');
console.log('Breadcrumb:', breadcrumb);

await browser.close();
