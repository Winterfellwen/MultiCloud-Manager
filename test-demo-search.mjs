import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

await page.goto('http://localhost', { waitUntil: 'domcontentloaded' });
await page.evaluate(() => localStorage.setItem('lang', 'zh'));
await page.reload({ waitUntil: 'networkidle' });

// Go to login page
await page.goto('http://localhost/login', { waitUntil: 'networkidle' });

// Click demo button
const demoButton = await page.$('button:has-text("Demo")');
if (demoButton) {
  await demoButton.click();
  await page.waitForURL('**/dashboard', { timeout: 10000 });
  console.log('1. Logged in via demo mode');
} else {
  console.log('Demo button not found');
  await browser.close();
  process.exit(1);
}

await page.waitForTimeout(2000);

// Go to topology page
await page.goto('http://localhost/topology', { waitUntil: 'networkidle', timeout: 15000 });
await page.waitForTimeout(3000);

// Take initial screenshot
await page.screenshot({ path: '/Users/xinruiwen/AI-Wen/MultiCloud-Manager/topo-demo-initial.png' });
console.log('2. Topology page loaded');

// Search for resources
const searchInput = await page.$('input[placeholder*="搜索"]');
if (searchInput) {
  // Try different search terms
  for (const query of ['AWS', 'demo', 'vpc', 'instance', 'disk', 'database']) {
    await searchInput.fill(query);
    await page.waitForTimeout(1000);
    
    const results = await page.$$('.absolute.top-full button');
    console.log(`Search "${query}": ${results.length} results`);
    
    if (results.length > 0) {
      await page.screenshot({ path: `/Users/xinruiwen/AI-Wen/MultiCloud-Manager/topo-demo-search-${query}.png` });
      
      // Click first result
      await results[0].click();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `/Users/xinruiwen/AI-Wen/MultiCloud-Manager/topo-demo-jump-${query}.png` });
      console.log(`Clicked result for "${query}" - screenshot saved`);
      break;
    }
  }
} else {
  console.log('Search input not found');
}

await browser.close();
console.log('Done');
