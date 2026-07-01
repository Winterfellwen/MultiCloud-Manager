import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto('http://localhost', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.setItem('lang', 'zh'));
await page.reload({ waitUntil: 'networkidle' });
await page.goto('http://localhost/login', { waitUntil: 'networkidle' });
await page.click('button:has-text("Demo")');
await page.waitForURL('**/dashboard', { timeout: 10000 });
await page.waitForTimeout(2000);
await page.goto('http://localhost/topology', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(3000);

// Search
await page.fill('input[placeholder*="搜索"]', 'AWS-VPC-1');
await page.waitForTimeout(1500);

// Click using locator
await page.locator('.absolute.top-full button').first().click({ timeout: 5000 });
await page.waitForTimeout(2000);

const url = page.url();
console.log('URL:', url);
console.log('mode=graph:', url.includes('mode=graph'));

await page.screenshot({ path: '/Users/xinruiwen/AI-Wen/MultiCloud-Manager/simple-click.png' });
await browser.close();
