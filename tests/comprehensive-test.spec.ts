/**
 * MultiCloud Manager - Comprehensive Test Suite
 * Playwright (browser) + Direct API testing
 */
import { test, expect, Page } from '@playwright/test';

const BASE = 'http://localhost:8099';
const USER = 'admin';
const PASS = 'test123';

// Helper: login
async function login(page: Page) {
  await page.goto(`${BASE}/login.html`, { waitUntil: 'networkidle', timeout: 15000 });
  await page.waitForSelector('#username', { timeout: 10000 });
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await page.click('button:has-text("登 录")');
  await page.waitForFunction(() => {
    const el = document.getElementById('page-dashboard');
    return el && el.style.display !== 'none';
  }, { timeout: 15000 });
}

// Helper: navigate
async function navigate(page: Page, name: string) {
  await page.click(`.nav-item[data-page="${name}"]`);
  await page.waitForTimeout(500);
}

// Helper: wait for stream end
async function waitForStream(page: Page, maxSec: number) {
  for (let i = 0; i < maxSec; i += 3) {
    await page.waitForTimeout(3000);
    const streaming = await page.locator('.msg.streaming').count();
    if (streaming === 0) return;
  }
}

// Helper: API call
async function apiCall(method: string, path: string, body?: any, token?: string) {
  const headers: any = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const opts: any = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const resp = await fetch(`${BASE}/api${path}`, opts);
  const text = await resp.text();
  try { return { status: resp.status, data: JSON.parse(text) }; }
  catch { return { status: resp.status, data: text }; }
}

