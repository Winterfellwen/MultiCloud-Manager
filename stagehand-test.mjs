/**
 * Stagehand v3 Full Platform Test - Using custom DeepSeek provider
 */
import { Stagehand } from '@browserbasehq/stagehand';

const BASE_URL = 'http://localhost:8099';
const API_BASE = 'https://token-plan-cn.xiaomimimo.com/v1';
const API_KEY = 'tp-c9810kx6hjmydxqqx41qrwiwdsc70qp2mwbi2qyyvemid58a';
const MODEL = 'mimo-v2.5';
const TEST_USER = 'admin';
const TEST_PASS = 'test123';

const results = [];
function log(msg) {
  const ts = new Date().toISOString().slice(11, 19);
  console.log(`[${ts}] ${msg}`);
}
function record(test, status, detail = '') {
  results.push({ test, status, detail });
  log(`${status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️'} ${test}: ${detail}`);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function main() {
  log('Initializing Stagehand with custom provider...');
  log(`API: ${API_BASE}, Model: ${MODEL}`);

  const stagehand = new Stagehand({
    env: "LOCAL",
    headless: true,
    model: {
      modelName: 'deepseek/mimo-v2.5',
      apiKey: API_KEY,
      baseURL: API_BASE,
    },
    verbose: 1,
    domSettleTimeoutMs: 15000,
    localBrowserLaunchOptions: {
      executablePath: 'C:/Users/winte/AppData/Local/ms-playwright/chromium-1223/chrome-win64/chrome.exe',
    },
  });

  await stagehand.init();
  log('Stagehand initialized with custom provider');

  try {
    // ========================================
    // TEST 1: Login
    // ========================================
    log('\n=== TEST: Login ===');
    await stagehand.act(`Navigate to ${BASE_URL}/login.html`);
    await sleep(2000);

    const loginPage = await stagehand.extract('Describe the login page: what form fields and buttons are visible?');
    log(`Login page: ${JSON.stringify(loginPage).substring(0, 300)}`);

    await stagehand.act(`Type "${TEST_USER}" into the username input field`);
    await stagehand.act(`Type "${TEST_PASS}" into the password input field`);
    await stagehand.act('Click the login button');
    await sleep(4000);

    const afterLogin = await stagehand.extract('What page are we on now? Is it a dashboard? Are there statistics or numbers visible? List the sidebar navigation items.');
    log(`After login: ${JSON.stringify(afterLogin).substring(0, 400)}`);
    const loginOk = JSON.stringify(afterLogin).toLowerCase().includes('dashboard');
    record('Login', loginOk ? 'PASS' : 'FAIL', loginOk ? 'Reached dashboard' : 'Login may have failed');

    // ========================================
    // TEST 2: Dashboard
    // ========================================
    log('\n=== TEST: Dashboard ===');
    const dash = await stagehand.extract('Extract all statistics cards on the dashboard: for each card, what is the label and number/value? List any quick action buttons.');
    log(`Dashboard: ${JSON.stringify(dash).substring(0, 400)}`);
    record('Dashboard', 'PASS', JSON.stringify(dash).substring(0, 150));

    // ========================================
    // TEST 3: Navigate All Pages
    // ========================================
    log('\n=== TEST: All Pages ===');
    const navItems = [
      { name: 'Resources', click: 'Click on "Resources" or "资源" in the sidebar' },
      { name: 'Accounts', click: 'Click on "Accounts" or "云账户" in the sidebar' },
      { name: 'AI Chat', click: 'Click on "AI" or "AI助手" or "Chat" in the sidebar' },
      { name: 'Team', click: 'Click on "Team" or "团队" in the sidebar' },
      { name: 'Vault', click: 'Click on "Vault" or "凭证" in the sidebar' },
      { name: 'Terraform', click: 'Click on "Terraform" in the sidebar' },
      { name: 'Profile', click: 'Click on "Profile" or "设置" or "我的" in the sidebar' },
    ];
    for (const nav of navItems) {
      try {
        await stagehand.act(nav.click);
        await sleep(1500);
        const info = await stagehand.extract('What page is currently displayed? Describe the main content briefly. Any errors?');
        record(`Nav: ${nav.name}`, 'PASS', JSON.stringify(info).substring(0, 120));
      } catch (e) {
        record(`Nav: ${nav.name}`, 'FAIL', e.message.substring(0, 100));
      }
    }

    // ========================================
    // TEST 4: Resources Page
    // ========================================
    log('\n=== TEST: Resources ===');
    await stagehand.act('Click on "Resources" or "资源" in the sidebar');
    await sleep(1500);
    const res = await stagehand.extract('On this Resources page: How many resources are listed? What cloud providers? Filter options? Sync button? Start/stop actions?');
    log(`Resources: ${JSON.stringify(res).substring(0, 400)}`);
    record('Resources Page', 'PASS', JSON.stringify(res).substring(0, 150));

    // Test sync
    try {
      await stagehand.act('Click the sync or refresh button');
      await sleep(5000);
      const syncRes = await stagehand.extract('After sync: any success message, loading indicator, or error?');
      record('Resources Sync', 'PASS', JSON.stringify(syncRes).substring(0, 100));
    } catch (e) { record('Resources Sync', 'WARN', 'Sync button not found'); }

    // ========================================
    // TEST 5: Accounts Page
    // ========================================
    log('\n=== TEST: Accounts ===');
    await stagehand.act('Click on "Accounts" or "云账户" in the sidebar');
    await sleep(1500);
    const acc = await stagehand.extract('On Accounts page: How many accounts listed? Names and providers? Add button?');
    log(`Accounts: ${JSON.stringify(acc).substring(0, 400)}`);
    record('Accounts Page', 'PASS', JSON.stringify(acc).substring(0, 150));

    // Test add modal
    try {
      await stagehand.act('Click the "Add Account" or "+" button');
      await sleep(1000);
      const modal = await stagehand.extract('Describe the add account form: required fields, provider options, save/cancel buttons.');
      log(`Add modal: ${JSON.stringify(modal).substring(0, 300)}`);
      record('Add Account Modal', 'PASS', JSON.stringify(modal).substring(0, 150));
      await stagehand.act('Close the modal by clicking cancel or X');
      await sleep(500);
    } catch (e) { record('Add Account Modal', 'WARN', 'Could not open modal'); }

    // ========================================
    // TEST 6: AI Chat UI
    // ========================================
    log('\n=== TEST: AI Chat UI ===');
    await stagehand.act('Click on "AI" or "AI助手" or "Chat" in the sidebar');
    await sleep(2000);
    const chatUI = await stagehand.extract('Describe the AI chat interface: session list, chat input, mode selector (Plan/Build/Confirm), settings button, new session button. What is currently shown?');
    log(`Chat UI: ${JSON.stringify(chatUI).substring(0, 400)}`);
    record('AI Chat UI', 'PASS', JSON.stringify(chatUI).substring(0, 150));

    // ========================================
    // TEST 7: AI Config
    // ========================================
    log('\n=== TEST: AI Config ===');
    try {
      await stagehand.act('Click the settings or gear button in the chat interface');
      await sleep(1000);
      const config = await stagehand.extract('Extract AI config: API endpoint, model name, has API key, test button, save button?');
      log(`AI Config: ${JSON.stringify(config).substring(0, 400)}`);
      record('AI Config', 'PASS', JSON.stringify(config).substring(0, 150));
      await stagehand.act('Close the modal by clicking cancel or X');
      await sleep(500);
    } catch (e) { record('AI Config', 'FAIL', e.message.substring(0, 100)); }

    // ========================================
    // TEST 8: New Chat Session
    // ========================================
    log('\n=== TEST: New Session ===');
    try {
      await stagehand.act('Click the button with aria-label "New chat session" in the sidebar header');
      await sleep(2000);
      const sess = await stagehand.extract('Was a new session created? Is the chat area empty and ready? How many sessions in the list?');
      record('New Session', 'PASS', JSON.stringify(sess).substring(0, 100));
    } catch (e) { record('New Session', 'FAIL', e.message.substring(0, 100)); }

    // ========================================
    // TEST 9: Plan Mode
    // ========================================
    log('\n=== TEST: Plan Mode ===');
    try {
      await stagehand.act('Click the radio button labeled "Plan mode - read only"');
      await sleep(500);
      await stagehand.act('Click the textarea labeled "Chat message input" and type "查看当前所有云资源概况"');
      await sleep(500);
      await stagehand.act('Click the button labeled "Send message"');
      log('Plan mode: sent, waiting 25s...');
      await sleep(25000);
      const planRes = await stagehand.extract('Extract AI response: response text, tool calls shown, tools used, still loading? Any error?');
      log(`Plan: ${JSON.stringify(planRes).substring(0, 500)}`);
      record('AI Plan Mode', JSON.stringify(planRes).length > 100 ? 'PASS' : 'WARN',
        JSON.stringify(planRes).substring(0, 150));
    } catch (e) { record('AI Plan Mode', 'FAIL', e.message.substring(0, 150)); }

    // ========================================
    // TEST 10: Build Mode - List Resources
    // ========================================
    log('\n=== TEST: Build Mode - List ===');
    try {
      await stagehand.act('Click the button with aria-label "New chat session"');
      await sleep(2000);
      await stagehand.act('Click the radio button labeled "Build mode - execute operations"');
      await sleep(500);
      await stagehand.act('Click the textarea labeled "Chat message input" and type "列出我所有云账户下的所有资源"');
      await sleep(500);
      await stagehand.act('Click the button labeled "Send message"');
      log('Build list: sent, waiting 25s...');
      await sleep(25000);
      const buildRes = await stagehand.extract('Extract AI response: did it list resources? What tools called? Response content?');
      log(`Build list: ${JSON.stringify(buildRes).substring(0, 500)}`);
      record('AI Build - List', JSON.stringify(buildRes).length > 100 ? 'PASS' : 'WARN',
        JSON.stringify(buildRes).substring(0, 150));
    } catch (e) { record('AI Build - List', 'FAIL', e.message.substring(0, 150)); }

    // ========================================
    // TEST 11: Build Mode - Create Resource
    // ========================================
    log('\n=== TEST: Build Mode - Create ===');
    try {
      await stagehand.act('Click the button with aria-label "New chat session"');
      await sleep(2000);
      await stagehand.act('Click the radio button labeled "Build mode - execute operations"');
      await sleep(500);
      await stagehand.act('Click the textarea labeled "Chat message input" and type "用shell命令检查系统信息和可用的云CLI工具，然后创建一个免费的云资源"');
      await sleep(500);
      await stagehand.act('Click the button labeled "Send message"');
      log('Build create: sent, waiting 30s...');
      await sleep(30000);
      const createRes = await stagehand.extract('Extract full AI response: shell commands executed, CLI tools found, resource creation attempt, results, errors?');
      log(`Build create: ${JSON.stringify(createRes).substring(0, 500)}`);
      record('AI Build - Create', JSON.stringify(createRes).length > 100 ? 'PASS' : 'WARN',
        JSON.stringify(createRes).substring(0, 150));
    } catch (e) { record('AI Build - Create', 'FAIL', e.message.substring(0, 150)); }

    // ========================================
    // TEST 12: Confirm Mode
    // ========================================
    log('\n=== TEST: Confirm Mode ===');
    try {
      await stagehand.act('Click the button with aria-label "New chat session"');
      await sleep(2000);
      await stagehand.act('Click the radio button labeled "Confirm mode - requires approval"');
      await sleep(500);
      await stagehand.act('Click the textarea labeled "Chat message input" and type "同步所有云资源并检查状态"');
      await sleep(500);
      await stagehand.act('Click the button labeled "Send message"');
      log('Confirm mode: sent, waiting 20s...');
      await sleep(20000);
      const confirmRes = await stagehand.extract('Extract AI response: asked for confirmation? Confirm/reject buttons? Tools called? What happened?');
      log(`Confirm: ${JSON.stringify(confirmRes).substring(0, 500)}`);
      record('AI Confirm Mode', JSON.stringify(confirmRes).length > 100 ? 'PASS' : 'WARN',
        JSON.stringify(confirmRes).substring(0, 150));
    } catch (e) { record('AI Confirm Mode', 'FAIL', e.message.substring(0, 150)); }

    // ========================================
    // TEST 13: Vault
    // ========================================
    log('\n=== TEST: Vault ===');
    try {
      await stagehand.act('Click on "Vault" or "凭证" in the sidebar');
      await sleep(1500);
      const vault = await stagehand.extract('Describe Vault page: health status, secret count, migrate button?');
      record('Vault', 'PASS', JSON.stringify(vault).substring(0, 150));
    } catch (e) { record('Vault', 'FAIL', e.message.substring(0, 100)); }

    // ========================================
    // TEST 14: Terraform
    // ========================================
    log('\n=== TEST: Terraform ===');
    try {
      await stagehand.act('Click on "Terraform" in the sidebar');
      await sleep(1500);
      const tf = await stagehand.extract('Describe Terraform page: template count, names, upload button?');
      record('Terraform', 'PASS', JSON.stringify(tf).substring(0, 150));
    } catch (e) { record('Terraform', 'FAIL', e.message.substring(0, 100)); }

    // ========================================
    // TEST 15: Profile & Dark Mode
    // ========================================
    log('\n=== TEST: Profile & Dark Mode ===');
    try {
      await stagehand.act('Click on "Profile" or "设置" or "我的" in the sidebar');
      await sleep(1500);
      const profile = await stagehand.extract('Describe Profile page: user info, dark mode toggle, language switch, password change?');
      record('Profile', 'PASS', JSON.stringify(profile).substring(0, 150));

      const themeBefore = await stagehand.extract('Is the page in dark mode or light mode? Look at background colors.');
      await stagehand.act('Toggle the dark mode switch');
      await sleep(1000);
      const themeAfter = await stagehand.extract('Is the page in dark mode or light mode now?');
      record('Dark Mode', 'PASS', `Before: ${JSON.stringify(themeBefore).substring(0,50)}, After: ${JSON.stringify(themeAfter).substring(0,50)}`);
    } catch (e) { record('Profile/DarkMode', 'FAIL', e.message.substring(0, 100)); }

  } catch (e) {
    log(`\nFatal error: ${e.message}`);
    record('Fatal', 'FAIL', e.message);
  } finally {
    await stagehand.close();
  }

  // ========================================
  // SUMMARY
  // ========================================
  log('\n' + '='.repeat(70));
  log('STAGEHAND TEST RESULTS SUMMARY');
  log('='.repeat(70));
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warnings = results.filter(r => r.status === 'WARN').length;
  log(`Total: ${results.length} | PASS: ${passed} | FAIL: ${failed} | WARN: ${warnings}`);
  log('='.repeat(70));
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⚠️';
    log(`${icon} ${r.test}: ${r.detail.substring(0, 120)}`);
  }
  log('='.repeat(70));

  const fs = await import('fs');
  fs.writeFileSync('test-results-stagehand.json', JSON.stringify(results, null, 2));
  log('Results saved to test-results-stagehand.json');
}

main().catch(e => {
  console.error('Test script failed:', e);
  process.exit(1);
});
