import { test } from '@playwright/test';

test('screenshot demo', async ({ page }) => {
  await page.goto('file:///E:/AI/multicloud/demo-tool-calls-ui.html');
  await page.waitForTimeout(500);
  
  // Screenshot 1: default state (sidebar open, tool calls collapsed)
  await page.screenshot({ path: 'E:/AI/multicloud/demo-screenshot-1.png', fullPage: false });
  console.log('Screenshot 1 saved');

  // Click to expand first inline tool calls
  await page.locator('.tool-calls-header').first().click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'E:/AI/multicloud/demo-screenshot-2-inline-expanded.png', fullPage: false });
  console.log('Screenshot 2 saved');

  // Click to expand a sidebar card
  await page.locator('.sidebar-card-header').nth(2).click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: 'E:/AI/multicloud/demo-screenshot-3-sidebar-card.png', fullPage: false });
  console.log('Screenshot 3 saved');
});
