import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

// Capture console logs
const logs = [];
page.on('console', msg => logs.push(msg.text()));

await page.goto('http://localhost', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.setItem('lang', 'zh'));
await page.reload({ waitUntil: 'networkidle' });

// Login via demo
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
await page.waitForTimeout(1000);

// Click first result
const results = await page.$$('.absolute.top-full button');
if (results.length > 0) {
  await results[0].click();
  await page.waitForTimeout(2000);
}

// Print debug logs
console.log('=== Console Logs ===');
logs.filter(l => l.includes('drillPath') || l.includes('Tree') || l.includes('Search jump')).forEach(l => console.log(l));

// Take screenshot
await page.screenshot({ path: '/Users/xinruiwen/AI-Wen/MultiCloud-Manager/topo-debug.png' });

await browser.close();
