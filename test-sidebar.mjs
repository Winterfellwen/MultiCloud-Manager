import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto('http://localhost', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.setItem('lang', 'zh'));
await page.reload({ waitUntil: 'networkidle' });
await page.goto('http://localhost/login', { waitUntil: 'networkidle' });
await page.fill('input[id="username"]', 'admin');
await page.fill('input[id="password"]', 'Admin123!');
await page.click('button[type="submit"]');
await page.waitForURL('**/dashboard', { timeout: 10000 });
await page.waitForTimeout(2000);

// Go to topology page
await page.goto('http://localhost/topology', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(2000);

// Take screenshot
await page.screenshot({ path: '/Users/xinruiwen/AI-Wen/MultiCloud-Manager/sidebar-test.png' });
console.log('Screenshot saved');

await browser.close();
