/**
 * 小程序全量自动化测试 - 基于知识库调试经验
 * 
 * 知识来源: miniprogram-debug-experience.md
 *             miniprogram-auto-guide.md
 *             miniprogram-auto-api.md
 * 
 * 关键技巧:
 * - 错误捕获: miniProgram.on('exception'), on('console')
 * - 导航: switchTab > redirectTo > callWxMethod (避免 reLaunch)
 * - 超时保护: Promise.race 12秒超时
 * - 软失败: 单个页面出错不影响全局
 * - 异步数据: 切换页面后等待 2-5 秒
 * - 元素操作: 用 class 选择器, 做好元素不存在处理
 * - 滑动: touchstart/touchmove/touchend + scrollTo
 */

const automator = require('miniprogram-automator');
const fs = require('fs');
const path = require('path');

// ===== 配置 =====
const AUTO_PORT = 9420;
const WS = `ws://localhost:${AUTO_PORT}`;
const DIR = path.join(__dirname, 'automation-results');
const SS_DIR = path.join(DIR, 'screenshots');
const REPORT_FILE = path.join(DIR, 'full-test-report.json');
const NAV_TIMEOUT = 12000;
const WAIT_PAGE = 3000;
const WAIT_ACTION = 800;
const PAGE_GAP = 2000;
const MODE = process.argv.includes('--launch') ? 'launch' : 'connect';
const PROJECT_PATH = __dirname;

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function initDirs() {
  [DIR, SS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
}

// ===== 重新获取当前页面（处理 page destroyed）=====
async function reacquirePage(mp, retries) {
  for (let i = 0; i < (retries || 3); i++) {
    try {
      const p = await mp.currentPage();
      if (p) return p;
    } catch (e) {}
    await sleep(1000);
  }
  return null;
}

// ===== 错误日志收集 =====
const logEntries = [];
function captureLog(mp) {
  mp.on('console', msg => {
    const entry = { type: msg.type, time: Date.now(), text: msg.args.join(' ') };
    logEntries.push(entry);
    if (msg.type === 'error') {
      console.log(`  [console.error] ${entry.text}`);
    }
  });
  mp.on('exception', err => {
    const entry = { type: 'exception', time: Date.now(), message: err.message, stack: (err.stack || '').substring(0, 500) };
    logEntries.push(entry);
    console.log(`  [exception] ${err.message}`);
  });
}

// ===== 截图 =====
let ssCounter = 0;
async function screenshot(mp, label) {
  ssCounter++;
  const file = `${String(ssCounter).padStart(3, '0')}-${label}.png`;
  try {
    const b64 = await navWithTimeout(() => mp.screenshot(), 8000);
    fs.writeFileSync(path.join(SS_DIR, file), Buffer.from(b64, 'base64'));
    return file;
  } catch (e) { return `(err: ${e.message})`; }
}

// ===== 安全元素操作 =====
async function safeFind(page, sel, idx) {
  if (!page) return null;
  try { const els = await navWithTimeout(() => page.$$(sel), 5000); return els.length > 0 ? els[Math.min(idx || 0, els.length - 1)] : null; } catch (e) { return null; }
}
async function safeTap(page, sel, idx) {
  const el = await safeFind(page, sel, idx);
  if (el) { try { await navWithTimeout(() => el.tap(), 5000); return true; } catch (e) {} }
  return false;
}
async function safeInput(page, sel, text, idx) {
  const el = await safeFind(page, sel, idx);
  if (el) { try { await navWithTimeout(() => el.input(text), 5000); return true; } catch (e) {} }
  return false;
}
async function safeText(page, sel, idx) {
  const el = await safeFind(page, sel, idx);
  if (el) { try { return await navWithTimeout(() => el.text(), 5000); } catch (e) {} }
  return null;
}

// ===== 滑动模拟 (touch events) =====
async function swipeInElement(el, fromY, toY) {
  try {
    const size = await el.size();
    const x = size.width / 2;
    await el.touchstart({ x, y: fromY });
    await sleep(80);
    await el.touchmove({ x, y: toY });
    await sleep(80);
    await el.touchend({ x, y: toY });
    await sleep(400);
    return true;
  } catch (e) { return false; }
}

// ===== 等待元素出现 =====
async function waitForElement(page, sel, timeout) {
  const deadline = Date.now() + (timeout || 8000);
  while (Date.now() < deadline) {
    try {
      const els = await navWithTimeout(() => page.$$(sel), 3000);
      if (els && els.length > 0) return els[0];
    } catch (e) {}
    await sleep(500);
  }
  return null;
}

// ===== 超时保护的导航 =====
async function navWithTimeout(fn, timeout) {
  return Promise.race([
    fn(),
    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), timeout || NAV_TIMEOUT))
  ]);
}

