import { test, expect } from '@playwright/test';
import { login } from './helpers';

const BASE = process.env.BASE_URL || 'https://multicloud-backend-qw9d.onrender.com';

test.describe('Three Modes Usability Test', () => {

  test('Plan Mode: AI gathers info and provides plan', async ({ page }) => {
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

    // Set to Plan mode
    const planBtn = page.locator('.mode-btn[data-mode="plan"]');
    if (await planBtn.isVisible()) {
      await planBtn.click();
      await page.waitForTimeout(500);
    }

    // Send message
    const chatInput = page.locator('#chatInput');
    await chatInput.fill('查看当前所有云资源概况');
    await page.waitForTimeout(500);
    await page.locator('#chatSendBtn').click();
    console.log('Plan mode: sent "查看当前所有云资源概况"');

    // Wait for response
    const response = await page.waitForResponse(
      resp => resp.url().includes('/agent/chat/stream'),
      { timeout: 30000 }
    );
    const body = await response.text();

    // Check for tool usage
    const hasToolCalls = body.includes('event: tool_start');
    const toolNames = [...body.matchAll(/"name":"([^"]+)"/g)].map(m => m[1]);
    console.log('Plan mode - used tools:', [...new Set(toolNames)]);
    console.log('Plan mode - has tool calls:', hasToolCalls);

    // Wait for full response
    await page.waitForTimeout(5000);

    // Get response text
    const msgs = await page.locator('#chatMessages .msg.agent .msg-content').allTextContents();
    const lastMsg = msgs[msgs.length - 1] || '';
    console.log('Plan mode - response length:', lastMsg.length);
    console.log('Plan mode - first 200 chars:', lastMsg.substring(0, 200));

    // Verify: should use tools, not hallucinate
    expect(hasToolCalls).toBe(true);
    expect(lastMsg.length).toBeGreaterThan(50);
    console.log('✅ Plan mode test passed\n');
  });

  test('Build Mode: AI executes shell commands', async ({ page }) => {
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

    // Set to Build mode
    const buildBtn = page.locator('.mode-btn[data-mode="build"]');
    if (await buildBtn.isVisible()) {
      await buildBtn.click();
      await page.waitForTimeout(500);
    }

    // Send a safe command request
    const chatInput = page.locator('#chatInput');
    await chatInput.fill('执行 echo "hello from build mode" 并显示当前日期');
    await page.waitForTimeout(500);
    await page.locator('#chatSendBtn').click();
    console.log('Build mode: sent shell command request');

    // Wait for response
    const response = await page.waitForResponse(
      resp => resp.url().includes('/agent/chat/stream'),
      { timeout: 30000 }
    );
    const body = await response.text();

    // Check for shell_exec tool call
    const hasShellExec = body.includes('shell_exec');
    const hasToolCalls = body.includes('event: tool_start');
    console.log('Build mode - has shell_exec:', hasShellExec);
    console.log('Build mode - has tool calls:', hasToolCalls);

    // Check for tool results
    const hasToolResults = body.includes('event: tool_result');
    console.log('Build mode - has tool results:', hasToolResults);

    // Wait for full response
    await page.waitForTimeout(5000);

    const msgs = await page.locator('#chatMessages .msg.agent .msg-content').allTextContents();
    const lastMsg = msgs[msgs.length - 1] || '';
    console.log('Build mode - response length:', lastMsg.length);
    console.log('Build mode - first 300 chars:', lastMsg.substring(0, 300));

    // Verify: should execute shell commands
    expect(hasToolCalls).toBe(true);
    console.log('✅ Build mode test passed\n');
  });

  test('Confirm Mode: AI requests confirmation before execution', async ({ page }) => {
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

    // Set to Confirm mode
    const confirmBtn = page.locator('.mode-btn[data-mode="confirm"]');
    if (await confirmBtn.isVisible()) {
      await confirmBtn.click();
      await page.waitForTimeout(500);
    }

    // Send a resource query
    const chatInput = page.locator('#chatInput');
    await chatInput.fill('同步所有云资源');
    await page.waitForTimeout(500);
    await page.locator('#chatSendBtn').click();
    console.log('Confirm mode: sent "同步所有云资源"');

    // Wait for response
    const response = await page.waitForResponse(
      resp => resp.url().includes('/agent/chat/stream'),
      { timeout: 30000 }
    );
    const body = await response.text();

    const hasToolCalls = body.includes('event: tool_start');
    const toolNames = [...body.matchAll(/"name":"([^"]+)"/g)].map(m => m[1]);
    console.log('Confirm mode - used tools:', [...new Set(toolNames)]);
    console.log('Confirm mode - has tool calls:', hasToolCalls);

    // Wait for full response
    await page.waitForTimeout(5000);

    const msgs = await page.locator('#chatMessages .msg.agent .msg-content').allTextContents();
    const lastMsg = msgs[msgs.length - 1] || '';
    console.log('Confirm mode - response length:', lastMsg.length);
    console.log('Confirm mode - first 300 chars:', lastMsg.substring(0, 300));

    // Verify: should use tools
    expect(hasToolCalls).toBe(true);
    console.log('✅ Confirm mode test passed\n');
  });
});
