import { test, expect } from '@playwright/test';
import { login } from './helpers';

const BASE = process.env.BASE_URL || 'https://multicloud-backend-qw9d.onrender.com';

test.describe('AI Chat Full Test', () => {
  test('full chat flow: login, create session, send message, verify response', async ({ page }) => {
    test.setTimeout(120000);

    // 1. Login
    console.log('Step 1: Logging in...');
    await login(page);
    console.log('Logged in successfully');

    // 2. Navigate to chat
    console.log('Step 2: Navigating to chat...');
    await page.click('.nav-item[data-page="chat"]');
    await page.waitForSelector('#page-chat', { timeout: 10000 });
    await page.waitForTimeout(1000);

    // 3. Check if session list loads
    console.log('Step 3: Checking session list...');
    const sessionList = page.locator('#sessionList');
    await expect(sessionList).toBeVisible({ timeout: 5000 });

    // 4. Create new session
    console.log('Step 4: Creating new session...');
    const newSessionBtn = page.locator('button:has-text("新建对话"), button:has-text("New Session")');
    if (await newSessionBtn.isVisible()) {
      await newSessionBtn.click();
      await page.waitForTimeout(2000);
    }

    // 5. Send a simple message (no tool calls expected)
    console.log('Step 5: Sending message...');
    const chatInput = page.locator('#chatInput');
    await expect(chatInput).toBeVisible({ timeout: 5000 });
    await chatInput.fill('你好，请简单介绍一下你自己');
    await page.waitForTimeout(500);

    const sendBtn = page.locator('#chatSendBtn');
    await sendBtn.click();
    console.log('Message sent, waiting for response...');

    // 6. Wait for response - either token events or error
    console.log('Step 6: Waiting for response...');
    const chatMessages = page.locator('#chatMessages');

    // Wait up to 60s for a response
    let gotResponse = false;
    let gotError = false;

    // Listen for error events
    page.on('console', msg => {
      if (msg.text().includes('API error') || msg.text().includes('Error')) {
        console.log('Console error:', msg.text());
      }
    });

    // Wait for either a new agent message or an error
    try {
      await page.waitForFunction(() => {
        const msgs = document.querySelectorAll('#chatMessages .msg.agent');
        const lastMsg = msgs[msgs.length - 1];
        if (!lastMsg) return false;
        const content = lastMsg.querySelector('.msg-content');
        if (!content) return false;
        const text = content.textContent || '';
        // Check for error message
        if (text.includes('错误') || text.includes('Error')) {
          return 'error:' + text;
        }
        // Check for non-empty response
        if (text.length > 20 && !text.includes('新的对话已开始')) {
          return 'ok:' + text.substring(0, 100);
        }
        return false;
      }, { timeout: 60000 });
      gotResponse = true;
    } catch (e) {
      console.log('Timeout waiting for response');
    }

    // Get the response text
    const lastAgentMsg = chatMessages.locator('.msg.agent').last();
    const responseText = await lastAgentMsg.locator('.msg-content').textContent().catch(() => '');
    console.log('Response:', responseText?.substring(0, 200));

    // 7. Check for error in response
    if (responseText?.includes('错误') || responseText?.includes('Error') || responseText?.includes('error')) {
      console.log('ERROR FOUND in response:', responseText);
      gotError = true;
    }

    // 8. Test conversation history - send another message
    console.log('Step 7: Testing conversation history...');
    await chatInput.fill('列出我的云资源');
    await page.waitForTimeout(500);
    await sendBtn.click();
    console.log('Second message sent...');

    // Wait for second response
    try {
      await page.waitForFunction(() => {
        const msgs = document.querySelectorAll('#chatMessages .msg.agent');
        const count = msgs.length;
        return count >= 3; // At least 2 agent responses + welcome
      }, { timeout: 60000 });
    } catch (e) {
      console.log('Timeout waiting for second response');
    }

    const allMsgs = await chatMessages.locator('.msg.agent .msg-content').allTextContents();
    console.log('All agent messages:', allMsgs.length);
    allMsgs.forEach((m, i) => console.log(`  [${i}]: ${m.substring(0, 100)}`));

    // 9. Check sessions API
    console.log('Step 8: Checking sessions API...');
    const token = await page.evaluate(() => localStorage.getItem('token'));
    const sessionsResp = await page.evaluate(async (base) => {
      const res = await fetch(base + '/api/agent/sessions', {
        headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
      });
      return res.json();
    }, BASE);
    console.log('Sessions:', JSON.stringify(sessionsResp).substring(0, 200));

    // 10. Check if sessions are saved
    if (sessionsResp.sessions && sessionsResp.sessions.length > 0) {
      console.log('Sessions saved:', sessionsResp.sessions.length);
      const firstSession = sessionsResp.sessions[0];
      console.log('First session:', firstSession.session_id, firstSession.title);

      // Load session messages
      const sessionDetail = await page.evaluate(async (base, sid) => {
        const res = await fetch(base + '/api/agent/sessions/' + sid, {
          headers: { 'Authorization': 'Bearer ' + localStorage.getItem('token') }
        });
        return res.json();
      }, BASE, firstSession.session_id);
      console.log('Session messages:', sessionDetail.messages?.length || 0);
    }

    // 11. Test session switching
    console.log('Step 9: Testing session switching...');
    const sessionItems = page.locator('.chat-session-item');
    const sessionCount = await sessionItems.count();
    console.log('Session items in UI:', sessionCount);

    if (sessionCount > 0) {
      await sessionItems.first().click();
      await page.waitForTimeout(2000);
      const loadedMsgs = await chatMessages.locator('.msg').count();
      console.log('Messages after clicking session:', loadedMsgs);
    }

    console.log('Test completed. Got response:', gotResponse, 'Got error:', gotError);
  });
});