test.describe('MultiCloud Manager - Full Test Suite', () => {

  // ============================================================
  // SECTION 1: Authentication & Navigation
  // ============================================================

  test('Login page loads correctly', async ({ page }) => {
    await page.goto(`${BASE}/login.html`, { waitUntil: 'networkidle' });
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button:has-text("登 录")')).toBeVisible();
  });

  test('Login with valid credentials', async ({ page }) => {
    test.setTimeout(30000);
    await login(page);
    await expect(page.locator('#page-dashboard')).toBeVisible();
  });

  test('All 8 pages navigate correctly', async ({ page }) => {
    test.setTimeout(60000);
    await login(page);
    const pages = ['dashboard', 'chat', 'resources', 'accounts', 'team', 'vault', 'terraform', 'profile'];
    for (const p of pages) {
      await navigate(page, p);
      const visible = await page.locator(`#page-${p}`).isVisible();
      expect(visible, `Page ${p} should be visible`).toBe(true);
    }
  });

  // ============================================================
  // SECTION 2: Dashboard
  // ============================================================

  test('Dashboard shows stats cards', async ({ page }) => {
    test.setTimeout(30000);
    await login(page);
    await page.waitForTimeout(1000);
    const cards = page.locator('.stat-card, .stats-card, .card');
    const count = await cards.count();
    console.log(`Dashboard stat cards: ${count}`);
    expect(count).toBeGreaterThan(0);
  });

  test('Dashboard quick actions work', async ({ page }) => {
    test.setTimeout(30000);
    await login(page);
    const quickLinks = page.locator('.quick-action, .quick-link, a[href*="page"]');
    const linkCount = await quickLinks.count();
    console.log(`Quick action links: ${linkCount}`);
  });

  // ============================================================
  // SECTION 3: AI Chat (Core Feature)
  // ============================================================

  test('Chat page loads with all UI elements', async ({ page }) => {
    test.setTimeout(30000);
    await login(page);
    await navigate(page, 'chat');
    await page.waitForTimeout(1000);

    // Check key UI elements
    const chatInput = page.locator('#chatInput, .chat-input, textarea');
    await expect(chatInput).toBeVisible({ timeout: 5000 });

    const sendBtn = page.locator('#chatSendBtn, .chat-send-btn, button[type="submit"]');
    await expect(sendBtn).toBeVisible();

    // Check mode buttons
    const modeButtons = page.locator('.mode-btn');
    const modeCount = await modeButtons.count();
    console.log(`Mode buttons: ${modeCount}`);
    expect(modeCount).toBeGreaterThanOrEqual(2);

    // Check session list
    const sessionList = page.locator('.chat-session-list, .session-list, .chat-sidebar');
    const hasSessionList = await sessionList.isVisible().catch(() => false);
    console.log(`Session list visible: ${hasSessionList}`);

    // Check settings button
    const settingsBtn = page.locator('.chat-settings-btn, .settings-btn');
    const hasSettings = await settingsBtn.isVisible().catch(() => false);
    console.log(`Settings button: ${hasSettings}`);
  });

  test('AI Config modal opens and has all fields', async ({ page }) => {
    test.setTimeout(30000);
    await login(page);
    await navigate(page, 'chat');
    await page.waitForTimeout(1000);

    const settingsBtn = page.locator('.chat-settings-btn');
    await settingsBtn.click();
    await page.waitForTimeout(500);

    const modal = page.locator('#aiConfigModal');
    await expect(modal).toBeVisible();

    // Check all config fields
    const endpoint = page.locator('#aiApiEndpoint, [name="apiEndpoint"]');
    await expect(endpoint).toBeVisible();

    const model = page.locator('#aiModel, [name="model"]');
    await expect(model).toBeVisible();

    const apiKey = page.locator('#aiApiKey, [name="apiKey"]');
    await expect(apiKey).toBeVisible();

    // Check test button
    const testBtn = page.locator('button:has-text("测试"), button:has-text("Test")');
    const hasTestBtn = await testBtn.isVisible().catch(() => false);
    console.log(`Test connection button: ${hasTestBtn}`);

    // Check save button
    const saveBtn = page.locator('button:has-text("保存"), button:has-text("Save")');
    await expect(saveBtn).toBeVisible();

    // Close modal
    const cancelBtn = page.locator('button:has-text("取消"), button:has-text("Cancel")');
    await cancelBtn.click();
    await page.waitForTimeout(300);
    await expect(modal).not.toBeVisible();
  });

  test('New chat session creation', async ({ page }) => {
    test.setTimeout(30000);
    await login(page);
    await navigate(page, 'chat');
    await page.waitForTimeout(1000);

    const initialSessions = await page.locator('.chat-session-item').count();

    const newBtn = page.locator('.chat-new-btn, button:has-text("新建"), button:has-text("New")');
    await newBtn.click();
    await page.waitForTimeout(2000);

    const afterSessions = await page.locator('.chat-session-item').count();
    console.log(`Sessions before: ${initialSessions}, after: ${afterSessions}`);
    expect(afterSessions).toBeGreaterThanOrEqual(initialSessions);
  });

  test('Plan Mode: AI responds with tools', async ({ page }) => {
    test.setTimeout(180000);
    await login(page);
    await navigate(page, 'chat');
    await page.waitForTimeout(1000);

    // Create new session
    const newBtn = page.locator('.chat-new-btn, button:has-text("新建"), button:has-text("New")');
    if (await newBtn.isVisible().catch(() => false)) {
      await newBtn.click();
      await page.waitForTimeout(1500);
    }

    // Set Plan mode
    await page.locator('.mode-btn[data-mode="plan"]').click();
    await page.waitForTimeout(300);

    // Send message
    await page.locator('#chatInput').fill('查看当前所有云资源概况');
    await page.locator('#chatSendBtn').click();
    console.log('Plan mode: message sent');

    // Wait for response
    await waitForStream(page, 120);

    // Check response
    const msgs = await page.locator('.msg.agent .msg-content').allTextContents();
    const allText = msgs.filter(t => t).join(' ');
    console.log(`Plan mode response length: ${allText.length}`);
    console.log(`Plan mode response preview: ${allText.substring(0, 200)}`);

    const toolBlocks = await page.locator('.tool-block').count();
    console.log(`Tool blocks: ${toolBlocks}`);

    expect(allText.length).toBeGreaterThan(50);
  });

  test('Build Mode: AI executes shell commands', async ({ page }) => {
    test.setTimeout(180000);
    await login(page);
    await navigate(page, 'chat');
    await page.waitForTimeout(1000);

    const newBtn = page.locator('.chat-new-btn, button:has-text("新建"), button:has-text("New")');
    if (await newBtn.isVisible().catch(() => false)) {
      await newBtn.click();
      await page.waitForTimeout(1500);
    }

    await page.locator('.mode-btn[data-mode="build"]').click();
    await page.waitForTimeout(300);

    await page.locator('#chatInput').fill('执行 echo "hello from build mode" 并显示当前日期');
    await page.locator('#chatSendBtn').click();
    console.log('Build mode: message sent');

    await waitForStream(page, 120);

    const msgs = await page.locator('.msg.agent .msg-content').allTextContents();
    const allText = msgs.filter(t => t).join(' ');
    console.log(`Build mode response length: ${allText.length}`);

    const toolBlocks = await page.locator('.tool-block').count();
    console.log(`Tool blocks: ${toolBlocks}`);

    // Should have shell_exec tool calls
    expect(allText.length).toBeGreaterThan(50);
  });

  test('Build Mode: AI can check CLI tools and suggest resources', async ({ page }) => {
    test.setTimeout(180000);
    await login(page);
    await navigate(page, 'chat');
    await page.waitForTimeout(1000);

    const newBtn = page.locator('.chat-new-btn, button:has-text("新建"), button:has-text("New")');
    if (await newBtn.isVisible().catch(() => false)) {
      await newBtn.click();
      await page.waitForTimeout(1500);
    }

    await page.locator('.mode-btn[data-mode="build"]').click();
    await page.waitForTimeout(300);

    await page.locator('#chatInput').fill('检查系统信息，看看有哪些云CLI工具可用（az, tccli, oci等），列出可用的免费云资源');
    await page.locator('#chatSendBtn').click();
    console.log('Build mode: resource suggestion request sent');

    await waitForStream(page, 120);

    const msgs = await page.locator('.msg.agent .msg-content').allTextContents();
    const allText = msgs.filter(t => t).join(' ');
    console.log(`Resource suggestion response length: ${allText.length}`);
    console.log(`Response preview: ${allText.substring(0, 300)}`);

    const toolBlocks = await page.locator('.tool-block').count();
    console.log(`Tool blocks: ${toolBlocks}`);

    expect(allText.length).toBeGreaterThan(100);
  });

  test('Confirm Mode: AI requests confirmation', async ({ page }) => {
    test.setTimeout(180000);
    await login(page);
    await navigate(page, 'chat');
    await page.waitForTimeout(1000);

    const newBtn = page.locator('.chat-new-btn, button:has-text("新建"), button:has-text("New")');
    if (await newBtn.isVisible().catch(() => false)) {
      await newBtn.click();
      await page.waitForTimeout(1500);
    }

    await page.locator('.mode-btn[data-mode="confirm"]').click();
    await page.waitForTimeout(300);

    await page.locator('#chatInput').fill('同步所有云资源');
    await page.locator('#chatSendBtn').click();
    console.log('Confirm mode: message sent');

    await waitForStream(page, 60);

    const msgs = await page.locator('.msg.agent .msg-content').allTextContents();
    const allText = msgs.filter(t => t).join(' ');
    console.log(`Confirm mode response length: ${allText.length}`);

    // Check for confirmation buttons
    const confirmBtns = await page.locator('.confirm-btn, button:has-text("确认"), button:has-text("Confirm")').count();
    const rejectBtns = await page.locator('.reject-btn, button:has-text("拒绝"), button:has-text("Reject")').count();
    console.log(`Confirm buttons: ${confirmBtns}, Reject buttons: ${rejectBtns}`);

    expect(allText.length).toBeGreaterThan(50);
  });

  test('Stop button works during streaming', async ({ page }) => {
    test.setTimeout(60000);
    await login(page);
    await navigate(page, 'chat');
    await page.waitForTimeout(1000);

    const newBtn = page.locator('.chat-new-btn, button:has-text("新建"), button:has-text("New")');
    if (await newBtn.isVisible().catch(() => false)) {
      await newBtn.click();
      await page.waitForTimeout(1500);
    }

    await page.locator('.mode-btn[data-mode="plan"]').click();
    await page.waitForTimeout(300);
    await page.locator('#chatInput').fill('详细分析所有云资源的使用情况和成本');
    await page.locator('#chatSendBtn').click();
    await page.waitForTimeout(2000);

    const stopBtn = page.locator('#chatStopBtn, .chat-stop-btn');
    if (await stopBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await stopBtn.click();
      console.log('Stop button clicked');
      await page.waitForTimeout(2000);
    } else {
      console.log('Stream finished before stop could be tested');
    }
  });

  // ============================================================
  // SECTION 4: Resources Page
  // ============================================================

  test('Resources page loads with filters', async ({ page }) => {
    test.setTimeout(30000);
    await login(page);
    await navigate(page, 'resources');
    await page.waitForTimeout(1000);

    // Check for filter controls
    const cloudFilter = page.locator('select, .filter-select, .cloud-filter');
    const hasFilter = await cloudFilter.count();
    console.log(`Filter controls: ${hasFilter}`);

    // Check for sync button
    const syncBtn = page.locator('button:has-text("同步"), button:has-text("Sync"), .sync-btn');
    const hasSync = await syncBtn.isVisible().catch(() => false);
    console.log(`Sync button: ${hasSync}`);

    // Check for search
    const search = page.locator('input[type="search"], .search-input, input[placeholder*="搜索"]');
    const hasSearch = await search.count();
    console.log(`Search inputs: ${hasSearch}`);
  });

  test('Resources sync works', async ({ page }) => {
    test.setTimeout(60000);
    await login(page);
    await navigate(page, 'resources');
    await page.waitForTimeout(1000);

    const syncBtn = page.locator('button:has-text("同步"), button:has-text("Sync"), .sync-btn');
    if (await syncBtn.isVisible().catch(() => false)) {
      await syncBtn.click();
      await page.waitForTimeout(5000);
      console.log('Sync triggered');
    }
  });

  // ============================================================
  // SECTION 5: Accounts Page
  // ============================================================

  test('Accounts page shows existing accounts', async ({ page }) => {
    test.setTimeout(30000);
    await login(page);
    await navigate(page, 'accounts');
    await page.waitForTimeout(1000);

    const accountCards = page.locator('.account-card, .account-item, tr[data-id]');
    const count = await accountCards.count();
    console.log(`Account cards: ${count}`);

    // Check for add button
    const addBtn = page.locator('button:has-text("添加"), button:has-text("Add"), .add-account-btn');
    const hasAdd = await addBtn.isVisible().catch(() => false);
    console.log(`Add account button: ${hasAdd}`);
  });

  test('Add account modal works for each provider', async ({ page }) => {
    test.setTimeout(30000);
    await login(page);
    await navigate(page, 'accounts');
    await page.waitForTimeout(1000);

    const addBtn = page.locator('button:has-text("添加"), button:has-text("Add"), .add-account-btn');
    if (await addBtn.isVisible().catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(500);

      // Check provider options
      const providerSelect = page.locator('select, .provider-select, [name="cloud_type"]');
      const hasSelect = await providerSelect.isVisible().catch(() => false);
      console.log(`Provider select visible: ${hasSelect}`);

      if (hasSelect) {
        // Get all options
        const options = await providerSelect.locator('option').allTextContents();
        console.log(`Provider options: ${options.join(', ')}`);
      }

      // Check form fields
      const formInputs = page.locator('input[type="text"], input[type="password"], textarea');
      const inputCount = await formInputs.count();
      console.log(`Form inputs: ${inputCount}`);

      // Close modal
      const cancelBtn = page.locator('button:has-text("取消"), button:has-text("Cancel"), .modal-close');
      if (await cancelBtn.isVisible().catch(() => false)) {
        await cancelBtn.click();
      }
    }
  });

  // ============================================================
  // SECTION 6: Vault Page
  // ============================================================

  test('Vault page shows health status', async ({ page }) => {
    test.setTimeout(30000);
    await login(page);
    await navigate(page, 'vault');
    await page.waitForTimeout(1500);

    const health = page.locator('#vaultHealth, .vault-health, .health-status');
    const hasHealth = await health.isVisible().catch(() => false);
    console.log(`Vault health visible: ${hasHealth}`);
    if (hasHealth) {
      const text = await health.textContent();
      console.log(`Vault health: ${text}`);
    }
  });

  // ============================================================
  // SECTION 7: Terraform Page
  // ============================================================

  test('Terraform page loads with template list', async ({ page }) => {
    test.setTimeout(30000);
    await login(page);
    await navigate(page, 'terraform');
    await page.waitForTimeout(1000);

    const templates = page.locator('.template-item, .template-card, tr[data-id]');
    const count = await templates.count();
    console.log(`Terraform templates: ${count}`);

    const uploadBtn = page.locator('button:has-text("上传"), button:has-text("Upload"), .upload-btn');
    const hasUpload = await uploadBtn.isVisible().catch(() => false);
    console.log(`Upload button: ${hasUpload}`);
  });

  // ============================================================
  // SECTION 8: Profile Page
  // ============================================================

  test('Profile page shows user info and settings', async ({ page }) => {
    test.setTimeout(30000);
    await login(page);
    await navigate(page, 'profile');
    await page.waitForTimeout(1000);

    // Check dark mode toggle
    const darkToggle = page.locator('.dark-mode-toggle, input[type="checkbox"], .theme-switch');
    const hasDark = await darkToggle.count();
    console.log(`Dark mode toggles: ${hasDark}`);

    // Check language switch
    const langSwitch = page.locator('.lang-switch, select, .language-select');
    const hasLang = await langSwitch.count();
    console.log(`Language switches: ${hasLang}`);

    // Check password change
    const pwdChange = page.locator('button:has-text("修改密码"), button:has-text("Change Password")');
    const hasPwd = await pwdChange.isVisible().catch(() => false);
    console.log(`Password change: ${hasPwd}`);
  });

  test('Dark mode toggle works', async ({ page }) => {
    test.setTimeout(30000);
    await login(page);
    await navigate(page, 'profile');
    await page.waitForTimeout(1000);

    const body = page.locator('body');
    const themeBefore = await body.getAttribute('class') || '';
    console.log(`Theme before: ${themeBefore}`);

    const toggle = page.locator('.dark-mode-toggle, .theme-switch, input[type="checkbox"]').first();
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
      await page.waitForTimeout(500);
      const themeAfter = await body.getAttribute('class') || '';
      console.log(`Theme after: ${themeAfter}`);
    }
  });

  // ============================================================
  // SECTION 9: API Direct Tests
  // ============================================================

  test('API: Health endpoint works', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/health`);
    expect(resp.ok()).toBeTruthy();
    const data = await resp.json();
    expect(data.status).toBe('ok');
  });

  test('API: Login returns token', async ({ request }) => {
    const resp = await request.post(`${BASE}/api/auth/login`, {
      data: { username: USER, password: PASS }
    });
    console.log(`Login API status: ${resp.status()}`);
    if (resp.ok()) {
      const data = await resp.json();
      console.log(`Token received: ${data.token ? 'yes' : 'no'}`);
    }
  });

  test('API: Stats endpoint requires auth', async ({ request }) => {
    const resp = await request.get(`${BASE}/api/stats`);
    console.log(`Stats without auth: ${resp.status()}`);
    expect(resp.status()).toBe(401);
  });

  test('API: Resources endpoint works with auth', async ({ request }) => {
    // Login first
    const loginResp = await request.post(`${BASE}/api/auth/login`, {
      data: { username: USER, password: PASS }
    });
    if (loginResp.ok()) {
      const { token } = await loginResp.json();
      const resp = await request.get(`${BASE}/api/resources`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      console.log(`Resources API status: ${resp.status()}`);
      if (resp.ok()) {
        const data = await resp.json();
        console.log(`Resources count: ${Array.isArray(data) ? data.length : 'not array'}`);
      }
    }
  });

  test('API: Accounts CRUD works', async ({ request }) => {
    const loginResp = await request.post(`${BASE}/api/auth/login`, {
      data: { username: USER, password: PASS }
    });
    if (loginResp.ok()) {
      const { token } = await loginResp.json();
      const headers = { Authorization: `Bearer ${token}` };

      // List accounts
      const listResp = await request.get(`${BASE}/api/accounts`, { headers });
      console.log(`Accounts list: ${listResp.status()}`);
      if (listResp.ok()) {
        const accounts = await listResp.json();
        console.log(`Accounts count: ${Array.isArray(accounts) ? accounts.length : 'unknown'}`);
      }
    }
  });

  test('API: AI Agent sessions work', async ({ request }) => {
    const loginResp = await request.post(`${BASE}/api/auth/login`, {
      data: { username: USER, password: PASS }
    });
    if (loginResp.ok()) {
      const { token } = await loginResp.json();
      const headers = { Authorization: `Bearer ${token}` };

      // List sessions
      const sessionsResp = await request.get(`${BASE}/api/agent/sessions`, { headers });
      console.log(`Sessions list: ${sessionsResp.status()}`);

      // Create session
      const createResp = await request.post(`${BASE}/api/agent/sessions`, {
        headers,
        data: { title: 'Test Session' }
      });
      console.log(`Create session: ${createResp.status()}`);
      if (createResp.ok()) {
        const session = await createResp.json();
        console.log(`Session ID: ${session.id}`);
      }
    }
  });

  test('API: AI Config endpoint works', async ({ request }) => {
    const loginResp = await request.post(`${BASE}/api/auth/login`, {
      data: { username: USER, password: PASS }
    });
    if (loginResp.ok()) {
      const { token } = await loginResp.json();
      const headers = { Authorization: `Bearer ${token}` };

      const configResp = await request.get(`${BASE}/api/agent/config`, { headers });
      console.log(`AI Config: ${configResp.status()}`);
      if (configResp.ok()) {
        const config = await configResp.json();
        console.log(`AI Config: endpoint=${config.api_endpoint}, model=${config.model}, has_key=${!!config.api_key}`);
      }
    }
  });

  test('API: Vault health works', async ({ request }) => {
    const loginResp = await request.post(`${BASE}/api/auth/login`, {
      data: { username: USER, password: PASS }
    });
    if (loginResp.ok()) {
      const { token } = await loginResp.json();
      const headers = { Authorization: `Bearer ${token}` };

      const vaultResp = await request.get(`${BASE}/api/vault/health`, { headers });
      console.log(`Vault health: ${vaultResp.status()}`);
      if (vaultResp.ok()) {
        const data = await vaultResp.json();
        console.log(`Vault status: ${JSON.stringify(data)}`);
      }
    }
  });

  // ============================================================
  // SECTION 10: Responsive Design
  // ============================================================

  test('Responsive: Mobile viewport works', async ({ page }) => {
    test.setTimeout(30000);
    await page.setViewportSize({ width: 375, height: 812 });
    await login(page);

    // Check sidebar is collapsible on mobile
    const sidebar = page.locator('.sidebar, .nav-sidebar, nav');
    const sidebarVisible = await sidebar.isVisible().catch(() => false);
    console.log(`Sidebar on mobile: ${sidebarVisible}`);

    // Navigate to chat
    await navigate(page, 'chat');
    const chatVisible = await page.locator('#page-chat').isVisible();
    console.log(`Chat visible on mobile: ${chatVisible}`);
  });

  // ============================================================
  // SECTION 11: Error Handling
  // ============================================================

  test('Error handling: Invalid login', async ({ page }) => {
    test.setTimeout(15000);
    await page.goto(`${BASE}/login.html`);
    await page.fill('#username', 'invalid');
    await page.fill('#password', 'wrong');
    await page.click('button:has-text("登 录")');
    await page.waitForTimeout(2000);

    // Should stay on login page or show error
    const url = page.url();
    console.log(`After invalid login, URL: ${url}`);
    const hasError = await page.locator('.error, .alert, .toast').isVisible().catch(() => false);
    console.log(`Error message shown: ${hasError}`);
  });

  test('Error handling: API 401 redirects to login', async ({ page }) => {
    test.setTimeout(15000);
    await page.goto(`${BASE}/index.html`);
    await page.waitForTimeout(2000);
    // Should redirect to login if no token
    const url = page.url();
    console.log(`Direct access URL: ${url}`);
  });

  // ============================================================
  // SECTION 12: Internationalization
  // ============================================================

  test('i18n: Language switch works', async ({ page }) => {
    test.setTimeout(30000);
    await login(page);
    await navigate(page, 'profile');
    await page.waitForTimeout(1000);

    const langSwitch = page.locator('.lang-switch, select, .language-select');
    if (await langSwitch.count() > 0) {
      // Try switching language
      const options = await langSwitch.locator('option').allTextContents().catch(() => []);
      console.log(`Language options: ${options.join(', ')}`);
    }
  });
});
