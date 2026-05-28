const automator = require('miniprogram-automator');
const fs = require('fs');
const path = require('path');

const WS_ENDPOINT = 'ws://localhost:9420';
const OUTPUT_DIR = path.join(__dirname, 'automation-results');

const TAB_PAGES = ['/pages/index/index', '/pages/agent/chat', '/pages/resources/list', '/pages/user/profile'];
const SUB_PAGES = ['/pages/resources/detail', '/pages/accounts/list', '/pages/accounts/add', '/pages/team/members', '/pages/terraform/list', '/pages/terraform/upload'];
const ALL_PAGES = [...TAB_PAGES, ...SUB_PAGES];

const results = { pages: {}, summary: { total: 0, success: 0, failed: 0, soft_fail: 0, errors: [] } };

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function safePageQuery(page, selector) {
  try { return await page.$$(selector); } catch (e) { return []; }
}

async function scanPage(miniProgram, pagePath, label) {
  console.log(`\n=== Scanning: ${label} (${pagePath}) ===`);
  const entry = { path: pagePath, label, elements: {}, interactions: [], data: null, screenshot: null, wxml: null, error: null };

  try {
    const isTab = TAB_PAGES.includes(pagePath);
    const navFn = isTab ? miniProgram.switchTab.bind(miniProgram) : miniProgram.redirectTo.bind(miniProgram);
    await Promise.race([
      navFn(pagePath),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000))
    ]);
    await sleep(2000);

    const page = await miniProgram.currentPage();
    entry.path = page.path;
    console.log(`  Page: ${page.path}`);

    try { entry.data = await page.data(); } catch (e) { entry.data = `(data error: ${e.message})`; }

    // Screenshot
    try {
      const base64 = await miniProgram.screenshot();
      entry.screenshot = base64.substring(0, 60) + '...';
      const imgPath = path.join(OUTPUT_DIR, `ss-${label.replace(/\//g, '_')}.png`);
      fs.writeFileSync(imgPath, Buffer.from(base64, 'base64'));
      console.log(`  Screenshot saved`);
    } catch (e) { console.log(`  Screenshot: ${e.message}`); }

    // Get page-level WXML by querying known-safe selectors
    const pageEl = await page.$('page');
    let wxmlStr = '';
    if (pageEl) {
      try { wxmlStr = await pageEl.outerWxml(); } catch (e) { /* ignore */ }
    } else {
      // fallback: try to get any known-safe elements
      for (const sel of ['.container', '.page', 'view', 'scroll-view', 'swiper']) {
        const els = await safePageQuery(page, sel);
        if (els.length > 0) {
          try { wxmlStr = await els[0].outerWxml(); } catch (e) { /* ignore */ }
          break;
        }
      }
    }
    if (!wxmlStr) {
      // Last resort: get root via evaluate
      try { wxmlStr = await miniProgram.evaluate(() => document.documentElement.outerHTML); } catch (e) { /* nope */ }
    }
    entry.wxml = wxmlStr ? wxmlStr.substring(0, 3000) : '(no wxml)';
    console.log(`  WXML length: ${wxmlStr ? wxmlStr.length : 0}`);

    // Scan elements by safe selectors
    const buttons = [], inputs = [], texts = [], images = [];

    // Query specific element types
    for (const el of await safePageQuery(page, 'button')) {
      try {
        const txt = await el.text();
        const cls = await el.attribute('class') || '';
        const disabled = await el.attribute('disabled');
        buttons.push({ text: txt.substring(0, 60), class: cls.substring(0, 30), disabled: disabled === 'true' || disabled === '' });
      } catch (e) { /* skip */ }
    }
    for (const el of await safePageQuery(page, 'input')) {
      try {
        const placeholder = await el.attribute('placeholder') || '';
        const val = await el.value() || '';
        inputs.push({ placeholder: placeholder.substring(0, 40), value: val.substring(0, 30) });
      } catch (e) { /* skip */ }
    }
    for (const el of await safePageQuery(page, 'textarea')) {
      try {
        const placeholder = await el.attribute('placeholder') || '';
        inputs.push({ placeholder: placeholder.substring(0, 40), tag: 'textarea' });
      } catch (e) { /* skip */ }
    }
    for (const el of await safePageQuery(page, 'image')) {
      try {
        const src = await el.attribute('src') || '';
        if (src) images.push({ src: src.substring(0, 60) });
      } catch (e) { /* skip */ }
    }
    for (const el of await safePageQuery(page, 'text')) {
      try {
        const txt = await el.text();
        if (txt && txt.trim()) texts.push(txt.trim().substring(0, 80));
      } catch (e) { /* skip */ }
    }
    for (const el of await safePageQuery(page, 'label')) {
      try {
        const txt = await el.text();
        if (txt && txt.trim()) texts.push(txt.trim().substring(0, 80));
      } catch (e) { /* skip */ }
    }
    for (const el of await safePageQuery(page, 'navigator')) {
      try {
        const txt = await el.text();
        const url = await el.attribute('url') || '';
        buttons.push({ text: `[nav] ${(txt || url).substring(0, 60)}`, class: 'navigator' });
      } catch (e) { /* skip */ }
    }
    // Try scroll-view, swiper, movable-view
    for (const tag of ['scroll-view', 'swiper', 'movable-view', 'picker', 'slider', 'switch']) {
      const els = await safePageQuery(page, tag);
      for (const el of els) {
        try {
          const txt = await el.text();
          texts.push(`[${tag}] ${(txt || '').substring(0, 60)}`);
        } catch (e) { /* skip */ }
      }
    }
    // Try class-based selectors for custom components
    for (const cls of ['.resource-card', '.cloud-selector', '.status-badge', '.operation-button']) {
      const els = await safePageQuery(page, cls);
      for (const el of els) {
        try {
          const txt = await el.text();
          if (txt && txt.trim()) texts.push(`[comp${cls}] ${txt.trim().substring(0, 60)}`);
        } catch (e) { /* skip */ }
      }
    }

    entry.elements = {
      buttons: buttons.slice(0, 20),
      inputs: inputs.slice(0, 10),
      images: images.slice(0, 10),
      textBlocks: texts.slice(0, 30)
    };
    console.log(`  Buttons: ${buttons.length}, Inputs: ${inputs.length}, Images: ${images.length}, Texts: ${texts.length}`);

    // Tap first enabled button if any
    const enabledBtns = buttons.filter(b => !b.disabled);
    if (enabledBtns.length > 0) {
      const btnData = enabledBtns[0];
      try {
        const btnEls = await safePageQuery(page, 'button');
        const btnEl = btnEls[buttons.indexOf(btnData)];
        if (btnEl) {
          await btnEl.tap();
          entry.interactions.push({ type: 'tap', target: btnData.text });
          console.log(`  Tapped: "${btnData.text}"`);
          await sleep(1500);
        }
      } catch (e) { console.log(`  Tap err: ${e.message}`); }
    }

    // Input to first field
    if (inputs.length > 0) {
      try {
        const inputEls = await safePageQuery(page, 'input');
        if (inputEls.length > 0) {
          await inputEls[0].input('auto-test');
          entry.interactions.push({ type: 'input', target: inputs[0].placeholder || 'input' });
          console.log(`  Input into: "${inputs[0].placeholder || 'input'}"`);
          await sleep(500);
        }
      } catch (e) { console.log(`  Input err: ${e.message}`); }
    }

    results.summary.success++;
    console.log(`  √ Done`);
  } catch (e) {
    const msg = e.message;
    if (msg === 'timeout') {
      entry.error = 'navigation timeout (page may need auth or not exist)';
      results.summary.soft_fail++;
      console.log(`  ~ Timeout (likely auth/network required)`);
    } else {
      entry.error = msg;
      results.summary.failed++;
      results.summary.errors.push(`${label}: ${msg}`);
      console.log(`  × Error: ${msg}`);
    }
    // Still try screenshot even on error
    try {
      const base64 = await miniProgram.screenshot();
      const imgPath = path.join(OUTPUT_DIR, `ss-${label.replace(/\//g, '_')}.png`);
      fs.writeFileSync(imgPath, Buffer.from(base64, 'base64'));
      entry.screenshot = '(captured on error)';
      console.log(`  Screenshot (on error) saved`);
    } catch (e) { /* no screenshot */ }
  }

  results.pages[label] = entry;
  results.summary.total++;
}

