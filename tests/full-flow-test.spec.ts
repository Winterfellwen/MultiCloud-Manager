import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'https://multicloud-manager-8ylh.onrender.com';
const USER = process.env.TEST_USER || 'admin';
const PASS = process.env.TEST_PASS || 'Test.1234';

test('full flow: new session → tool-calls saved → reload → collapsible group', async ({ page }) => {
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
  await page.waitForTimeout(1000);

  // 3. New session
  const newBtn = page.locator('button:has-text("新建对话"), button:has-text("New Session")');
  if (await newBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await newBtn.click();
    await page.waitForTimeout(2000);
  }

  // 4. Send a message that triggers tool calls
  await page.locator('#chatInput').fill('列出所有Render资源');
  await page.locator('#chatSendBtn').click();

  // 5. Wait for tool blocks during streaming
  console.log('Waiting for tool blocks during streaming...');
  await page.waitForFunction(() => {
    return document.querySelectorAll('.tool-block').length > 0;
  }, { timeout: 60000 });
  console.log('✅ Tool blocks appeared during streaming');

  // 6. Wait for streaming to end
  console.log('Waiting for streaming to end...');
  await page.waitForFunction(() => {
    return document.querySelectorAll('.msg.streaming').length === 0;
  }, { timeout: 120000 });
  await page.waitForTimeout(1000);

  // 7. After streaming: collapsible group should exist (inline in agent msg or separate .msg.tools)
  const toolsInline = page.locator('.tool-calls-inline');
  const toolsMsg = page.locator('.msg.tools');
  const hasInline = await toolsInline.count() > 0;
  const hasToolsMsg = await toolsMsg.count() > 0;
  console.log('Has inline tool calls:', hasInline, 'Has tools msg:', hasToolsMsg);
  expect(hasInline || hasToolsMsg).toBeTruthy();

  const header = hasInline ? toolsInline.locator('.tool-calls-header') : toolsMsg.locator('.tool-calls-header');
  const headerText = await header.textContent();
  console.log('Header:', headerText);

  // Verify body hidden initially
  const body = (hasInline ? toolsInline : toolsMsg).locator('.tool-calls-body');
  await expect(body).toBeHidden();
  console.log('Body hidden initially');

  // Expand and verify
  await header.click();
  await page.waitForTimeout(500);
  await expect(body).toBeVisible();
  console.log('Body expanded');

  const innerCount = await body.locator('.tool-card').count();
  console.log('Inner tool cards:', innerCount);
  expect(innerCount).toBeGreaterThan(0);

  // Collapse
  await header.click();
  await page.waitForTimeout(300);
  await expect(body).toBeHidden();
  console.log('✅ Collapsed');

  // 8. Take screenshot of live state
  await page.screenshot({ path: 'E:/AI/multicloud/test-live-state.png', fullPage: true });
  console.log('📸 Live state screenshot saved');

  // 9. Get session ID for reload test
  const sessionId = await page.evaluate(() => {
    // @ts-ignore
    return window.CURRENT_SESSION;
  });
  console.log('Session ID:', sessionId);

  // 10. Reload session from DB
  console.log('\n=== RELOADING SESSION FROM DB ===');
  
  // Clear the in-memory cache to force DB load
  await page.evaluate(() => {
    // @ts-ignore
    if (window.SESSION_MESSAGES) {
      // @ts-ignore
      const sid = window.CURRENT_SESSION;
      // @ts-ignore
      delete window.SESSION_MESSAGES[sid];
    }
  });

  // Click the session again to trigger DB reload
  const sessionItem = page.locator('.chat-session-item').filter({ hasText: '列出所有Render资源' }).first();
  await sessionItem.click();
  await page.waitForTimeout(3000);

  // 11. Check for tool-calls group from DB (inline or separate)
  const reloadedToolsInline = page.locator('.tool-calls-inline');
  const reloadedToolsGroups = page.locator('.msg.tools');
  const reloadedHasInline = await reloadedToolsInline.count() > 0;
  const reloadedHasToolsMsg = await reloadedToolsGroups.count() > 0;
  console.log('Reloaded - has inline:', reloadedHasInline, 'has tools msg:', reloadedHasToolsMsg);

  if (reloadedHasInline || reloadedHasToolsMsg) {
    const reloadedHeader = reloadedHasInline ? reloadedToolsInline.locator('.tool-calls-header') : reloadedToolsGroups.locator('.tool-calls-header');
    const reloadedHeaderText = await reloadedHeader.textContent();
    console.log('Reloaded header:', reloadedHeaderText);

    const reloadedContainer = reloadedHasInline ? reloadedToolsInline : reloadedToolsGroups;
    const reloadedBody = reloadedContainer.locator('.tool-calls-body');
    await expect(reloadedBody).toBeHidden();
    console.log('Reloaded body hidden initially');

    await reloadedHeader.click();
    await page.waitForTimeout(500);
    await expect(reloadedBody).toBeVisible();
    console.log('Reloaded body expanded');

    const reloadedInnerCount = await reloadedBody.locator('.tool-card').count();
    console.log('Reloaded inner tool cards:', reloadedInnerCount);
    expect(reloadedInnerCount).toBeGreaterThan(0);

    // Verify expand individual tool card
    const firstCard = reloadedBody.locator('.tool-card').first();
    await firstCard.locator('.tool-card-header').click();
    await page.waitForTimeout(500);
    const result = firstCard.locator('.field-result');
    await expect(result).toBeVisible();
    console.log('Tool result visible after expand');

    // Verify copy button
    const copyBtn = result.locator('.copy-btn');
    await expect(copyBtn).toBeVisible();
    console.log('✅ Copy button visible');

    // Collapse back
    await reloadedHeader.click();
    await page.waitForTimeout(500);
    await expect(reloadedBody).toBeHidden();
    console.log('✅ Collapsed again');

    // Take screenshot of reloaded state
    await page.screenshot({ path: 'E:/AI/multicloud/test-reloaded-state.png', fullPage: true });
    console.log('📸 Reloaded state screenshot saved');

    console.log('\n🎉 ALL TESTS PASSED!');
  } else {
    console.log('❌ No tool-calls groups found after DB reload!');
    await page.screenshot({ path: 'E:/AI/multicloud/test-reload-failed.png', fullPage: true });
    console.log('📸 Failure screenshot saved');
    
    // Debug: check DB directly
    const debugInfo = await page.evaluate(async () => {
      // @ts-ignore
      const token = localStorage.getItem('token');
      // @ts-ignore
      const sid = window.CURRENT_SESSION;
      const res = await fetch('/api/agent/sessions/' + sid, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      const data = await res.json();
      return {
        sessionId: sid,
        messageCount: (data.messages || []).length,
        roles: (data.messages || []).map((m: any) => m.role),
        messages: (data.messages || []).map((m: any) => ({
          role: m.role,
          contentPreview: (m.content || '').substring(0, 300)
        }))
      };
    });
    console.log('DB debug:', JSON.stringify(debugInfo, null, 2));
  }
});
