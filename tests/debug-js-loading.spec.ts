import { test, expect } from '@playwright/test';

test('debug: check JavaScript loading and errors', async ({ page }) => {
  const consoleMessages: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  
  // 监听所有控制台消息
  page.on('console', msg => {
    const text = msg.text();
    console.log(`[Console ${msg.type()}] ${text}`);
    if (msg.type() === 'error') {
      consoleErrors.push(text);
    } else {
      consoleMessages.push(text);
    }
  });

  // 监听页面错误（未捕获的异常）
  page.on('pageerror', error => {
    console.log(`[Page Error] ${error.message}`);
    pageErrors.push(error.message);
  });

  // 监听网络请求失败
  page.on('requestfailed', request => {
    console.log(`[Request Failed] ${request.url()} - ${request.failure()?.errorText}`);
  });

  // 登录
  await page.goto('http://localhost:8099/login.html');
  await page.waitForSelector('#username');
  await page.fill('#username', 'admin');
  await page.fill('#password', 'test123');
  await page.click('button:has-text("登 录")');
  await page.waitForTimeout(3000);

  console.log('\n=== After Login ===');
  console.log(`Current URL: ${page.url()}`);

  // 检查 JavaScript 函数是否存在
  console.log('\n=== Checking JavaScript Functions ===');
  
  const checkFunctions = async (funcs: string[]) => {
    for (const func of funcs) {
      const exists = await page.evaluate((f) => {
        return typeof (window as any)[f] === 'function';
      }, func);
      console.log(`${func}: ${exists ? '✓ exists' : '✗ not found'}`);
    }
  };

  await checkFunctions([
    'showPage',
    'loadDashboard',
    'loadResources',
    'loadAccounts',
    'loadTeam',
    'loadTerraform',
    'apiFetch'
  ]);

  // 检查全局变量
  console.log('\n=== Checking Global Variables ===');
  const checkVars = async (vars: string[]) => {
    for (const v of vars) {
      const exists = await page.evaluate((varName) => {
        return (window as any)[varName] !== undefined;
      }, v);
      console.log(`${v}: ${exists ? '✓ exists' : '✗ not found'}`);
    }
  };

  await checkVars([
    'API',
    'pageTitles',
    'LOCALE'
  ]);

  // 检查 DOM 元素
  console.log('\n=== Checking DOM Elements ===');
  const navItems = await page.locator('.nav-item').count();
  console.log(`Nav items count: ${navItems}`);
  
  const pages = await page.locator('.page').count();
  console.log(`Pages count: ${pages}`);

  // 检查事件监听器
  console.log('\n=== Checking Event Listeners ===');
  const hasClickListener = await page.evaluate(() => {
    const navItem = document.querySelector('.nav-item[data-page="chat"]');
    if (!navItem) return 'nav item not found';
    
    // 尝试获取事件监听器（这在某些浏览器中可能不可用）
    const events = (window as any).getEventListeners?.(navItem);
    return events ? JSON.stringify(Object.keys(events)) : 'cannot check (getEventListeners not available)';
  });
  console.log(`Chat nav item click listeners: ${hasClickListener}`);

  // 手动触发点击事件
  console.log('\n=== Manually Triggering Click ===');
  const chatNavItem = page.locator('.nav-item[data-page="chat"]');
  
  // 使用 dispatchEvent
  await chatNavItem.dispatchEvent('click');
  await page.waitForTimeout(1000);
  
  const chatPage = page.locator('#page-chat');
  console.log(`After dispatchEvent - Chat visible: ${await chatPage.isVisible()}`);
  console.log(`After dispatchEvent - Chat has active: ${await chatPage.evaluate(el => el.classList.contains('active'))}`);

  console.log('\n=== Summary ===');
  console.log(`Console errors: ${consoleErrors.length}`);
  console.log(`Page errors: ${pageErrors.length}`);
  
  if (consoleErrors.length > 0) {
    console.log('\nConsole Errors:');
    consoleErrors.forEach(err => console.log(`  - ${err}`));
  }
  
  if (pageErrors.length > 0) {
    console.log('\nPage Errors:');
    pageErrors.forEach(err => console.log(`  - ${err}`));
  }
});
