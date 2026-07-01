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

// Find all visible text elements
const elements = await page.evaluate(() => {
  const allElements = document.querySelectorAll('div, span, p');
  const results = [];
  for (const el of allElements) {
    const text = el.textContent?.trim();
    if (text && text.includes('AWS') && el.getBoundingClientRect().width > 0) {
      const rect = el.getBoundingClientRect();
      results.push({
        text: text.substring(0, 50),
        x: rect.x + rect.width / 2,
        y: rect.y + rect.height / 2,
        width: rect.width,
        height: rect.height
      });
    }
  }
  return results.slice(0, 5);
});

console.log('AWS elements:', JSON.stringify(elements, null, 2));

// Click on the first visible AWS element
if (elements.length > 0) {
  const el = elements[0];
  console.log(`Clicking at (${el.x}, ${el.y})`);
  await page.mouse.click(el.x, el.y);
  await page.waitForTimeout(2000);
  await page.screenshot({ path: '/Users/xinruiwen/AI-Wen/MultiCloud-Manager/after-click.png' });
  console.log('Clicked and screenshot saved');
}

await browser.close();
