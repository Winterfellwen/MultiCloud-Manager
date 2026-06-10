import { test, expect } from '@playwright/test';

test('debug: check all pages for JSON parsing errors', async ({ page }) => {
  const nonJsonResponses: Array<{url: string, status: number, contentType: string, body: string}> = [];
  const consoleErrors: string[] = [];
  
  // 监听所有网络响应
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/')) {
      const contentType = response.headers()['content-type'] || '';
      
      if (!contentType.includes('application/json')) {
        try {
          const body = await response.text();
          nonJsonResponses.push({
            url,
            status: response.status(),
            contentType,
            body: body.substring(0, 300)
          });
        } catch (e) {
          nonJsonResponses.push({
            url,
            status: response.status(),
            contentType,
            body: `[Error reading body: ${e}]`
          });
        }
      }
    }
  });

  // 监听控制台错误
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // 登录
  await page.goto('http://localhost:8099/login.html');
  await page.waitForSelector('#username');
  await page.fill('#username', 'admin');
  await page.fill('#password', 'test123');
  await page.click('button:has-text("登 录")');
  await page.waitForTimeout(2000);

  // 测试所有页面
  const pages = ['dashboard', 'chat', 'accounts', 'resources', 'team', 'terraform', 'profile'];
  
  for (const pageName of pages) {
    console.log(`\n=== Navigating to ${pageName} ===`);
    const navItem = page.locator(`.nav-item[data-page="${pageName}"]`);
    
    if (await navItem.count() > 0) {
      await navItem.click();
      await page.waitForTimeout(1500);
      
      const pageElement = page.locator(`#page-${pageName}`);
      const isVisible = await pageElement.isVisible();
      console.log(`  Page visible: ${isVisible}`);
    } else {
      console.log(`  Nav item not found`);
    }
  }

  // 输出结果
  console.log(`\n=== Non-JSON Responses (${nonJsonResponses.length}) ===`);
  if (nonJsonResponses.length === 0) {
    console.log('None - All API responses are valid JSON');
  } else {
    nonJsonResponses.forEach(resp => {
      console.log(`\n${resp.status} ${resp.url}`);
      console.log(`Content-Type: ${resp.contentType}`);
      console.log(`Body: ${resp.body}`);
    });
  }

  console.log(`\n=== Console Errors (${consoleErrors.length}) ===`);
  if (consoleErrors.length === 0) {
    console.log('None');
  } else {
    consoleErrors.forEach(err => console.log(err));
  }

  // 验证没有非 JSON 响应
  expect(nonJsonResponses).toHaveLength(0);
  expect(consoleErrors).toHaveLength(0);
});
