import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Chat History API', () => {
  test('create session, send message via stream, check messages saved', async ({ page }) => {
    test.setTimeout(120000);

    await login(page);

    // 1. Create session via API
    const createResult = await page.evaluate(async () => {
      const res = await fetch('/api/agent/sessions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + localStorage.getItem('token'),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ title: 'Test Session' })
      });
      return res.json();
    });
    console.log('Created session:', JSON.stringify(createResult));
    const sessionId = createResult.session_id;
    expect(sessionId).toBeTruthy();

    // 2. Send message via stream API
    const streamResult = await page.evaluate(async (sid) => {
      const res = await fetch('/api/agent/chat/stream', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + localStorage.getItem('token'),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: '你好',
          session_id: sid,
          mode: 'plan'
        })
      });
      const text = await res.text();
      return { status: res.status, body: text.substring(0, 500) };
    }, sessionId);
    console.log('Stream result:', JSON.stringify(streamResult));

    // 3. Wait for DB save
    await page.waitForTimeout(3000);

    // 4. Check session messages
    const detail = await page.evaluate(async (sid) => {
      const res = await fetch('/api/agent/sessions/' + sid, {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
      });
      return res.json();
    }, sessionId);
    console.log('Session detail:', JSON.stringify(detail).substring(0, 500));
    console.log('Messages count:', detail.messages?.length || 0);
    if (detail.messages) {
      detail.messages.forEach((m: any, i: number) => {
        console.log(`  msg[${i}] role=${m.role}: ${(m.content || '').substring(0, 100)}`);
      });
    }

    expect(detail.messages?.length).toBeGreaterThan(0);
  });
});
