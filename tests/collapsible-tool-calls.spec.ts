import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'https://multicloud-manager-8ylh.onrender.com';
const USER = process.env.TEST_USER || 'admin';
const PASS = process.env.TEST_PASS || 'Test.1234';

test.describe('Collapsible tool-calls group', () => {

  test('inline tool blocks are replaced by collapsible group after stream ends', async ({ page }) => {
    test.setTimeout(240000);

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
    await page.waitForTimeout(500);

    // 3. New session
    const newBtn = page.locator('button:has-text("新建对话"), button:has-text("New Session")');
    if (await newBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await newBtn.click();
      await page.waitForTimeout(2000);
    }

    // 4. Send a message that triggers a quick tool call
    await page.locator('#chatInput').fill('列出所有Render资源');
    await page.locator('#chatSendBtn').click();

    // 5. During streaming, inline tool blocks should appear
    console.log('Waiting for tool blocks during streaming...');
    await page.waitForFunction(() => {
      return document.querySelectorAll('.tool-block').length > 0;
    }, { timeout: 60000 });
    const inlineBlocksDuringStream = await page.locator('.tool-block').count();
    console.log('Inline tool blocks during streaming:', inlineBlocksDuringStream);
    expect(inlineBlocksDuringStream).toBeGreaterThan(0);

    // 6. Wait for streaming to complete (no more .msg.streaming)
    console.log('Waiting for streaming to end...');
    await page.waitForFunction(() => {
      return document.querySelectorAll('.msg.streaming').length === 0;
    }, { timeout: 120000 });
    await page.waitForTimeout(1000);

    // 7. After stream ends, inline tool blocks should be gone from msg-content
    const inlineBlocksAfterStream = await page.locator('.msg.agent .msg-content .tool-block').count();
    console.log('Inline tool blocks in msg-content after stream ends:', inlineBlocksAfterStream);
    expect(inlineBlocksAfterStream).toBe(0);

    // 8. Collapsible group should exist (now inline in agent message or separate .msg.tools)
    const toolsInline = page.locator('.tool-calls-inline');
    const toolsMsg = page.locator('.msg.tools');
    const hasInline = await toolsInline.count() > 0;
    const hasToolsMsg = await toolsMsg.count() > 0;
    console.log('Has inline tool calls:', hasInline, 'Has tools msg:', hasToolsMsg);
    expect(hasInline || hasToolsMsg).toBeTruthy();

    // 9. Header should say "工具调用 (N)"
    const header = hasInline ? toolsInline.locator('.tool-calls-header') : toolsMsg.locator('.tool-calls-header');
    await expect(header).toBeVisible({ timeout: 10000 });
    const headerText = await header.textContent();
    console.log('Header text:', headerText);
    expect(headerText).toMatch(/工具调用\s*\((\d+)\)/);

    // 10. Body should be hidden initially
    const body = header.locator('..').locator('.tool-calls-body');
    await expect(body).toBeHidden();

    // 11. Click header to expand
    await header.click();
    await page.waitForTimeout(300);
    await expect(body).toBeVisible();

    // 12. Individual tool cards inside should be visible
    const innerToolCards = body.locator('.tool-card');
    const innerToolCount = await innerToolCards.count();
    console.log('Inner tool cards:', innerToolCount);
    expect(innerToolCount).toBeGreaterThan(0);

    // 13. Each tool card should have card-name, card-status, expand-arrow
    const firstCard = innerToolCards.first();
    await expect(firstCard.locator('.card-name')).toBeVisible();
    await expect(firstCard.locator('.card-status')).toHaveText('done');

    // 14. Click to expand individual tool card
    await firstCard.locator('.tool-card-header').click();
    await page.waitForTimeout(300);
    const cardBody = firstCard.locator('.tool-card-body');
    await expect(cardBody).toBeVisible();

    // 15. Card body should have 调用名称, 完整命令, 执行结果 fields
    const fieldLabels = cardBody.locator('.field-label');
    const labelCount = await fieldLabels.count();
    console.log('Field labels:', labelCount);
    expect(labelCount).toBeGreaterThanOrEqual(3);

    // 16. Copy button should exist in result field
    const resultField = cardBody.locator('.field-result');
    await expect(resultField).toBeVisible();
    const copyBtn = resultField.locator('.copy-btn');
    await expect(copyBtn).toBeVisible();
    console.log('Copy button text:', await copyBtn.textContent());

    // 17. Verify the tool-calls header class toggles
    await header.click();
    await page.waitForTimeout(300);
    await expect(body).toBeHidden();
    await header.click();
    await page.waitForTimeout(300);
    await expect(body).toBeVisible();

    console.log('All collapsible tool-calls group tests passed');
  });

});