async function main() {
  console.log('=== WeChat Miniprogram Automation Traversal v2 ===\n');
  console.log(`Connecting to ${WS_ENDPOINT} ...`);
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const miniProgram = await automator.connect({ wsEndpoint: WS_ENDPOINT });
  console.log('Connected!\n');

  const consoleMsgs = [];
  miniProgram.on('console', msg => {
    consoleMsgs.push({ type: msg.type, text: msg.args.join(' ') });
    if (msg.type === 'error') console.log(`  [console.error] ${msg.args.join(' ')}`);
  });

  try {
    const info = await miniProgram.systemInfo();
    console.log(`System: ${info.platform} ${info.system}, model=${info.model}, SDK=${info.SDKVersion}\n`);
  } catch (e) { console.log(`System info: ${e.message}\n`); }

  // First tab (index) is already loaded
  await sleep(2000);
  try {
    const homePage = await miniProgram.currentPage();
    console.log(`Home: ${homePage.path}`);
    const base64 = await miniProgram.screenshot();
    const imgPath = path.join(OUTPUT_DIR, 'ss-home.png');
    fs.writeFileSync(imgPath, Buffer.from(base64, 'base64'));
    console.log(`Home screenshot saved\n`);
  } catch (e) { console.log(`Home: ${e.message}\n`); }

  for (const pagePath of ALL_PAGES) {
    const label = pagePath.replace('/pages/', '').replace(/\//g, '_');
    await scanPage(miniProgram, pagePath, label);
  }

  console.log('\n=== Summary ===');
  console.log(`Total: ${results.summary.total}`);
  console.log(`Success: ${results.summary.success}`);
  console.log(`Soft fail (timeout): ${results.summary.soft_fail}`);
  console.log(`Hard fail: ${results.summary.failed}`);
  if (results.summary.errors.length > 0) {
    console.log('Errors:');
    results.summary.errors.forEach(e => console.log(`  - ${e}`));
  }

  results.console = consoleMsgs;
  const reportPath = path.join(OUTPUT_DIR, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nReport: ${reportPath}`);

  miniProgram.disconnect();
  console.log('Done!');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