async function navToHome(mp) {
  try {
    await navWithTimeout(() => mp.switchTab('/pages/index/index'), NAV_TIMEOUT);
    await sleep(2000);
    const page = await reacquirePage(mp);
    if (page) { try { const p = await mp.currentPage(); if (p && p.path === 'pages/index/index') return page; } catch (e) {} }
  } catch (e) {}
  try {
    await navWithTimeout(() => mp.callWxMethod('switchTab', { url: '/pages/index/index' }), 8000);
    await sleep(2000);
    const page = await reacquirePage(mp);
    if (page) { try { const p = await mp.currentPage(); if (p && p.path === 'pages/index/index') return page; } catch (e) {} }
  } catch (e) {}
  // 兜底: reLaunch（需要自动化模式跳过 auth 检查）
  try {
    await navWithTimeout(() => mp.callWxMethod('reLaunch', { url: '/pages/index/index' }), 20000);
    await sleep(3000);
    return await reacquirePage(mp, 5);
  } catch (e) { return null; }
}

async function safeNavTab(mp, url) {
  const targetPath = url.replace(/^\//, '');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await navWithTimeout(() => mp.switchTab(url));
      await sleep(WAIT_PAGE);
      const page = await reacquirePage(mp);
      if (page) {
        try { const p = await mp.currentPage(); if (p && (p.path === targetPath || p.path.endsWith(targetPath))) return page; } catch (e) {}
      }
    } catch (e) {}
    await sleep(1000);
    try {
      await navWithTimeout(() => mp.callWxMethod('switchTab', { url }), 8000);
      await sleep(WAIT_PAGE);
      const page = await reacquirePage(mp);
      if (page) {
        try { const p = await mp.currentPage(); if (p && (p.path === targetPath || p.path.endsWith(targetPath))) return page; } catch (e) {}
      }
    } catch (e2) {}
  }
  // 兜底: reLaunch（自动化模式跳过 auth 检查）
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await navWithTimeout(() => mp.callWxMethod('reLaunch', { url }), 20000);
      await sleep(4000);
      const page = await reacquirePage(mp, 5);
      if (page) {
        try { const p = await mp.currentPage(); if (p && (p.path === targetPath || p.path.endsWith(targetPath))) return page; } catch (e) {}
      }
    } catch (e) {}
    await sleep(2000);
  }
  return null;
}

async function safeNavSub(mp, url) {
  if (['/pages/index/index', '/pages/agent/chat', '/pages/resources/list', '/pages/user/profile'].includes(url)) {
    return await safeNavTab(mp, url);
  }
  const targetPath = url.replace(/^\//, '');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await navWithTimeout(() => mp.redirectTo(url));
      await sleep(WAIT_PAGE);
      const page = await reacquirePage(mp);
      if (page) {
        try { const p = await mp.currentPage(); if (p && (p.path === targetPath || p.path.endsWith(targetPath))) return page; } catch (e) {}
      }
    } catch (e) {}
    await sleep(1000);
    try {
      await navWithTimeout(() => mp.callWxMethod('redirectTo', { url }), 8000);
      await sleep(WAIT_PAGE);
      const page = await reacquirePage(mp);
      if (page) {
        try { const p = await mp.currentPage(); if (p && (p.path === targetPath || p.path.endsWith(targetPath))) return page; } catch (e) {}
      }
    } catch (e2) {}
  }
  // 兜底: reLaunch（自动化模式跳过 auth 检查）
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      await navWithTimeout(() => mp.callWxMethod('reLaunch', { url }), 20000);
      await sleep(4000);
      const page = await reacquirePage(mp, 5);
      if (page) {
        try { const p = await mp.currentPage(); if (p && (p.path === targetPath || p.path.endsWith(targetPath))) return page; } catch (e) {}
      }
    } catch (e) {}
    await sleep(2000);
  }
  return null;
}

