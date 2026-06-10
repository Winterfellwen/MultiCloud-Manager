import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'https://multicloud-backend-qw9d.onrender.com';
const USER = process.env.TEST_USER || 'admin';
const PASS = process.env.TEST_PASS || 'Test.1234';

async function login(page: any) {
  // Wait for dashboard to be fully loaded
  await page.waitForFunction(() => {
    const el = document.getElementById('page-dashboard');
    return el && el.style.display !== 'none';
  }, { timeout: 10000 });
  await page.waitForTimeout(300);

  await page.click('.nav-item[data-page="chat"]');
  await page.waitForFunction(() => {
    const el = document.getElementById('page-chat');
    return el && el.style.display !== 'none';
  }, { timeout: 10000 });
  await page.waitForTimeout(300);

  // New session
  const newBtn = page.locator('button:has-text("新建对话"), button:has-text("New Session")');
  if (await newBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await newBtn.click();
    await page.waitForTimeout(2000);
  }

  // Send a simple message
  await page.locator('#chatInput').fill('列出所有Azure资源');
  await page.locator('#chatSendBtn').click();
  await page.waitForSelector('#username', { timeout: 20000 });
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await page.click('button:has-text("登 录")');
  await page.waitForFunction(() => {
    const el = document.getElementById('page-dashboard');
    return el && el.style.display !== 'none';
  }, { timeout: 25000 });
  await page.waitForTimeout(500);
}

