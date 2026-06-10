import { test, expect } from '@playwright/test';

test('debug: check navigation and page visibility', async ({ page }) => {
  const consoleMessages: string[] = [];
  const consoleErrors: string[] = [];
  
  // 监听所有控制台消息
  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error') {
      consoleErrors.push(text);
    } else {
      consoleMessages.push(text);
    }
  });

  // 登录
  await page.goto('http://localhost:8099/login.html');
  await page.waitForSelector('#username');
  await page.fill('#username', 'admin');
  await page.fill('#password', 'test123');
  await page.click('button:has-text("登 录")');
  await page.waitForTimeout(2000);

  console.log('=== After Login ===');
  console.log(`Current URL: ${page.url()}`);
  
  // 检查所有页面元素是否存在
  const pages = ['dashboard', 'chat', 'accounts', 'resources', 'team', 'terraform', 'profile'];
  
  for (const pageName of pages) {
    const pageElement = page.locator(`#page-${pageName}`);
    const exists = await pageElement.count() > 0;
    const isVisible = exists ? await pageElement.isVisible() : false;
    const hasActiveClass = exists ? await pageElement.evaluate(el => el.classList.contains('active')) : false;
    
    console.log(`\n${pageName}:`);
    console.log(`  Exists: ${exists}`);
    console.log(`  Visible: ${isVisible}`);
    console.log(`  Has 'active' class: ${hasActiveClass}`);
  }

  // 测试导航
  console.log('\n=== Testing Navigation ===');
  
  for (const pageName of pages) {
    console.log(`\n--- Clicking ${pageName} ---`);
    const navItem = page.locator(`.nav-item[data-page="${pageName}"]`);
    
    if (await navItem.count() > 0) {
      await navItem.click();
      await page.waitForTimeout(500);
      
      const pageElement = page.locator(`#page-${pageName}`);
      const isVisible = await pageElement.isVisible();
      const hasActiveClass = await pageElement.evaluate(el => el.classList.contains('active'));
      
      console.log(`  Page visible: ${isVisible}`);
      console.log(`  Has 'active' class: ${hasActiveClass}`);
      
      // 检查其他页面是否隐藏
      for (const otherPage of pages) {
        if (otherPage !== pageName) {
          const otherElement = page.locator(`#page-${otherPage}`);
          const otherVisible = await otherElement.isVisible();
          if (otherVisible) {
            console.log(`  WARNING: ${otherPage} is also visible!`);
          }
        }
      }
    } else {
      console.log(`  Nav item not found`);
    }
  }

  console.log('\n=== Console Errors ===');
  if (consoleErrors.length === 0) {
    console.log('None');
  } else {
    consoleErrors.forEach(err => console.log(err));
  }

  console.log('\n=== Console Messages (first 20) ===');
  consoleMessages.slice(0, 20).forEach(msg => console.log(msg));
});