// ===== 重置到首页（保持状态稳定）=====
async function resetToHome(mp) {
  try {
    const page = await safeNavTab(mp, '/pages/index/index');
    await sleep(1000);
    return page;
  } catch (e) {
    try {
      await mp.callWxMethod('switchTab', { url: '/pages/index/index' });
      await sleep(2000);
      return await reacquirePage(mp);
    } catch (e2) { return null; }
  }
}

// ===== 页面状态捕获 =====
async function capturePageState(page, mp, label) {
  const state = { label, path: null, texts: [], buttons: [], inputs: [], dataKeys: [], screenshots: [] };
  try { const p = await mp.currentPage(); state.path = p ? p.path : null; } catch (e) {}
  if (page) {
    try { state.dataKeys = Object.keys(await navWithTimeout(() => page.data(), 3000)); } catch (e) {}
    try { const els = await navWithTimeout(() => page.$$('text'), 3000) || []; for (const el of els) { try { const t = await navWithTimeout(() => el.text(), 2000); if (t && t.trim()) state.texts.push(t.trim().substring(0, 60)); } catch (e) {} } } catch (e) {}
    try { const els = await navWithTimeout(() => page.$$('button'), 3000) || []; for (const el of els) { try { const t = await navWithTimeout(() => el.text(), 2000); const d = await navWithTimeout(() => el.attribute('disabled'), 2000); if (t) state.buttons.push({ text: t.substring(0, 30), disabled: d === 'true' || d === '' }); } catch (e) {} } } catch (e) {}
    try { const els = await navWithTimeout(() => page.$$('input'), 3000) || []; for (const el of els) { try { const pl = await navWithTimeout(() => el.attribute('placeholder'), 2000); state.inputs.push((pl || '').substring(0, 30)); } catch (e) {} } } catch (e) {}
  }
  state.screenshots.push(await screenshot(mp, label));
  return state;
}

// ===== 测试框架 =====
const results = { summary: { total: 0, passed: 0, failed: 0, warnings: 0 }, pages: [], errors: [], logs: [] };

