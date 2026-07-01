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
const searchInput = await page.$('input[placeholder*="搜索"]');
await searchInput.click();
await searchInput.fill('AWS-VPC-1');
await page.waitForTimeout(1500);

// Verify dropdown appeared
const dropdownVisible = await page.isVisible('.absolute.top-full');
console.log('Dropdown visible:', dropdownVisible);

if (dropdownVisible) {
  // Use Playwright's click with force option
  const firstResult = await page.$('.absolute.top-full button:first-child');
  if (firstResult) {
    const box = await firstResult.boundingBox();
    console.log('Button box:', box);
    await firstResult.click({ force: true });
    await page.waitForTimeout(3000);
    
    // Check URL for mode=graph
    const url = page.url();
    console.log('URL after click:', url);
    console.log('Has mode=graph:', url.includes('mode=graph'));
  }
}

await page.screenshot({ path: '/Users/xinruiwen/AI-Wen/MultiCloud-Manager/click-fix.png' });
await browser.close();
