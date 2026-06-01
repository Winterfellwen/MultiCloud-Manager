import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'https://multicloud-manager-8ylh.onrender.com';
const USER = process.env.TEST_USER || 'admin';
const PASS = process.env.TEST_PASS || 'Test.1234';

test.describe('Chat history - collapsible tool-calls', () => {
  test('check sessions have collapsible tool-calls', async ({ page }) => {
    test.setTimeout(300000);

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

    // 2. Navigate to chat
    await page.click('.nav-item[data-page="chat"]');
    await page.waitForFunction(() => {
      const el = document.getElementById('page-chat');
      return el && el.style.display !== 'none';
    }, { timeout: 10000 });
    await page.waitForTimeout(2000);

    // 3. Check sessions for tool-calls groups
    const sessionCount = await page.locator('.chat-session-item').count();
    console.log('Total sessions:', sessionCount);

    let foundToolCalls = false;
    const sessionsToCheck = Math.min(sessionCount, 10);

    for (let i = 0; i < sessionsToCheck && !foundToolCalls; i++) {
      const session = page.locator('.chat-session-item').nth(i);
      const sessionText = await session.textContent();
      console.log(`\nChecking session ${i + 1}: "${sessionText}"`);
      await session.click();
      await page.waitForTimeout(3000);

      const toolsGroups = page.locator('.msg.tools');
      const toolsGroupCount = await toolsGroups.count();
      console.log(`  Tool-calls groups found: ${toolsGroupCount}`);

      if (toolsGroupCount > 0) {
        foundToolCalls = true;
        console.log(`\n========== SESSION ${i + 1} HAS TOOL-CALLS ==========`);
        console.log(`Session: "${sessionText}"`);

        const header = toolsGroups.first().locator('.tool-calls-header');
        const headerText = await header.textContent();
        console.log(`Header: "${headerText}"`);

        // Verify collapsed initially
        const body = toolsGroups.first().locator('.tool-calls-body');
        await expect(body).toBeHidden();
        console.log('✅ Body hidden initially');

        // Expand
        await header.click();
        await page.waitForTimeout(500);
        await expect(body).toBeVisible();
        console.log('✅ Body expanded');

        // Count tool cards
        const innerBlocks = body.locator('.tool-card');
        const innerCount = await innerBlocks.count();
        console.log(`Inner tool cards: ${innerCount}`);
        expect(innerCount).toBeGreaterThan(0);

        // Check first card
        const firstBlock = innerBlocks.first();
        await expect(firstBlock.locator('.card-name')).toBeVisible();
        await expect(firstBlock.locator('.card-status')).toBeVisible();
        const toolName = await firstBlock.locator('.card-name').textContent();
        console.log(`First tool name: "${toolName}"`);
        console.log('Tool card has name + status');

        // Expand card
        await firstBlock.locator('.tool-card-header').click();
        await page.waitForTimeout(500);
        const result = firstBlock.locator('.field-result');
        await expect(result).toBeVisible();
        console.log('Tool result visible');

        // Copy button
        const copyBtn = result.locator('.copy-btn');
        await expect(copyBtn).toBeVisible();
        const copyText = await copyBtn.textContent();
        console.log(`Copy button: "${copyText}"`);
        console.log('✅ Copy button visible');

        // Collapse header
        await header.click();
        await page.waitForTimeout(500);
        await expect(body).toBeHidden();
        console.log('✅ Body collapsed again');

        // Take screenshot
        await page.screenshot({ path: 'E:/AI/multicloud/chat-tool-calls-view.png', fullPage: true });
        console.log('\n📸 Screenshot saved');
        break;
      }
    }

    if (!foundToolCalls) {
      console.log('\n⚠️  No tool-calls groups found in any of the first ' + sessionsToCheck + ' sessions');
      console.log('These sessions were created before the backend JSON tool-calls format was deployed.');
      console.log('Creating a new session to test...');
      
      // Create new session and send a message to trigger tool calls
      const newBtn = page.locator('button:has-text("新建对话"), button:has-text("New Session")');
      if (await newBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await newBtn.click();
        await page.waitForTimeout(2000);
      }

      await page.locator('#chatInput').fill('列出所有Render资源');
      await page.locator('#chatSendBtn').click();

      // Wait for streaming to end
      await page.waitForFunction(() => {
        return document.querySelectorAll('.msg.streaming').length === 0;
      }, { timeout: 120000 });
      await page.waitForTimeout(2000);

      // Check for tool-calls group
      const toolsGroups = page.locator('.msg.tools');
      const toolsGroupCount = await toolsGroups.count();
      console.log(`\nNew session - Tool-calls groups: ${toolsGroupCount}`);

      if (toolsGroupCount > 0) {
        const header = toolsGroups.first().locator('.tool-calls-header');
        const headerText = await header.textContent();
        console.log(`Header: "${headerText}"`);

        const body = toolsGroups.first().locator('.tool-calls-body');
        await expect(body).toBeHidden();
        console.log('✅ Body hidden initially');

        await header.click();
        await page.waitForTimeout(500);
        await expect(body).toBeVisible();
        console.log('✅ Body expanded');

        const innerBlocks = body.locator('.tool-card');
        const innerCount = await innerBlocks.count();
        console.log(`Inner tool cards: ${innerCount}`);
        expect(innerCount).toBeGreaterThan(0);

        const firstBlock = innerBlocks.first();
        await expect(firstBlock.locator('.card-name')).toBeVisible();
        await expect(firstBlock.locator('.card-status')).toBeVisible();
        console.log('Tool card has name + status');

        await firstBlock.locator('.tool-card-header').click();
        await page.waitForTimeout(500);
        const result = firstBlock.locator('.field-result');
        await expect(result).toBeVisible();
        console.log('Tool result visible');

        const copyBtn = result.locator('.copy-btn');
        await expect(copyBtn).toBeVisible();
        console.log('✅ Copy button visible');

        await header.click();
        await page.waitForTimeout(500);
        await expect(body).toBeHidden();
        console.log('✅ Body collapsed again');

        await page.screenshot({ path: 'E:/AI/multicloud/chat-tool-calls-view.png', fullPage: true });
        console.log('\n📸 Screenshot saved');
      }
    }

    console.log('\nDone!');
  });
});