// ============================================================
// 主测试流程
// ============================================================
async function run(mp) {
  await sleep(1500);
  try {
    const info = await mp.systemInfo();
    console.log(`[环境] ${info.platform} ${info.system} SDK=${info.SDKVersion}`);
  } catch (e) {}

  // 启用自动化模式（阻止 app.js checkAuth 重定向）
  try {
    await mp.callWxMethod('setStorageSync', { key: '__automation__', data: '1' });
    console.log('[setup] automation mode enabled');
  } catch (e) {
    console.log('[setup] setStorageSync failed:', e.message);
  }

  let page;
  let testSeq = 0;

  async function testPage(name, fn) {
    if (testSeq > 0) await sleep(1500);
    testSeq++;
    results.summary.total++;
    process.stdout.write(`\n[${results.summary.total}] ${name}... `);
    const entry = { name, status: 'ok', interactions: [], warnings: [], screenshots: [] };
    let lastErr;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await fn(entry);
        results.summary.passed++;
        console.log('PASS');
        if (attempt > 1) console.log(`  (retry ${attempt})`);
        results.pages.push(entry);
        return;
      } catch (e) {
        lastErr = e;
        if (attempt < 2 && (e.message.includes('destroyed') || e.message.includes('timeout'))) {
          process.stdout.write(`\r  retry ${attempt}... `);
          await sleep(3000);
          entry.interactions = [];
          entry.warnings = [];
          entry.screenshots = [];
          continue;
        }
        break;
      }
    }
    entry.status = 'fail';
    entry.error = lastErr.message;
    results.summary.failed++;
    results.errors.push({ name, error: lastErr.message });
    console.log(`FAIL: ${lastErr.message}`);
    results.pages.push(entry);
  }

  async function pageGap() { await sleep(1500); }

  // ===== 1. 首页 =====
  await testPage('首页(index)', async (entry) => {
    page = await safeNavTab(mp, '/pages/index/index');
    let s = await capturePageState(page, mp, 'home');
    entry.screenshots.push(...s.screenshots);

    // 验证 stats 数据
    const stats = await page.$$('.stat-card');
    entry.interactions.push({ action: 'load_stats', count: stats.length });

    // 验证页面文本
    const pageTexts = s.texts.slice(0, 5);
    entry.interactions.push({ action: 'page_texts', texts: pageTexts });

    s = await capturePageState(page, mp, 'home-end');
    entry.screenshots.push(...s.screenshots);
  });

  // ===== 2. AI助手 =====
  await testPage('AI助手(chat)', async (entry) => {
    page = await safeNavTab(mp, '/pages/agent/chat');
    if (page) await waitForElement(page, 'input.message-input', 10000);
    let s = await capturePageState(page, mp, 'chat');
    entry.screenshots.push(...s.screenshots);

    // 输入消息
    const typed = await safeInput(page, 'input.message-input', '列出所有腾讯云资源');
    if (typed) {
      await sleep(500);
      entry.interactions.push({ action: 'type_message' });
      s = await capturePageState(page, mp, 'chat-typed');
      entry.screenshots.push(...s.screenshots);

      // 发送
      const sent = await safeTap(page, 'button.send-btn');
      if (sent) {
        await sleep(2000);
        entry.interactions.push({ action: 'send_message' });
        s = await capturePageState(page, mp, 'chat-sent');
        entry.screenshots.push(...s.screenshots);
      }
    }

    // 打开快捷操作
    await safeTap(page, '.header-btn');
    await sleep(800);
    entry.interactions.push({ action: 'toggle_quick_actions' });
    s = await capturePageState(page, mp, 'chat-qa');
    entry.screenshots.push(...s.screenshots);

    // 点击 "配置" 按钮 (第3个 qa-btn)
    const qaBtns = await page.$$('.qa-btn');
    for (const btn of qaBtns) {
      try {
        const txt = await btn.text();
        if (txt.includes('配置') || txt.includes('Config')) {
          await btn.tap();
          await sleep(1000);
          entry.interactions.push({ action: 'open_config' });
          break;
        }
      } catch (e) {}
    }

    // 填充配置表单
    const cfgInputs = await page.$$('input.form-input');
    for (const inp of cfgInputs) {
      try {
        const pl = await inp.attribute('placeholder') || '';
        if (pl.includes('provider')) await inp.input('OpenRouter');
        else if (pl.includes('model')) await inp.input('gpt-4');
        else if (pl.includes('key')) await inp.input('sk-test-key-12345');
      } catch (e) {}
    }
    await sleep(500);
    entry.interactions.push({ action: 'fill_config' });
    s = await capturePageState(page, mp, 'chat-config');
    entry.screenshots.push(...s.screenshots);

    // 保存配置
    const saved = await safeTap(page, 'button.config-save-btn');
    if (saved) { await sleep(800); entry.interactions.push({ action: 'save_config' }); }

    // 关闭配置 (点击遮罩)
    await safeTap(page, '.modal-mask');
    await sleep(500);

    // 通过 callMethod 切换执行模式
    try {
      page = await mp.currentPage();
      await page.callMethod('onModeChange', { detail: { value: 'auto_execute' } });
      await sleep(500);
      entry.interactions.push({ action: 'change_mode' });
    } catch (e) { entry.warnings.push(`mode: ${e.message}`); }

    // 滑动消息列表
    const scrollView = await safeFind(page, 'scroll-view.message-list');
    if (scrollView) {
      const swiped = await swipeInElement(scrollView, 300, 50);
      if (swiped) entry.interactions.push({ action: 'swipe_scroll' });
    }

    s = await capturePageState(page, mp, 'chat-end');
    entry.screenshots.push(...s.screenshots);
  });

  // ===== 3. 资源列表 =====
  await testPage('资源列表(resources/list)', async (entry) => {
    page = await safeNavTab(mp, '/pages/resources/list');
    if (page) await waitForElement(page, 'picker.filter-picker', 10000);
    let s = await capturePageState(page, mp, 'resources');
    entry.screenshots.push(...s.screenshots);

    // 搜索
    await safeInput(page, 'input.search-input', 'azure');
    await sleep(800);
    entry.interactions.push({ action: 'search_azure' });
    await safeInput(page, 'input.search-input', '');
    await sleep(300);

    // 云类型过滤
    await safeTap(page, 'picker.filter-picker', 0);
    await sleep(600);
    entry.interactions.push({ action: 'cloud_filter' });

    // 同步按钮
    const syncBtn = await safeFind(page, 'button.sync-btn');
    if (syncBtn) {
      try {
        const disabled = await syncBtn.attribute('disabled');
        if (disabled !== 'true') {
          await syncBtn.tap();
          await sleep(2000);
          entry.interactions.push({ action: 'sync' });
        }
      } catch (e) {}
    }

    // 检查是否有资源列表数据（不导航到详情，避免页面栈混乱）
    const detailNavs = await page.$$('navigator.card-top');
    entry.interactions.push({ action: 'check_detail_nav', count: detailNavs.length });

    s = await capturePageState(page, mp, 'resources-end');
    entry.screenshots.push(...s.screenshots);
  });

  // ===== 4. 资源详情 =====
  await testPage('资源详情(resources/detail)', async (entry) => {
    page = await safeNavSub(mp, '/pages/resources/detail?id=auto-test');
    let s = await capturePageState(page, mp, 'detail');
    entry.screenshots.push(...s.screenshots);

    // 尝试点击操作按钮 (start/stop/delete)
    for (const sel of ['button.btn-start', 'button.btn-stop', 'button.btn-delete']) {
      const btn = await safeFind(page, sel);
      if (btn) {
        try {
          const disabled = await btn.attribute('disabled');
          if (disabled !== 'true') {
            await btn.tap();
            await sleep(800);
            entry.interactions.push({ action: `click_${sel.replace('button.btn-', '')}` });
          }
        } catch (e) {}
      }
    }

    s = await capturePageState(page, mp, 'detail-end');
    entry.screenshots.push(...s.screenshots);
  });

  // ===== 5. 个人中心 =====
  await testPage('个人中心(user/profile)', async (entry) => {
    page = await safeNavTab(mp, '/pages/user/profile');
    let s = await capturePageState(page, mp, 'profile');
    entry.screenshots.push(...s.screenshots);

    // 开关操作
    const switches = await page.$$('switch');
    entry.interactions.push({ action: 'load_switches', count: switches.length });
    for (let i = 0; i < Math.min(switches.length, 2); i++) {
      try {
        await switches[i].tap();
        await sleep(500);
        entry.interactions.push({ action: `toggle_switch_${i}` });
        await switches[i].tap();
        await sleep(400);
      } catch (e) {}
    }

    // 语言选择
    await safeTap(page, 'picker');
    await sleep(500);
    entry.interactions.push({ action: 'language_picker' });

    // 遍历设置导航项
    const navItems = await page.$$('navigator.nav-item');
    let navCount = 0;
    for (const nav of navItems) {
      try {
        const url = await nav.attribute('url');
        if (url && !url.includes('javascript')) {
          await nav.tap();
          await sleep(2000);
          const np = await mp.currentPage();
          entry.interactions.push({ action: `nav_setting[${navCount}]`, dest: np ? np.path : '?' });
          navCount++;
          if (np && np.path !== 'pages/user/profile') {
            try { await mp.navigateBack(); } catch (e) { await safeNavTab(mp, '/pages/user/profile'); }
            await sleep(1000);
          }
          if (navCount >= 2) break;
        }
      } catch (e) {}
    }

    // 滚动设置列表
    const scrollContainer = await safeFind(page, '.settings-card');
    if (scrollContainer) {
      await swipeInElement(scrollContainer, 200, 50);
      entry.interactions.push({ action: 'swipe_settings' });
      await sleep(300);
    }

    s = await capturePageState(page, mp, 'profile-end');
    entry.screenshots.push(...s.screenshots);
  });

  // ===== 6. 登录页 =====
  await testPage('登录页(login)', async (entry) => {
    page = await safeNavSub(mp, '/pages/login/login');
    let s = await capturePageState(page, mp, 'login');
    entry.screenshots.push(...s.screenshots);

    // 填充表单
    const inputs = await page.$$('input');
    for (const inp of inputs) {
      try {
        const type = await inp.attribute('password');
        if (type === 'true' || type === '') {
          await inp.input('testpass123');
        } else {
          await inp.input('admin');
        }
        await sleep(200);
      } catch (e) {}
    }
    await sleep(300);
    entry.interactions.push({ action: 'fill_login' });
    s = await capturePageState(page, mp, 'login-filled');
    entry.screenshots.push(...s.screenshots);

    // 点击微信登录按钮
    const btns = await page.$$('button');
    for (const btn of btns) {
      try {
        const txt = await btn.text();
        if (txt.includes('微信')) {
          await btn.tap();
          await sleep(500);
          entry.interactions.push({ action: 'wechat_login_btn' });
          break;
        }
      } catch (e) {}
    }
  });

  // ===== 7. 账号列表 =====
  await testPage('账号列表(accounts/list)', async (entry) => {
    page = await safeNavSub(mp, '/pages/accounts/list');
    let s = await capturePageState(page, mp, 'accounts');
    entry.screenshots.push(...s.screenshots);

    // 尝试删除 (如果列表有数据)
    const delBtns = await page.$$('button');
    for (const btn of delBtns) {
      try {
        const txt = await btn.text();
        if (txt.includes('删除') || txt.includes('Delete')) {
          await btn.tap();
          await sleep(800);
          entry.interactions.push({ action: 'delete_account' });
          break;
        }
      } catch (e) {}
    }

    s = await capturePageState(page, mp, 'accounts-end');
    entry.screenshots.push(...s.screenshots);
  });

  // ===== 8. 添加账号 =====
  await testPage('添加账号(accounts/add)', async (entry) => {
    page = await safeNavSub(mp, '/pages/accounts/add');
    let s = await capturePageState(page, mp, 'add-account');
    entry.screenshots.push(...s.screenshots);

    // 点击云平台选择器
    await safeTap(page, 'cloud-selector');
    await sleep(500);
    entry.interactions.push({ action: 'cloud_selector' });
    page = await reacquirePage(mp) || page;

    // 按 placeholder 填充表单
    const inputs = await page.$$('input');
    const valueMap = { 'Name': 'My Azure', 'name': 'My Azure', 'name': 'My Azure', 'Access': 'ak-test', 'Secret': 'sk-test', 'Region': 'eastasia' };
    for (const inp of inputs) {
      try {
        const pl = await inp.attribute('placeholder') || '';
        for (const [key, val] of Object.entries(valueMap)) {
          if (pl.toLowerCase().includes(key.toLowerCase())) {
            await inp.input(val);
            await sleep(200);
            break;
          }
        }
      } catch (e) {}
    }
    await sleep(300);
    entry.interactions.push({ action: 'fill_account_form' });

    // 提交
    await safeTap(page, 'button.btn-submit');
    await sleep(800);
    entry.interactions.push({ action: 'submit_account' });

    s = await capturePageState(page, mp, 'add-account-end');
    entry.screenshots.push(...s.screenshots);
  });

  // ===== 9. 团队成员 =====
  await testPage('团队成员(team/members)', async (entry) => {
    page = await safeNavSub(mp, '/pages/team/members');
    let s = await capturePageState(page, mp, 'team');
    entry.screenshots.push(...s.screenshots);

    // 邀请按钮
    const inviteBtn = await safeFind(page, 'button');
    if (inviteBtn) {
      await inviteBtn.tap();
      await sleep(500);
      entry.interactions.push({ action: 'invite' });
    }

    // 滑动成员列表
    const container = await safeFind(page, '.container');
    if (container) {
      await swipeInElement(container, 300, 50);
      entry.interactions.push({ action: 'swipe_members' });
    }

    s = await capturePageState(page, mp, 'team-end');
    entry.screenshots.push(...s.screenshots);
  });

  // ===== 10. Terraform 列表 =====
  await testPage('Terraform配置(terraform/list)', async (entry) => {
    page = await safeNavSub(mp, '/pages/terraform/list');
    let s = await capturePageState(page, mp, 'terraform');
    entry.screenshots.push(...s.screenshots);

    // 触发部署
    const btns = await page.$$('button');
    for (const btn of btns) {
      try {
        const txt = await btn.text();
        if (txt.includes('部署') || txt.includes('Apply')) {
          await btn.tap();
          await sleep(1000);
          entry.interactions.push({ action: 'apply' });
          break;
        }
      } catch (e) {}
    }

    s = await capturePageState(page, mp, 'terraform-end');
    entry.screenshots.push(...s.screenshots);
  });

  // ===== 11. Terraform 上传 =====
  await testPage('Terraform上传(terraform/upload)', async (entry) => {
    page = await safeNavSub(mp, '/pages/terraform/upload');
    let s = await capturePageState(page, mp, 'upload');
    entry.screenshots.push(...s.screenshots);

    // 点击上传区域
    await safeTap(page, '.upload-area');
    await sleep(500);
    entry.interactions.push({ action: 'pick_file' });

    // 填写配置名称
    await safeInput(page, 'input.form-input', '我的 Terraform 配置');
    await sleep(300);
    entry.interactions.push({ action: 'fill_name' });

    // 切换云提供商
    try {
      page = await mp.currentPage();
      await page.callMethod('onProviderChange', { detail: { value: '2' } });
      await sleep(500);
      entry.interactions.push({ action: 'change_provider' });
    } catch (e) { entry.warnings.push(`provider: ${e.message}`); }

    s = await capturePageState(page, mp, 'upload-filled');
    entry.screenshots.push(...s.screenshots);

    // 上传
    const btns = await page.$$('button');
    for (const btn of btns) {
      try {
        const txt = await btn.text();
        if (txt.includes('上传') || txt.includes('Upload')) {
          await btn.tap();
          await sleep(800);
          entry.interactions.push({ action: 'upload_tf' });
          break;
        }
      } catch (e) {}
    }
  });

  // ===== 12. 用户管理(admin) =====
  await testPage('用户管理(admin/users)', async (entry) => {
    page = await safeNavSub(mp, '/pages/admin/users/users');
    if (page) await waitForElement(page, 'button', 10000);
    let s = await capturePageState(page, mp, 'admin');
    entry.screenshots.push(...s.screenshots);

    // 检查是否访问受限
    const np = await mp.currentPage();
    if (np && np.path !== 'pages/admin/users/users') {
      entry.warnings.push(`redirected from admin (not admin role): ${np.path}`);
      return;
    }

    // 创建用户
    const createBtn = await safeFind(page, 'button');
    if (createBtn) {
      try {
        await createBtn.tap();
        await sleep(500);
        entry.interactions.push({ action: 'open_create_form' });
        s = await capturePageState(page, mp, 'admin-create');
        entry.screenshots.push(...s.screenshots);
      } catch (e) {}
    }

    // 填充创建表单
    const inputs = await page.$$('input');
    for (const inp of inputs) {
      try {
        const pl = await inp.attribute('placeholder') || '';
        if (pl.includes('用户') || pl.includes('username')) await inp.input('testuser');
        else if (pl.includes('密码') || pl.includes('password')) await inp.input('testpass123');
        else if (pl.includes('昵称') || pl.includes('nickname')) await inp.input('Test User');
        await sleep(200);
      } catch (e) {}
    }
    await sleep(300);
    entry.interactions.push({ action: 'fill_create_form' });

    s = await capturePageState(page, mp, 'admin-filled');
    entry.screenshots.push(...s.screenshots);
  });
}

