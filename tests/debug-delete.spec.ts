import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('debug UI delete session', async ({ page }) => {
  test.setTimeout(60000);

  const networkLogs: string[] = [];
  page.on('response', async response => {
    if (response.url().includes('/agent/sessions')) {
      networkLogs.push(`${response.request().method()} ${response.url()} -> ${response.status()}`);
    }
  });

  await login(page);
  await page.click('.nav-item[data-page="chat"]');
  await page.waitForSelector('#page-chat', { timeout: 10000 });
  await page.waitForTimeout(2000);

  // Count sessions
  const count = await page.locator('.chat-session-item').count();
  console.log('Sessions before:', count);

  if (count > 0) {
    // Get the session ID from the first item
    const firstSessionId = await page.locator('.chat-session-item').first().getAttribute('data-sid');
    console.log('First session ID:', firstSessionId);

    // Try clicking the delete button
    const deleteBtn = page.locator('.session-del-btn').first();
    const isVisible = await deleteBtn.isVisible();
    console.log('Delete button visible:', isVisible);

    if (isVisible) {
      // Accept confirm dialog
      page.on('dialog', async dialog => {
        console.log('Dialog:', dialog.message());
        await dialog.accept();
      });

      await deleteBtn.click();
      console.log('Clicked delete button');
      await page.waitForTimeout(3000);

      const newCount = await page.locator('.chat-session-item').count();
      console.log('Sessions after delete:', newCount);
    }
  }

  console.log('\nNetwork logs:');
  networkLogs.forEach(log => console.log(' ', log));
});
