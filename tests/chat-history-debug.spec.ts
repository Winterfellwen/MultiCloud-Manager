import { test, expect } from '@playwright/test';
import { login } from './helpers';

const BASE = process.env.BASE_URL || 'https://multicloud-backend-qw9d.onrender.com';

test.describe('Chat History Debug', () => {
  test('check session creation and message persistence', async ({ page }) => {
    test.setTimeout(120000);

    await login(page);
    await page.click('.nav-item[data-page="chat"]');
    await page.waitForSelector('#page-chat', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // Create new session
    const newSessionBtn = page.locator('button:has-text("新建对话"), button:has-text("New Session")');
    if (await newSessionBtn.isVisible()) {
      await newSessionBtn.click();
      await page.waitForTimeout(2000);
    }

    // Send message
    const chatInput = page.locator('#chatInput');
    await chatInput.fill('你好');
    await page.waitForTimeout(500);
    await page.locator('#chatSendBtn').click();
    console.log('Sent message, waiting...');

    // Wait for response
    await page.waitForFunction(() => {
      const msgs = document.querySelectorAll('#chatMessages .msg.agent');
      const last = msgs[msgs.length - 1];
      if (!last) return false;
      const content = last.querySelector('.msg-content');
      const text = content?.textContent || '';
      return text.length > 10 && !text.includes('新的对话');
    }, { timeout: 60000 });
    console.log('Got response');

    // Wait a bit for DB save
    await page.waitForTimeout(3000);

    // Check sessions list
    const sessions = await page.evaluate(async () => {
      const res = await fetch('/api/agent/sessions', {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
      });
      return res.json();
    });
    console.log('Sessions:', JSON.stringify(sessions).substring(0, 500));

    if (sessions.sessions && sessions.sessions.length > 0) {
      const sid = sessions.sessions[0].session_id;
      console.log('Loading session:', sid);

      // Load session detail
      const detail = await page.evaluate(async (sessionId) => {
        const res = await fetch('/api/agent/sessions/' + sessionId, {
          headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        return res.json();
      }, sid);
      console.log('Session detail:', JSON.stringify(detail).substring(0, 500));
      console.log('Messages count:', detail.messages?.length || 0);
      if (detail.messages) {
        detail.messages.forEach((m: any, i: number) => {
          console.log(`  msg[${i}] role=${m.role}: ${(m.content || '').substring(0, 80)}`);
        });
      }
    }

    // Click on session in sidebar to reload
    const sessionItems = page.locator('.chat-session-item');
    const count = await sessionItems.count();
    console.log('Session items in sidebar:', count);

    if (count > 0) {
      await sessionItems.first().click();
      await page.waitForTimeout(2000);
      const msgs = await page.locator('#chatMessages .msg').count();
      console.log('Messages after clicking session:', msgs);
    }
  });
});
