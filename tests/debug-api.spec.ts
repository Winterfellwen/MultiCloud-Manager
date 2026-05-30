import { test } from '@playwright/test';
import { login } from './helpers';

test('debug: capture all API responses', async ({ page }) => {
  const apiCalls: Array<{url: string, status: number, body: string}> = [];
  
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/')) {
      try {
        const body = await response.text();
        apiCalls.push({
          url: url,
          status: response.status(),
          body: body.substring(0, 200)
        });
      } catch (e) {
        apiCalls.push({
          url: url,
          status: response.status(),
          body: `Error reading: ${e}`
        });
      }
    }
  });

  await login(page);
  await page.waitForTimeout(2000);

  // 访问所有页面
  const pages = ['dashboard', 'chat', 'accounts', 'resources', 'team', 'terraform', 'profile'];
  for (const p of pages) {
    console.log(`\n=== Navigating to ${p} ===`);
    await page.click(`.nav-item[data-page="${p}"]`);
    await page.waitForTimeout(2000);
  }

  console.log('\n=== All API Calls ===');
  apiCalls.forEach((call, i) => {
    console.log(`\n[${i+1}] ${call.status} ${call.url}`);
    console.log(`Body: ${call.body}`);
  });

  // 找出非200的响应
  const errors = apiCalls.filter(c => c.status !== 200);
  if (errors.length > 0) {
    console.log('\n=== ERROR RESPONSES ===');
    errors.forEach(e => {
      console.log(`${e.status} ${e.url}`);
      console.log(`Body: ${e.body}`);
    });
  }
});