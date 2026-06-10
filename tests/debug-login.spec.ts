import { test, expect } from '@playwright/test';

test('debug: check what happens after login', async ({ page }) => {
  // 监听所有网络请求
  const requests: Array<{url: string, status: number, contentType: string}> = [];
  
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('/api/')) {
      const contentType = response.headers()['content-type'] || '';
      requests.push({
        url,
        status: response.status(),
        contentType
      });
      
      // 如果不是 JSON，打印响应内容
      if (!contentType.includes('application/json')) {
        const body = await response.text();
        console.log(`\n=== Non-JSON Response ===`);
        console.log(`URL: ${url}`);
        console.log(`Status: ${response.status()}`);
        console.log(`Content-Type: ${contentType}`);
        console.log(`Body: ${body.substring(0, 200)}`);
      }
    }
  });

  // 监听控制台错误
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log(`[Console Error] ${msg.text()}`);
    }
  });

  // 访问登录页
  await page.goto('http://localhost:8099/login.html');
  await page.waitForSelector('#username');
  
  // 登录
  await page.fill('#username', 'admin');
  await page.fill('#password', 'test123');
  await page.click('button:has-text("登 录")');
  
  // 等待导航
  await page.waitForTimeout(3000);
  
  // 检查当前 URL
  console.log(`\nCurrent URL: ${page.url()}`);
  
  // 检查页面内容
  const title = await page.title();
  console.log(`Page title: ${title}`);
  
  // 打印所有 API 请求
  console.log(`\n=== API Requests (${requests.length}) ===`);
  requests.forEach(req => {
    console.log(`${req.status} ${req.url} [${req.contentType}]`);
  });
  
  // 验证登录成功
  expect(page.url()).toContain('localhost:8099');
  expect(title).toBe('MultiCloud Manager');
});
