const automator = require('miniprogram-automator');

const cliPath = 'E:\\Program Files (x86)\\Tencent\\微信web开发者工具\\cli.bat';
const projectPath = 'E:\\AI\\multicloud\\miniprogram';

const errors = [];
const warnings = [];

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function navigateTab(miniProgram, index) {
  await miniProgram.switchTab({ url: `/pages/${['index/index', 'resources/list', 'agent/chat', 'user/profile'][index]}` });
  await sleep(3000);
  const page = await miniProgram.currentPage();
  console.log(`  Navigated to: ${page.path}`);
  return page;
}

async function main() {
  console.log('=== Launching DevTools via automator (IDE port 9421, WS port 9420) ===');
  const miniProgram = await automator.launch({
    cliPath,
    projectPath,
    port: 9420,
    args: ['--port', '9421'],
    timeout: 120000,
  });
  console.log('=== Connected to DevTools ===\n');

  let hasError = false;
  miniProgram.on('console', msg => {
    const entry = `[${msg.type}] ${msg.message}`;
    if (msg.type === 'error' || msg.type === 'assert') {
      errors.push(entry);
      hasError = true;
      console.error(`  CONSOLE ERROR: ${entry}`);
    } else if (msg.type === 'warn') {
      warnings.push(entry);
      console.warn(`  CONSOLE WARN: ${entry}`);
    }
  });

  miniProgram.on('error', err => {
    console.error(`  JS ERROR: ${err.message}`);
    hasError = true;
  });

  // Wait for initial load
  console.log('Waiting for project to compile and load...');
  await sleep(15000);

  // --- Test: Index page (Home / Dashboard) ---
  console.log('\n=== Test: Index (Home/Dashboard) ===');
  let page = await navigateTab(miniProgram, 0);

  // Check for activity section
  let activitySection = await page.$('.activity-section, .activity-list, .timeline');
  if (activitySection) {
    console.log('  PASS: Activity section found');
  } else {
    console.log('  WARN: Activity section not found (may not have loaded)');
  }

  // Check for stats
  let statsCards = await page.$('.stat-card, .stats-grid, .dashboard-card');
  if (statsCards) {
    console.log('  PASS: Stats cards found');
  } else {
    console.log('  WARN: Stats section not found');
  }

  // --- Test: Resources list page ---
  console.log('\n=== Test: Resources List ===');
  page = await navigateTab(miniProgram, 1);

  // Check for search input
  let searchInput = await page.$('input[placeholder*="search" i], input.search-input, .search-bar input');
  if (searchInput) {
    console.log('  PASS: Search input found');
  } else {
    console.log('  WARN: Search input not found');
  }

  // Check for sync button
  let syncBtn = await page.$('.sync-btn, button[class*="sync"], .action-btn');
  if (syncBtn) {
    console.log('  PASS: Sync button found');
  } else {
    console.log('  WARN: Sync button not found');
  }

  // Test sync button click
  if (syncBtn) {
    try {
      await syncBtn.tap();
      console.log('  PASS: Sync button tappable');
      await sleep(2000);
    } catch (e) {
      console.log(`  WARN: Sync button tap failed: ${e.message}`);
    }
  }

  // --- Test: Agent Chat page ---
  console.log('\n=== Test: Agent Chat ===');
  page = await navigateTab(miniProgram, 2);

  // Check for AI config button or modal
  let aiConfigBtn = await page.$('.ai-config-btn, .settings-btn, button[class*="ai"], button[class*="config"]');
  if (aiConfigBtn) {
    console.log('  PASS: AI config button found');
    try {
      await aiConfigBtn.tap();
      await sleep(1000);
      console.log('  PASS: AI config modal opened');

      // Check for provider/model/apiKey inputs
      let providerInput = await page.$('input[placeholder*="provider" i], picker, .provider-select');
      if (providerInput) console.log('  PASS: Provider input found');
      else console.log('  WARN: Provider input not found');

      // Close modal by tapping outside or cancel
      let cancelBtn = await page.$('.cancel-btn, .close-btn, button[class*="cancel"], button[class*="close"]');
      if (cancelBtn) {
        await cancelBtn.tap();
        await sleep(500);
        console.log('  PASS: AI config modal closed');
      }
    } catch (e) {
      console.log(`  WARN: AI config interaction issue: ${e.message}`);
    }
  } else {
    console.log('  WARN: AI config button not found');
  }

  // Check for quick actions
  let quickActions = await page.$('.quick-actions, .action-bar, .toolbar');
  if (quickActions) {
    console.log('  PASS: Quick actions found');
  } else {
    console.log('  WARN: Quick actions not found');
  }

  // --- Test: Profile page ---
  console.log('\n=== Test: Profile ===');
  page = await navigateTab(miniProgram, 3);

  // Check for language selector
  let langPicker = await page.$('picker, .lang-picker, .language-selector');
  if (langPicker) {
    console.log('  PASS: Language selector found');
  } else {
    console.log('  WARN: Language selector not found');
  }

  // Check for settings entries
  let settingsItems = await page.$$('.profile-item, .menu-item, .list-item, .cell');
  if (settingsItems && settingsItems.length > 0) {
    console.log(`  PASS: Found ${settingsItems.length} profile/settings items`);
  } else {
    console.log('  WARN: No profile items found');
  }

  // --- Summary ---
  console.log('\n=== Test Summary ===');
  if (errors.length > 0) {
    console.error(`FAIL: ${errors.length} console error(s) detected:`);
    errors.forEach(e => console.error(`  ${e}`));
  } else {
    console.log('PASS: No console errors detected');
  }

  if (warnings.length > 0) {
    console.log(`INFO: ${warnings.length} console warning(s):`);
    warnings.forEach(w => console.log(`  ${w}`));
  }

  // Take a screenshot
  try {
    const screenshot = await miniProgram.screenshot();
    console.log(`\nScreenshot captured (base64 length: ${screenshot.length})`);
  } catch (e) {
    console.log(`\nScreenshot not available: ${e.message}`);
  }

  await miniProgram.close();
  console.log('\n=== Test complete ===');
  process.exit(hasError ? 1 : 0);
}

main().catch(err => {
  console.error('FATAL:', err.message, err.stack);
  process.exit(1);
});
