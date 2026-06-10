import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('debug: page navigation and JSON parsing', async ({ page }) => {
  const networkErrors: Array<{url: string, status: number, body: string}> = [];
  const jsonParseErrors: string[] = [];
  
  // 监听所有网络响应
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/')) {
      try {
        const contentType = response.headers()['content-type'] || '';
        const body = await response.text();
        
        // 检查是否是 JSON
        if (contentType.includes('application/json')) {
          try {
            JSON.parse(body);
          } catch (e) {
            jsonParseErrors.push(`JSON parse error for ${url}: ${e.message}\nBody: ${body.substring(0, 200)}`);
          }
        } else if (!response.ok()) {
          networkErrors.push({
            url,
            status: response.status(),
            body: body.substring(0, 200)
          });
        }
      } catch (e) {
        // 忽略读取错误
      }
    }
  });

  // 监听控制台错误
  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  await login(page);
  await page.waitForTimeout(2000);

  // 测试每个页面的导航
  const pages = ['dashboard', 'chat', 'accounts', 'team', 'terraform', 'profile'];
  
  for (const pageName of pages) {
    console.log(`\n=== Testing page: ${pageName} ===`);
    
    // 点击导航项
    const navItem = page.locator(`.nav-item[data-page="${pageName}"]`);
    if (await navItem.count() > 0) {
      await navItem.click();
      await page.waitForTimeout(1000);
      
      // 检查页面是否可见
      const pageElement = page.locator(`#page-${pageName}`);
      const isVisible = await pageElement.isVisible();
      const hasActiveClass = await pageElement.evaluate(el => el.classList.contains('active'));
      
      console.log(`  Visible: ${isVisible}, Has active class: ${hasActiveClass}`);
      
      if (!isVisible) {
        console.log(`  ERROR: Page ${pageName} is not visible after navigation`);
      }
    } else {
      console.log(`  WARNING: No nav item found for ${pageName}`);
    }
  }

  // 输出所有错误
  console.log('\n=== Network Errors ===');
  if (networkErrors.length === 0) {
    console.log('None');
  } else {
    networkErrors.forEach(err => {
      console.log(`${err.status} ${err.url}`);
      console.log(`Body: ${err.body}`);
    });
  }

  console.log('\n=== JSON Parse Errors ===');
  if (jsonParseErrors.length === 0) {
    console.log('None');
  } else {
    jsonParseErrors.forEach(err => console.log(err));
  }

  console.log('\n=== Console Errors ===');
  if (consoleErrors.length === 0) {
    console.log('None');
  } else {
    consoleErrors.forEach(err => console.log(err));
  }

  // 验证没有 JSON 解析错误
  expect(jsonParseErrors).toHaveLength(0);
});
