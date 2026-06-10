import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('AI Chat Debug', () => {
  test('send message with tool calls and capture errors', async ({ page }) => {
    test.setTimeout(120000);

    const errors: string[] = [];
    const logs: string[] = [];

    // Capture console messages
    page.on('console', msg => {
      const text = msg.text();
      logs.push(text);
      if (text.includes('Error') || text.includes('error') || text.includes('错误')) {
        errors.push(text);
      }
    });

    // Capture network errors
    page.on('response', response => {
      if (response.url().includes('/agent/chat/stream')) {
        console.log('Chat stream response status:', response.status());
      }
    });

    // Login
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

    // Send a message that triggers tool calls
    const chatInput = page.locator('#chatInput');
    await chatInput.fill('查看我的云资源列表');
    await page.waitForTimeout(500);
    await page.locator('#chatSendBtn').click();

    // Monitor the SSE stream manually
    const response = await page.waitForResponse(
      resp => resp.url().includes('/agent/chat/stream'),
      { timeout: 30000 }
    );

    console.log('Response status:', response.status());
    const body = await response.text();
    console.log('Response body (first 2000):', body.substring(0, 2000));

    // Check for error events in the SSE stream
    const errorMatch = body.match(/event: error\ndata: (.+)/);
    if (errorMatch) {
      console.log('ERROR EVENT FOUND:', errorMatch[1]);
    }

    // Check for tool_start events
    const toolStartMatch = body.match(/event: tool_start\ndata: (.+)/);
    if (toolStartMatch) {
      console.log('TOOL START EVENT:', toolStartMatch[1].substring(0, 500));
    }

    // Check for tool_result events
    const toolResultMatches = body.matchAll(/event: tool_result\ndata: (.+)/g);
    for (const match of toolResultMatches) {
      console.log('TOOL RESULT EVENT:', match[1].substring(0, 500));
    }

    // Wait a bit for any remaining events
    await page.waitForTimeout(5000);

    // Get all messages in the chat
    const allMsgs = await page.locator('#chatMessages .msg').all();
    console.log('Total messages:', allMsgs.length);
    for (let i = 0; i < allMsgs.length; i++) {
      const text = await allMsgs[i].locator('.msg-content').textContent().catch(() => '');
      console.log(`Message ${i}: ${text?.substring(0, 150)}`);
    }

    // Print any errors
    if (errors.length > 0) {
      console.log('\n=== ERRORS ===');
      errors.forEach(e => console.log(e));
    }
  });
});
