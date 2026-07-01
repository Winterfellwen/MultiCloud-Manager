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

// Manually click on a provider node to drill down
const providerNode = await page.$('text=AWS');
if (providerNode) {
  console.log('Found AWS node, clicking...');
  await providerNode.click();
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/Users/xinruiwen/AI-Wen/MultiCloud-Manager/after-drill.png' });
  
  // Check breadcrumb
  const breadcrumbText = await page.evaluate(() => {
    const el = document.querySelector('[class*="px-4"][class*="py-2"][class*="border-b"]');
    return el ? el.textContent : 'not found';
  });
  console.log('Breadcrumb:', breadcrumbText);
} else {
  console.log('AWS node not found');
}

await browser.close();