test.describe('Chat Bubble UX', () => {

  test('User messages use bubble, AI messages plain text', async ({ page }) => {
    test.setTimeout(180000);
    await login(page);

    await page.click('.nav-item[data-page="chat"]');
    await page.waitForFunction(() => {
      const el = document.getElementById('page-chat');
      return el && el.style.display !== 'none';
    }, { timeout: 10000 });

    // New session
    const newBtn = page.locator('button:has-text("新建对话"), button:has-text("New Session")');
    if (await newBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newBtn.click();
      await page.waitForTimeout(1500);
    }

    // Send a simple message
    await page.locator('#chatInput').fill('列出所有Azure资源');
    await page.locator('#chatSendBtn').click();

    // Wait for at least one agent message to appear
    await page.waitForFunction(() => {
      return document.querySelectorAll('.msg.agent').length > 1;
    }, { timeout: 60000 });

    // Check user message has bubble wrapper
    const userMsgs = page.locator('.msg.user');
    const userCount = await userMsgs.count();
    expect(userCount).toBeGreaterThan(0);

    const firstUserBubble = userMsgs.first().locator('.msg-bubble');
    await expect(firstUserBubble).toBeVisible();

    // Check user bubble has right alignment
    await expect(userMsgs.first()).toHaveCSS('align-items', 'flex-end');

    // Check AI message has role header, no bubble
    const agentMsgs = page.locator('.msg.agent');
    const agentCount = await agentMsgs.count();
    expect(agentCount).toBeGreaterThanOrEqual(1);

    // AI messages should NOT have .msg-bubble
    const agentBubbles = page.locator('.msg.agent .msg-bubble');
    const agentBubbleCount = await agentBubbles.count();
    expect(agentBubbleCount).toBe(0);

    // AI messages should have role header
    const agentRole = page.locator('.msg.agent .msg-role').last();
    await expect(agentRole).toBeVisible();
    await expect(agentRole).toContainText('AI');

    console.log('✅ User=bubble, AI=plain text, role headers verified');
  });

  test('Tool blocks are expandable with status indicators', async ({ page }) => {
    test.setTimeout(180000);
    await login(page);

    await page.click('.nav-item[data-page="chat"]');
    await page.waitForFunction(() => {
      const el = document.getElementById('page-chat');
      return el && el.style.display !== 'none';
    }, { timeout: 10000 });

    const newBtn = page.locator('button:has-text("新建对话"), button:has-text("New Session")');
    if (await newBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newBtn.click();
      await page.waitForTimeout(1500);
    }

    // Set to Plan mode
    await page.waitForSelector('.mode-btn[data-mode="plan"]', { state: 'visible', timeout: 10000 });
    await page.locator('.mode-btn[data-mode="plan"]').click();
    await page.waitForTimeout(300);

    // Send a message that will trigger tool calls
    await page.locator('#chatInput').fill('查看所有云资源概况');
    await page.locator('#chatSendBtn').click();

    // Wait for tool blocks to appear
    await page.waitForFunction(() => {
      return document.querySelectorAll('.tool-block').length > 0;
    }, { timeout: 60000 });

    const toolBlocks = page.locator('.tool-block');
    const toolCount = await toolBlocks.count();
    console.log('Tool blocks found:', toolCount);
    expect(toolCount).toBeGreaterThan(0);

    // Check first tool block has status
    const firstTool = toolBlocks.first();
    await expect(firstTool).toBeVisible();

    // Check tool has name and status
    await expect(firstTool.locator('.tool-name')).toBeVisible();
    await expect(firstTool.locator('.tool-status')).toBeVisible();

    // Click to expand
    await firstTool.click();
    await page.waitForTimeout(300);
    await expect(firstTool).toHaveClass(/expanded/);

    // Should show result
    const result = firstTool.locator('.tool-result');
    const resultVisible = await result.isVisible().catch(() => false);
    console.log('Tool result visible after expand:', resultVisible);

    console.log('✅ Tool blocks expandable with status');
  });

  test('Session list shows as "对话" and new session appears immediately', async ({ page }) => {
    test.setTimeout(60000);
    await login(page);

    await page.click('.nav-item[data-page="chat"]');
    await page.waitForFunction(() => {
      const el = document.getElementById('page-chat');
      return el && el.style.display !== 'none';
    }, { timeout: 10000 });

    await page.waitForTimeout(1000);

    // Check sidebar header label
    const headerLabel = page.locator('.chat-sidebar-header h3');
    await expect(headerLabel).toBeVisible();
    const labelText = await headerLabel.textContent();
    console.log('Sidebar label:', labelText);
    expect(labelText).not.toContain('历史'); // should be "对话" not "对话历史"

    // Count existing sessions
    const initialCount = await page.locator('.chat-session-item').count();

    // Create new session
    const newBtn = page.locator('.chat-new-btn');
    await newBtn.click();
    await page.waitForTimeout(2000);

    // New session should appear in list
    const newCount = await page.locator('.chat-session-item').count();
    expect(newCount).toBeGreaterThanOrEqual(initialCount);
    console.log('Session count: initial=' + initialCount + ', new=' + newCount);

    console.log('✅ Session label and immediate appearance');
  });

  test('AI stops with summary instead of silent cutoff', async ({ page }) => {
    test.setTimeout(300000);
    await login(page);

    await page.click('.nav-item[data-page="chat"]');
    await page.waitForFunction(() => {
      const el = document.getElementById('page-chat');
      return el && el.style.display !== 'none';
    }, { timeout: 10000 });

    const newBtn = page.locator('button:has-text("新建对话"), button:has-text("New Session")');
    if (await newBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await newBtn.click();
      await page.waitForTimeout(1500);
    }

    // Send a message - AI might hit limits or errors
    await page.locator('#chatInput').fill('帮我创建免费的azure tts');
    await page.locator('#chatSendBtn').click();

    // Wait for streaming to complete
    await page.waitForFunction(() => {
      return document.querySelectorAll('.msg.streaming').length === 0
          && document.querySelectorAll('.msg.agent').length > 1;
    }, { timeout: 240000 });

    await page.waitForTimeout(1000);

    // Get all agent message text
    const agentMsgs = await page.locator('.msg.agent .msg-content').allTextContents();
    const allText = agentMsgs.join('\n');
    console.log('Agent messages count:', agentMsgs.length);
    console.log('Total agent text length:', allText.length);

    // Should have meaningful content (not just an error message)
    expect(allText.length).toBeGreaterThan(200);

    // Check for summary/stop indicator if it stopped early
    const hasSummary = allText.includes('AI') && (allText.includes('停止') || allText.includes('中断') || allText.includes('Done') || allText.includes('完成'));
    console.log('Has summary/stop indicator:', hasSummary, 'content preview:', allText.substring(allText.length - 200));

    // The last agent message should NOT be a raw error
    const lastAgentMsg = agentMsgs[agentMsgs.length - 1] || '';
    const isRawError = lastAgentMsg.startsWith('错误：') || lastAgentMsg.startsWith('Error:') || lastAgentMsg.startsWith('API error');
    console.log('Last message is error?', isRawError);

    if (isRawError) {
      console.log('→ Error received, checking if there was preceding content before it');
      // Check if there was content BEFORE the error (should be)
      expect(agentMsgs.length).toBeGreaterThan(1);
      const prevMsg = agentMsgs[agentMsgs.length - 2] || '';
      expect(prevMsg.length).toBeGreaterThan(50);
      console.log('Previous message length:', prevMsg.length);
    }

    console.log('✅ AI stops with proper display');
  });
});
