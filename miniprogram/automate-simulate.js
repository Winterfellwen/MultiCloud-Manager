const automator = require('miniprogram-automator');
const fs = require('fs');
const path = require('path');

const WS_ENDPOINT = 'ws://localhost:9420';
const OUTPUT_DIR = path.join(__dirname, 'simulation-results');
const SCREENSHOT_DIR = path.join(OUTPUT_DIR, 'screenshots');

const results = {
  sessions: [],
  interactions: [],
  errors: []
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function safeFind(page, selector, index) {
  const els = await page.$$(selector);
  return els.length > 0 ? els[Math.min(index || 0, els.length - 1)] : null;
}

async function safeTap(page, selector, index) {
  const el = await safeFind(page, selector, index);
  if (el) { await el.tap(); return true; }
  return false;
}

async function safeInput(page, selector, text, index) {
  const el = await safeFind(page, selector, index);
  if (el) { await el.input(text); return true; }
  return false;
}

async function safeText(page, selector, index) {
  const el = await safeFind(page, selector, index);
  if (el) { return await el.text(); }
  return null;
}

async function takeScreenshot(miniProgram, label) {
  try {
    const base64 = await miniProgram.screenshot();
    const filepath = path.join(SCREENSHOT_DIR, `${label}.png`);
    fs.writeFileSync(filepath, Buffer.from(base64, 'base64'));
    return filepath;
  } catch (e) {
    return `(screenshot error: ${e.message})`;
  }
}

async function captureState(miniProgram, label) {
  const state = { label, screenshot: null, data: null, wxml: null, elements: {} };
  try {
    state.screenshot = await takeScreenshot(miniProgram, label);
    const page = await miniProgram.currentPage();
    try { state.data = await page.data(); } catch (e) { state.data = `(error: ${e.message})`; }
    const buttons = await page.$$('button');
    const btnTexts = [];
    for (const b of buttons.slice(0, 8)) {
      try { btnTexts.push(await b.text()); } catch (e) {}
    }
    state.elements.buttons = btnTexts;
    const inputs = await page.$$('input');
    const inputInfo = [];
    for (const inp of inputs.slice(0, 5)) {
      try {
        const pl = await inp.attribute('placeholder');
        const val = await inp.value();
        inputInfo.push({ placeholder: pl, value: val });
      } catch (e) {}
    }
    state.elements.inputs = inputInfo;
  } catch (e) { state.error = e.message; }
  return state;
}

async function simulateHomePage(miniProgram) {
  console.log('\n=== Simulating: Home Page (index/index) ===');
  const log = [];

  await miniProgram.switchTab('/pages/index/index');
  await sleep(2000);

  let state = await captureState(miniProgram, '01-home-initial');
  log.push({ action: 'navigate_to_home', state });

  const navigators = ['☁️', '👤', '📦', '👥'];
  for (const navLabel of navigators) {
    const views = await miniProgram.currentPage().then(p => p.$$('navigator'));
    let tapped = false;
    for (const v of views) {
      try {
        const txt = await v.text();
        if (txt.includes(navLabel)) {
          await v.tap();
          await sleep(2000);
          const p = await miniProgram.currentPage();
          log.push({ action: `tap_nav_${navLabel}`, page: p.path });
          state = await captureState(miniProgram, `02-nav-${navLabel.charCodeAt(0)}`);
          log.push({ action: `navigated_from_home`, state });
          // go back to home
          await miniProgram.switchTab('/pages/index/index');
          await sleep(1500);
          tapped = true;
          break;
        }
      } catch (e) {}
    }
    if (!tapped) {
      log.push({ action: `tap_nav_${navLabel}`, error: 'navigator not found' });
    }
  }

  return log;
}

async function simulateChatPage(miniProgram) {
  console.log('\n=== Simulating: Chat Page (agent/chat) ===');
  const log = [];

  await miniProgram.switchTab('/pages/agent/chat');
  await sleep(2000);

  let state = await captureState(miniProgram, '10-chat-initial');
  log.push({ action: 'navigate_to_chat', state });

  // Type a message
  const typed = await safeInput(await miniProgram.currentPage(), 'input', '列出所有腾讯云资源');
  if (typed) {
    await sleep(500);
    log.push({ action: 'type_message' });
    state = await captureState(miniProgram, '11-chat-typed');
    log.push({ action: 'message_typed', state });

    // Tap send button
    const sent = await safeTap(await miniProgram.currentPage(), 'button.send-btn');
    if (sent) {
      await sleep(2000);
      log.push({ action: 'tap_send' });
      state = await captureState(miniProgram, '12-chat-sent');
      log.push({ action: 'message_sent', state });
    }
  }

  // Toggle quick actions
  const qaToggled = await safeTap(await miniProgram.currentPage(), '.header-btn');
  if (qaToggled) {
    await sleep(800);
    log.push({ action: 'toggle_quick_actions' });
    state = await captureState(miniProgram, '13-chat-quick-actions');
    log.push({ action: 'quick_actions_open', state });

    // Tap "Config" button (3rd button in quick actions)
    const configBtns = await (await miniProgram.currentPage()).$$('.qa-btn');
    for (const btn of configBtns) {
      try {
        const txt = await btn.text();
        if (txt.includes('Config') || txt.includes('配置')) {
          await btn.tap();
          await sleep(1000);
          log.push({ action: 'tap_open_config' });
          break;
        }
      } catch (e) {}
    }

    // Fill config form
    state = await captureState(miniProgram, '14-chat-config-open');
    log.push({ action: 'config_modal_open', state });

    // Fill config provider (first input in modal)
    const inputs = await (await miniProgram.currentPage()).$$('input');
    let configInputCount = 0;
    for (const inp of inputs) {
      try {
        const pl = await inp.attribute('placeholder');
        if (pl && (pl.includes('provider') || pl.includes('提供商'))) {
          await inp.input('OpenRouter');
          configInputCount++;
          await sleep(300);
        } else if (pl && (pl.includes('model') || pl.includes('模型'))) {
          await inp.input('gpt-4');
          configInputCount++;
          await sleep(300);
        } else if (pl && (pl.includes('key') || pl.includes('API'))) {
          await inp.input('sk-test-key-12345');
          configInputCount++;
          await sleep(300);
        }
      } catch (e) {}
    }
    log.push({ action: 'fill_config_fields', count: configInputCount });
    state = await captureState(miniProgram, '15-chat-config-filled');
    log.push({ action: 'config_filled', state });

    // Tap save button
    const saved = await safeTap(await miniProgram.currentPage(), '.config-save-btn');
    if (saved) {
      await sleep(1000);
      log.push({ action: 'save_config' });
      state = await captureState(miniProgram, '16-chat-config-saved');
      log.push({ action: 'config_saved', state });
    }

    // Toggle quick actions again to close
    await safeTap(await miniProgram.currentPage(), '.header-btn');
    await sleep(500);
    log.push({ action: 'close_quick_actions' });
  }

  // Change execution mode via picker
  try {
    const page = await miniProgram.currentPage();
    const picker = await safeFind(page, 'picker.mode-picker');
    if (picker) {
      // Use setData to change mode directly
      await page.callMethod('onModeChange', { detail: { value: 'auto_execute' } });
      await sleep(500);
      log.push({ action: 'set_execution_mode_auto' });
    }
  } catch (e) {
    log.push({ action: 'set_execution_mode', error: e.message });
  }

  return log;
}

async function simulateResourcesPage(miniProgram) {
  console.log('\n=== Simulating: Resources Page (resources/list) ===');
  const log = [];

  await miniProgram.switchTab('/pages/resources/list');
  await sleep(2000);

  let state = await captureState(miniProgram, '20-resources-initial');
  log.push({ action: 'navigate_to_resources', state });

  // Type in search
  const page = await miniProgram.currentPage();
  const searchInput = await safeFind(page, 'input.search-input');
  if (searchInput) {
    // Type character by character to simulate real input
    await searchInput.input('azure');
    await sleep(800);
    log.push({ action: 'type_search_azure' });
    state = await captureState(miniProgram, '21-resources-search');
    log.push({ action: 'search_typed', state });
  }

  // Clear search
  if (searchInput) {
    await searchInput.input('');
    await sleep(500);
    log.push({ action: 'clear_search' });
  }

  // Try sync button
  const syncBtn = await safeFind(await miniProgram.currentPage(), 'button.sync-btn');
  if (syncBtn) {
    try {
      const disabled = await syncBtn.attribute('disabled');
      if (disabled !== 'true' && disabled !== '') {
        await syncBtn.tap();
        await sleep(2000);
        log.push({ action: 'tap_sync' });
        state = await captureState(miniProgram, '22-resources-syncing');
        log.push({ action: 'sync_triggered', state });
        await sleep(2000);
      } else {
        log.push({ action: 'tap_sync', error: 'button disabled' });
      }
    } catch (e) {
      log.push({ action: 'tap_sync', error: e.message });
    }
  }

  // Change cloud filter via picker
  try {
    const cloudPicker = await safeFind(await miniProgram.currentPage(), 'picker.filter-picker');
    if (cloudPicker) {
      await cloudPicker.tap();
      await sleep(500);
      log.push({ action: 'tap_cloud_filter' });
    }
  } catch (e) {
    log.push({ action: 'cloud_filter', error: e.message });
  }

  return log;
}

async function simulateProfilePage(miniProgram) {
  console.log('\n=== Simulating: Profile Page (user/profile) ===');
  const log = [];

  await miniProgram.switchTab('/pages/user/profile');
  await sleep(2000);

  let state = await captureState(miniProgram, '30-profile-initial');
  log.push({ action: 'navigate_to_profile', state });

  // Toggle dark mode switch
  const page = await miniProgram.currentPage();
  const switches = await page.$$('switch');
  if (switches.length > 0) {
    // Toggle the first switch (dark mode)
    try {
      const checked = await switches[0].attribute('checked');
      await switches[0].tap();
      await sleep(800);
      log.push({ action: 'toggle_dark_mode', from: checked === 'true' ? 'dark' : 'light' });
      state = await captureState(miniProgram, '31-profile-dark-toggled');
      log.push({ action: 'dark_mode_toggled', state });

      // Toggle back
      await switches[0].tap();
      await sleep(500);
      log.push({ action: 'toggle_dark_mode_back' });
    } catch (e) {
      log.push({ action: 'toggle_dark_mode', error: e.message });
    }

    // Toggle notifications (2nd switch)
    if (switches.length > 1) {
      try {
        await switches[1].tap();
        await sleep(500);
        log.push({ action: 'toggle_notifications' });
      } catch (e) {
        log.push({ action: 'toggle_notifications', error: e.message });
      }
    }
  }

  // Tap on team management navigator
  const navItems = await page.$$('navigator');
  for (const nav of navItems) {
    try {
      const txt = await nav.text();
      if (txt.includes('Team') || txt.includes('团队')) {
        await nav.tap();
        await sleep(2000);
        const newPage = await miniProgram.currentPage();
        log.push({ action: 'tap_team_nav', result: newPage.path });
        // Go back to profile
        if (newPage.path.includes('team')) {
          await miniProgram.navigateBack();
          await sleep(1500);
        } else {
          await miniProgram.switchTab('/pages/user/profile');
          await sleep(1500);
        }
        break;
      }
    } catch (e) {}
  }

  return log;
}

async function simulateTerraformUpload(miniProgram) {
  console.log('\n=== Simulating: Terraform Upload (terraform/upload) ===');
  const log = [];

  // Navigate via terraform list first, then upload
  await miniProgram.redirectTo('/pages/terraform/list');
  await sleep(2000);

  let page = await miniProgram.currentPage();
  if (page.path === 'pages/terraform/list') {
    log.push({ action: 'navigate_to_terraform_list' });
    let state = await captureState(miniProgram, '40-terraform-list');
    log.push({ action: 'terraform_list', state });

    // Try to navigate to upload via navigators
    const navs = await page.$$('navigator');
    let uploadReached = false;
    for (const nav of navs) {
      try {
        const url = await nav.attribute('url');
        if (url && (url.includes('upload'))) {
          await nav.tap();
          await sleep(2000);
          uploadReached = true;
          break;
        }
      } catch (e) {}
    }

    if (!uploadReached) {
      // Direct navigate
      await miniProgram.redirectTo('/pages/terraform/upload');
      await sleep(2000);
    }
  } else {
    // Already on upload or direct navigate
    await miniProgram.redirectTo('/pages/terraform/upload');
    await sleep(2000);
  }

  let state = await captureState(miniProgram, '41-upload-initial');
  log.push({ action: 'navigate_to_upload', state });

  page = await miniProgram.currentPage();

  // Tap file picker area
  const uploadArea = await safeFind(page, '.upload-area');
  if (uploadArea) {
    await uploadArea.tap();
    await sleep(1000);
    log.push({ action: 'tap_file_picker' });
  }

  // Fill config name
  const nameInput = await safeFind(page, '.form-input');
  if (nameInput) {
    await nameInput.input('我的Terraform配置');
    await sleep(500);
    log.push({ action: 'fill_config_name' });
    state = await captureState(miniProgram, '42-upload-name-filled');
    log.push({ action: 'config_name_filled', state });
  }

  // Tap provider picker
  const picker = await safeFind(page, 'picker.form-picker');
  if (picker) {
    try {
      // Use callMethod to change provider
      await page.callMethod('onProviderChange', { detail: { value: '2' } }); // Oracle
      await sleep(500);
      log.push({ action: 'change_provider' });
    } catch (e) {
      log.push({ action: 'change_provider', error: e.message });
    }
  }

  // Try to tap submit button
  const submitBtn = await safeFind(page, 'button.btn-submit');
  if (submitBtn) {
    // Button only shows when fileName is set, but let's try
    try {
      await submitBtn.tap();
      await sleep(1000);
      log.push({ action: 'tap_submit' });
      state = await captureState(miniProgram, '43-upload-submitted');
      log.push({ action: 'upload_submitted', state });
    } catch (e) {
      log.push({ action: 'tap_submit', error: e.message });
    }
  }

  return log;
}

async function simulateTabNavigation(miniProgram) {
  console.log('\n=== Simulating: Tab Bar Navigation ===');
  const log = [];

  const tabs = [
    { label: 'home', path: '/pages/index/index' },
    { label: 'chat', path: '/pages/agent/chat' },
    { label: 'resources', path: '/pages/resources/list' },
    { label: 'profile', path: '/pages/user/profile' }
  ];

  // Switch between all tabs in sequence
  for (const tab of tabs) {
    console.log(`  Switching to tab: ${tab.label}`);
    try {
      await miniProgram.switchTab(tab.path);
      await sleep(2000);
      const page = await miniProgram.currentPage();
      log.push({ action: `switch_tab_${tab.label}`, page: page.path });
      const state = await captureState(miniProgram, `tab-${tab.label}`);
      log.push({ action: `tab_${tab.label}_loaded`, state });
    } catch (e) {
      log.push({ action: `switch_tab_${tab.label}`, error: e.message });
    }
  }

  return log;
}

async function main() {
  console.log('=== WeChat Miniprogram Simulation ===\n');
  console.log(`Connecting to ${WS_ENDPOINT}...`);

  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const miniProgram = await automator.connect({ wsEndpoint: WS_ENDPOINT });
  console.log('Connected!\n');

  try {
    const info = await miniProgram.systemInfo();
    console.log(`System: ${info.platform} ${info.system}, model=${info.model}, SDK=${info.SDKVersion}\n`);
  } catch (e) {
    console.log(`System info: ${e.message}\n`);
  }

  // Run simulations
  try {
    const tabNavLog = await simulateTabNavigation(miniProgram);
    results.sessions.push({ name: 'tab_navigation', interactions: tabNavLog });
    results.interactions.push(...tabNavLog);
  } catch (e) {
    results.errors.push({ session: 'tab_navigation', error: e.message });
  }

  try {
    const homeLog = await simulateHomePage(miniProgram);
    results.sessions.push({ name: 'home_page', interactions: homeLog });
    results.interactions.push(...homeLog);
  } catch (e) {
    results.errors.push({ session: 'home_page', error: e.message });
  }

  try {
    const chatLog = await simulateChatPage(miniProgram);
    results.sessions.push({ name: 'chat_page', interactions: chatLog });
    results.interactions.push(...chatLog);
  } catch (e) {
    results.errors.push({ session: 'chat_page', error: e.message });
  }

  try {
    const resourcesLog = await simulateResourcesPage(miniProgram);
    results.sessions.push({ name: 'resources_page', interactions: resourcesLog });
    results.interactions.push(...resourcesLog);
  } catch (e) {
    results.errors.push({ session: 'resources_page', error: e.message });
  }

  try {
    const profileLog = await simulateProfilePage(miniProgram);
    results.sessions.push({ name: 'profile_page', interactions: profileLog });
    results.interactions.push(...profileLog);
  } catch (e) {
    results.errors.push({ session: 'profile_page', error: e.message });
  }

  try {
    const terraformLog = await simulateTerraformUpload(miniProgram);
    results.sessions.push({ name: 'terraform_upload', interactions: terraformLog });
    results.interactions.push(...terraformLog);
  } catch (e) {
    results.errors.push({ session: 'terraform_upload', error: e.message });
  }

  // Summary
  console.log('\n=== Simulation Summary ===');
  const totalActions = results.interactions.filter(i => !i.state).length;
  const totalStates = results.interactions.filter(i => i.state).length;
  console.log(`Total actions: ${totalActions}`);
  console.log(`Total state captures: ${totalStates}`);
  console.log(`Errors: ${results.errors.length}`);
  if (results.errors.length > 0) {
    console.log('Errors:');
    results.errors.forEach(e => console.log(`  - [${e.session}] ${e.error}`));
  }

  const report = {
    timestamp: new Date().toISOString(),
    wsEndpoint: WS_ENDPOINT,
    sessions: results.sessions.map(s => ({
      name: s.name,
      actionCount: s.interactions.filter(i => !i.state).length,
      stateCount: s.interactions.filter(i => i.state).length,
      actions: s.interactions.filter(i => !i.state).map(i => ({
        action: i.action,
        result: i.page || i.error || null
      }))
    })),
    errors: results.errors
  };

  const reportPath = path.join(OUTPUT_DIR, 'simulation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\nReport: ${reportPath}`);

  miniProgram.disconnect();
  console.log('Done!');
}

main().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