// ===== 报告生成 =====
async function generateReport() {
  const report = {
    timestamp: new Date().toISOString(),
    summary: results.summary,
    pages: results.pages.map(p => ({
      name: p.name,
      status: p.status,
      error: p.error || null,
      interactions: p.interactions,
      warnings: p.warnings.length > 0 ? p.warnings : undefined,
      screenshotCount: p.screenshots.length,
    })),
    errors: results.errors,
    consoleLogs: logEntries.length > 0 ? logEntries.slice(-50) : undefined // 保留最近50条
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
  console.log(`\n报告: ${REPORT_FILE}`);

  const s = results.summary;
  console.log('\n====== 测试结果 ======');
  console.log(`总计: ${s.total}  |  通过: ${s.passed}  |  失败: ${s.failed}  |  警告: ${s.warnings}`);
  console.log(`控制台日志: ${logEntries.length} 条 (含 ${logEntries.filter(e => e.type === 'error' || e.type === 'exception').length} 条错误)`);
  console.log(`截图: ${ssCounter} 张 (${SS_DIR})`);
  console.log(`测试报告: ${REPORT_FILE}`);

  if (s.failed > 0) {
    console.log('\n失败详情:');
    results.errors.forEach(e => console.log(`  - ${e.name}: ${e.error}`));
  }
  if (logEntries.filter(e => e.type === 'error' || e.type === 'exception').length > 0) {
    console.log('\nJS 异常 / Console 错误:');
    logEntries.filter(e => e.type === 'error' || e.type === 'exception').slice(0, 10).forEach(e => {
      console.log(`  [${e.type}] ${e.text || e.message}`);
    });
  }
  if (s.passed === s.total) console.log('\n✅ 所有页面测试通过!');
}

// ===== 入口 =====
async function connectOrLaunch() {
  if (MODE === 'launch') {
    console.log(`启动开发者工具: ${PROJECT_PATH}`);
    console.log(`自动化端口: ${AUTO_PORT}`);
    return await automator.launch({
      projectPath: PROJECT_PATH,
      cliPath: 'E:/Program Files (x86)/Tencent/微信web开发者工具/cli.bat',
      port: AUTO_PORT
    });
  }
  console.log(`连接 ${WS} ...  (请确保开发者工具已打开并启用 CLI/HTTP 调用)`);
  return await automator.connect({ wsEndpoint: WS });
}

async function main() {
  initDirs();
  console.log('=== 小程序全量自动化测试 v2 ===');
  console.log(`模式: ${MODE}`);
  console.log(`截图目录: ${SS_DIR}`);
  console.log(`基于知识库: miniprogram-debug-experience.md\n`);

  const mp = await connectOrLaunch();
  console.log('已连接!\n');

  // 捕获错误
  captureLog(mp);

  try {
    await run(mp);
  } catch (e) {
    console.error(`\n[FATAL] ${e.message}`);
    results.errors.push({ name: '__FATAL__', error: e.message });
  }

  results.logs = logEntries.slice(-100);
  await generateReport();
  mp.disconnect();
  console.log('\n完成!');
}

main().catch(e => {
  console.error(`[FATAL] ${e.message}`);
  process.exit(1);
});
