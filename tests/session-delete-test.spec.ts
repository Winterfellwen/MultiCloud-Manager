import { test, expect } from '@playwright/test';
import { login } from './helpers';

const BASE = process.env.BASE_URL || 'https://multicloud-backend-qw9d.onrender.com';

test.describe('Session Delete Fix', () => {
  test('delete session via API and UI', async ({ page }) => {
    test.setTimeout(60000);

    await login(page);

    // 1. Create a session
    const createResult = await page.evaluate(async () => {
      const res = await fetch('/api/agent/sessions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + localStorage.getItem('token'),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title: 'Test Delete Session' })
      });
      return res.json();
    });
    console.log('Created session:', createResult.session_id);
    const sid = createResult.session_id;

    // 2. Verify it exists
    const listBefore = await page.evaluate(async () => {
      const res = await fetch('/api/agent/sessions', {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
      });
      return res.json();
    });
    console.log('Sessions before delete:', listBefore.sessions?.length);

    // 3. Delete it
    const deleteResult = await page.evaluate(async (sessionId) => {
      const res = await fetch('/api/agent/sessions/' + sessionId, {
        method: 'DELETE',
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
      });
      return { status: res.status, body: await res.json() };
    }, sid);
    console.log('Delete result:', JSON.stringify(deleteResult));

    // 4. Verify it's gone
    const listAfter = await page.evaluate(async () => {
      const res = await fetch('/api/agent/sessions', {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
      });
      return res.json();
    });
    console.log('Sessions after delete:', listAfter.sessions?.length);

    // Check if deleted session is still in the list
    const stillExists = listAfter.sessions?.some((s: any) => s.session_id === sid);
    console.log('Deleted session still exists:', stillExists);

    // Now test via UI
    await page.click('.nav-item[data-page="chat"]');
    await page.waitForSelector('#page-chat', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Count session items in sidebar
    const sessionCount = await page.locator('.chat-session-item').count();
    console.log('Session items in UI:', sessionCount);

    // Try clicking delete button on first session
    if (sessionCount > 0) {
      const deleteBtn = page.locator('.session-del-btn').first();
      if (await deleteBtn.isVisible()) {
        // Handle confirm dialog
        page.on('dialog', async dialog => {
          console.log('Dialog message:', dialog.message());
          await dialog.accept();
        });
        await deleteBtn.click();
        await page.waitForTimeout(2000);

        const newCount = await page.locator('.chat-session-item').count();
        console.log('Session items after UI delete:', newCount);
      }
    }
  });
});
