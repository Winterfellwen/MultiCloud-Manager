import { test, expect } from '@playwright/test';

test('debug: trace navigation click behavior', async ({ page }) => {
  const consoleMessages: string[] = [];
  const consoleErrors: string[] = [];
  
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

  // 登录
  await page.goto('http://localhost:8099/login.html');
  await page.waitForSelector('#username');
  await page.fill('#username', 'admin');
  await page.fill('#password', 'test123');
  await page.click('button:has-text("登 录")');
  await page.waitForTimeout(2000);

  console.log('\n=== Initial State ===');
  console.log(`Current URL: ${page.url()}`);
  
  // 检查初始状态
  const dashboardPage = page.locator('#page-dashboard');
  const chatPage = page.locator('#page-chat');
  
  console.log(`Dashboard visible: ${await dashboardPage.isVisible()}`);
  console.log(`Dashboard has active class: ${await dashboardPage.evaluate(el => el.classList.contains('active'))}`);
  console.log(`Chat visible: ${await chatPage.isVisible()}`);
  console.log(`Chat has active class: ${await chatPage.evaluate(el => el.classList.contains('active'))}`);

  // 测试点击 chat 导航项
  console.log('\n=== Clicking Chat Nav Item ===');
  const chatNavItem = page.locator('.nav-item[data-page="chat"]');
  
  console.log(`Chat nav item exists: ${await chatNavItem.count() > 0}`);
  console.log(`Chat nav item visible: ${await chatNavItem.isVisible()}`);
  console.log(`Chat nav item text: ${await chatNavItem.textContent()}`);
  
  // 点击前截图
  await page.screenshot({ path: 'test-results/before-click.png' });
  
  // 点击
  await chatNavItem.click();
  await page.waitForTimeout(1000);
  
  // 点击后截图
  await page.screenshot({ path: 'test-results/after-click.png' });
  
  console.log('\n=== After Click ===');
  console.log(`Dashboard visible: ${await dashboardPage.isVisible()}`);
  console.log(`Dashboard has active class: ${await dashboardPage.evaluate(el => el.classList.contains('active'))}`);
  console.log(`Chat visible: ${await chatPage.isVisible()}`);
  console.log(`Chat has active class: ${await chatPage.evaluate(el => el.classList.contains('active'))}`);
  
  // 检查 nav-item 的 active 状态
  const dashboardNavItem = page.locator('.nav-item[data-page="dashboard"]');
  console.log(`\nDashboard nav item has active: ${await dashboardNavItem.evaluate(el => el.classList.contains('active'))}`);
  console.log(`Chat nav item has active: ${await chatNavItem.evaluate(el => el.classList.contains('active'))}`);

  // 测试直接调用 showPage 函数
  console.log('\n=== Testing showPage() Directly ===');
  await page.evaluate(() => {
    console.log('Calling showPage("chat")...');
    (window as any).showPage('chat');
  });
  await page.waitForTimeout(1000);
  
  console.log(`\nAfter showPage('chat'):`);
  console.log(`Dashboard visible: ${await dashboardPage.isVisible()}`);
  console.log(`Dashboard has active class: ${await dashboardPage.evaluate(el => el.classList.contains('active'))}`);
  console.log(`Chat visible: ${await chatPage.isVisible()}`);
  console.log(`Chat has active class: ${await chatPage.evaluate(el => el.classList.contains('active'))}`);

  console.log('\n=== Console Errors ===');
  if (consoleErrors.length === 0) {
    console.log('None');
  } else {
    consoleErrors.forEach(err => console.log(err));
  }
});
