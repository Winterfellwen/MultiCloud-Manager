import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'https://multicloud-manager-8ylh.onrender.com';
const USER = process.env.TEST_USER || 'admin';
const PASS = process.env.TEST_PASS || 'Test.1234';

test('debug: check session messages in DB', async ({ page }) => {
  test.setTimeout(60000);

  // 1. Login
  await page.goto(BASE + '/login.html');
  await page.waitForSelector('#username', { timeout: 15000 });
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await page.click('button:has-text("登 录")');
  await page.waitForFunction(() => {
    const el = document.getElementById('page-dashboard');
    return el && el.style.display !== 'none';
  }, { timeout: 25000 });
  await page.waitForTimeout(500);

  // 2. Use fetch to get session data from API
  const sessionData = await page.evaluate(async () => {
    // Get auth token from localStorage
    const token = localStorage.getItem('token');
    if (!token) return { error: 'no token' };
    
    // Get session list
    const res = await fetch('/api/agent/sessions', {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const data = await res.json();
    const sessions = data.sessions || [];
    
    // Get first session's messages
    if (sessions.length > 0) {
      const firstSid = sessions[0].session_id;
      const detailRes = await fetch('/api/agent/sessions/' + firstSid, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const detail = await detailRes.json();
      return {
        sessionId: firstSid,
        title: sessions[0].title,
        messageCount: (detail.messages || []).length,
        roles: (detail.messages || []).map(m => m.role),
        messages: (detail.messages || []).map(m => ({
          role: m.role,
          contentPreview: (m.content || '').substring(0, 200)
        }))
      };
    }
    return { error: 'no sessions' };
  });

  console.log('\n=== SESSION DEBUG ===');
  console.log(JSON.stringify(sessionData, null, 2));
});
