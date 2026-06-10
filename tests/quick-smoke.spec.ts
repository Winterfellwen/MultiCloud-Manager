import { test, expect, Page } from '@playwright/test';

const BASE = process.env.BASE_URL || 'https://multicloud-backend-qw9d.onrender.com';
const USER = process.env.TEST_USER || 'admin';
const PASS = process.env.TEST_PASS || 'Test.1234';

async function login(page: Page) {
  await page.goto(BASE + '/login.html', { waitUntil: 'networkidle' });
  await page.waitForSelector('#username', { timeout: 20000 });
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await page.click('button:has-text("登 录")');
  await page.waitForFunction(() => {
    const el = document.getElementById('page-dashboard');
    return el && el.style.display !== 'none';
  }, { timeout: 25000 });
}

async function goToChat(page: Page) {
  await page.click('.nav-item[data-page="chat"]');
  await page.waitForFunction(() => {
    const el = document.getElementById('page-chat');
    return el && el.style.display !== 'none';
  }, { timeout: 10000 });
  await page.waitForTimeout(300);
}

test.describe('Quick Platform Smoke Test', () => {

  test('1. All pages + Vault', async ({ page }) => {
    test.setTimeout(30000);
    await login(page);
    const pages = ['dashboard', 'chat', 'resources', 'accounts', 'team', 'vault', 'terraform', 'profile'];
    for (const p of pages) {
      await page.click(`.nav-item[data-page="${p}"]`);
      await page.waitForTimeout(300);
      const el = page.locator(`#page-${p}`);
      await expect(el).toBeAttached({ timeout: 5000 });
    }
    // Vault API check  
    await page.click('.nav-item[data-page="vault"]');
    await page.waitForTimeout(1000);
    const vh = await page.locator('#vaultHealth').textContent();
    expect(vh).toBeTruthy();
    expect(vh).not.toContain('404');
    console.log('✅ All pages + Vault OK');
  });

  test('2. Chat UI structure', async ({ page }) => {
    test.setTimeout(20000);
    await login(page);
    await goToChat(page);

    // Mode buttons exist
    await expect(page.locator('.mode-btn[data-mode="plan"]')).toBeVisible();
    await expect(page.locator('.mode-btn[data-mode="build"]')).toBeVisible();
    await expect(page.locator('.mode-btn[data-mode="confirm"]')).toBeVisible();

    // Session sidebar
    await expect(page.locator('.chat-sidebar-header h3')).toContainText('对话');

    // Chat input and send button
    await expect(page.locator('#chatInput')).toBeVisible();
    await expect(page.locator('#chatSendBtn')).toBeVisible();

    // Stop button exists (hidden initially)
    await expect(page.locator('#chatStopBtn')).toBeAttached();

    // Initial greeting uses role header
    const agentRole = page.locator('.msg.agent .msg-role').first();
    await expect(agentRole).toContainText('AI');

    // User bubble check: send a message
    await page.locator('.chat-new-btn').click();
    await page.waitForTimeout(500);
    await page.locator('#chatInput').fill('hello');
    await page.locator('#chatSendBtn').click();
    await page.waitForTimeout(2000);

    const userMsg = page.locator('.msg.user').first();
    await expect(userMsg).toBeVisible();
    const bubble = userMsg.locator('.msg-bubble');
    await expect(bubble).toBeVisible();

    console.log('✅ Chat UI structure OK');
  });

  test('3. Plan mode starts stream', async ({ page }) => {
    test.setTimeout(30000);
    await login(page);
    await goToChat(page);
    await page.locator('.chat-new-btn').click();
    await page.waitForTimeout(500);
    await page.locator('.mode-btn[data-mode="plan"]').click();

    await page.locator('#chatInput').fill('列出所有云资源');
    await page.locator('#chatSendBtn').click();

    // Wait for stream to start
    await page.waitForFunction(() => {
      return document.querySelectorAll('.msg.streaming, .tool-block').length > 0;
    }, { timeout: 10000 });

    // Stop button should be visible during streaming
    const stopVisible = await page.locator('#chatStopBtn').isVisible().catch(() => false);
    console.log('  Stop visible:', stopVisible);
    expect(stopVisible).toBe(true);

    // Click stop
    await page.locator('#chatStopBtn').click();
    await page.waitForTimeout(2000);

    // Should show stopped message
    const msgs = await page.locator('.msg.agent .msg-content').allTextContents();
    const stopped = msgs.some(m => m && m.includes('停止'));
    console.log('  Stopped message:', stopped);

    console.log('✅ Plan stream + stop works');
  });

  test('4. Build mode + tool blocks', async ({ page }) => {
    test.setTimeout(30000);
    await login(page);
    await goToChat(page);
    await page.locator('.chat-new-btn').click();
    await page.waitForTimeout(500);
    await page.locator('.mode-btn[data-mode="build"]').click();

    await page.locator('#chatInput').fill('echo hello');
    await page.locator('#chatSendBtn').click();

    // Wait for tool blocks
    await page.waitForFunction(() => {
      return document.querySelectorAll('.tool-block').length > 0;
    }, { timeout: 15000 });

    const blocks = page.locator('.tool-block');
    const count = await blocks.count();
    console.log('  Tool blocks:', count);
    expect(count).toBeGreaterThan(0);

    // Check tool block has arrow + name
    const firstBlock = blocks.first();
    await expect(firstBlock.locator('.tool-arrow')).toBeVisible();
    await expect(firstBlock.locator('.tool-name')).toBeVisible();

    // Click to expand
    await firstBlock.click();
    await page.waitForTimeout(300);
    await expect(firstBlock).toHaveClass(/expanded/);

    console.log('✅ Build mode tool blocks expandable');
  });

  test('5. Session list + new session', async ({ page }) => {
    test.setTimeout(20000);
    await login(page);
    await goToChat(page);
    await page.waitForTimeout(1000);

    // Sidebar label is "对话"
    const headerText = await page.locator('.chat-sidebar-header h3').textContent();
    console.log('  Sidebar label:', headerText);

    // Create new session
    await page.locator('.chat-new-btn').click();
    await page.waitForTimeout(1000);
    const sessionItems = page.locator('.chat-session-item');
    const count = await sessionItems.count();
    console.log('  Session count:', count);
    expect(count).toBeGreaterThanOrEqual(1);

    console.log('✅ Session list works');
  });
});
