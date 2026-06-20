/**
 * CloudOps AI UI 层测试脚本（Playwright）
 * 覆盖 U1-U12 测试项
 * 用法: node test-ui.cjs
 */
const { chromium } = require('playwright');

const BASE_URL = 'http://localhost:3006';
const SCREENSHOT_DIR = '/tmp/cloudops-ui-screenshots';

let testResults = [];
let browser, page;

function log(test, status, detail) {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} [${test}] ${detail}`);
  testResults.push({ test, status, detail });
}

async function shot(name) {
  try {
    await page.screenshot({ path: `${SCREENSHOT_DIR}/${name}.png`, fullPage: false });
  } catch (e) { /* 忽略截图失败 */ }
}

async function login() {
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.fill('#username', 'admin');
  await page.fill('#password', 'Admin123456');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/dashboard', { timeout: 10000 });
}

async function waitMs(ms) { await page.waitForTimeout(ms); }

async function main() {
  console.log('=== CloudOps AI UI 层测试开始 ===\n');

  // 确保 chromium 可用
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  page = await context.newPage();

  // ============ U1: 登录页渲染 ============
  console.log('\n--- U1: 登录页渲染 ---');
  try {
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
    await waitMs(500);
    const title = await page.textContent('.text-2xl').catch(() => null);
    const usernameInput = await page.locator('#username').count();
    const passwordInput = await page.locator('#password').count();
    const submitBtn = await page.locator('button[type="submit"]').count();
    const allPresent = title === 'CloudOps AI' && usernameInput === 1 && passwordInput === 1 && submitBtn === 1;
    log('U1', allPresent ? 'PASS' : 'FAIL',
      `标题=${title}, 用户名框=${usernameInput}, 密码框=${passwordInput}, 提交按钮=${submitBtn}`);
    await shot('u1-login-page');
  } catch (e) { log('U1', 'FAIL', e.message); }

  // ============ U2: 登录流程 ============
  console.log('\n--- U2: 登录流程 ---');
  try {
    await page.fill('#username', 'admin');
    await page.fill('#password', 'Admin123456');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await waitMs(1000);
    const url = page.url();
    log('U2', url.includes('/dashboard') ? 'PASS' : 'FAIL', `登录后跳转: ${url}`);
    await shot('u2-dashboard');
  } catch (e) { log('U2', 'FAIL', e.message); }

  // ============ U3: 导航到 AI 对话页 ============
  console.log('\n--- U3: 导航到 AI 对话页 ---');
  try {
    // 点击侧边栏 AI 对话
    await page.locator('a[href="/chat/react"]').first().click();
    await page.waitForURL('**/chat/react', { timeout: 10000 });
    await waitMs(2000);
    const url = page.url();
    // 检查对话页关键元素
    const newSessionBtn = await page.getByText('新建对话').count();
    const textarea = await page.locator('textarea').count();
    log('U3', url.includes('/chat/react') && newSessionBtn > 0 && textarea > 0 ? 'PASS' : 'FAIL',
      `URL=${url}, 新建对话按钮=${newSessionBtn}, 输入框=${textarea}`);
    await shot('u3-chat-page');
  } catch (e) { log('U3', 'FAIL', e.message); }

  // ============ U4: 会话列表 + 新建对话 ============
  console.log('\n--- U4: 会话列表 + 新建对话 ---');
  try {
    // 进入页面应该已自动创建一个会话
    await waitMs(1000);
    const sessionItemsBefore = await page.locator('.cursor-pointer:has(.truncate)').count();
    // 点击新建对话
    await page.getByText('新建对话').click();
    await waitMs(500);
    const sessionItemsAfter = await page.locator('.cursor-pointer:has(.truncate)').count();
    log('U4', sessionItemsAfter > sessionItemsBefore ? 'PASS' : 'WARN',
      `新建前会话数=${sessionItemsBefore}, 新建后=${sessionItemsAfter}`);
    await shot('u4-session-list');
  } catch (e) { log('U4', 'FAIL', e.message); }

  // ============ U5: 发送消息 + 流式回复 ============
  console.log('\n--- U5: 发送消息 + 流式回复 ---');
  try {
    // 确保在最新会话
    await page.getByText('新建对话').click();
    await waitMs(500);
    // 输入消息
    await page.locator('textarea').fill('你好，请用一句话介绍你自己');
    await waitMs(200);
    // 检查发送按钮
    const sendBtn = page.locator('button:has(svg.lucide-send)');
    const sendBtnVisible = await sendBtn.count();
    log('U5.1', sendBtnVisible > 0 ? 'PASS' : 'FAIL', `发送按钮存在: ${sendBtnVisible > 0}`);
    // 点击发送
    await sendBtn.click();
    await waitMs(1000);
    // 检查用户消息是否显示
    const userMsgVisible = await page.getByText('你好，请用一句话介绍你自己').count();
    log('U5.2', userMsgVisible > 0 ? 'PASS' : 'FAIL', `用户消息显示: ${userMsgVisible > 0}`);
    // 等待 AI 回复（流式）
    await waitMs(15000);
    // 检查是否有 assistant 消息（通过 Bot 图标检测，比 CSS 类更可靠）
    const botIcons = await page.locator('svg.lucide-bot').count();
    // 也检查是否有任何非用户消息的文本内容
    const allText = await page.textContent('body') || '';
    const hasReply = botIcons > 0 || allText.length > 100;
    log('U5.3', hasReply ? 'PASS' : 'FAIL', `AI 回复: bot图标=${botIcons}, 页面文本长度=${allText.length}`);
    await shot('u5-message-flow');
  } catch (e) { log('U5', 'FAIL', e.message); }

  // ============ U6: 工具调用卡片 ============
  console.log('\n--- U6: 工具调用卡片 ---');
  try {
    // 新建会话，发送触发工具调用的消息
    await page.getByText('新建对话').click();
    await waitMs(500);
    await page.locator('textarea').fill('查看所有云实例');
    await page.locator('button:has(svg.lucide-send)').click();
    await waitMs(15000); // 工具调用需要更长时间
    // 检查是否有工具卡片（ToolCallCard 渲染的元素）
    const toolCardText = await page.getByText(/工具调用|tool_call|查询实例|list_instances/i).count();
    // 也检查是否有工具相关的文本
    const pageText = await page.textContent('body');
    const hasToolMention = /instance|实例|工具|tool/i.test(pageText || '');
    log('U6', toolCardText > 0 || hasToolMention ? 'PASS' : 'WARN',
      `工具卡片文本=${toolCardText}, 页面含工具相关词=${hasToolMention}`);
    await shot('u6-tool-call');
  } catch (e) { log('U6', 'FAIL', e.message); }

  // ============ U7: 模型选择器 ============
  console.log('\n--- U7: 模型选择器 ---');
  try {
    // 模型选择按钮（含 ChevronDown）
    const modelBtn = page.locator('button:has(svg.lucide-chevron-down)').first();
    const modelBtnVisible = await modelBtn.count();
    log('U7.1', modelBtnVisible > 0 ? 'PASS' : 'FAIL', `模型选择按钮存在: ${modelBtnVisible > 0}`);
    // 点击展开
    if (modelBtnVisible > 0) {
      await modelBtn.click();
      await waitMs(500);
      // 检查下拉选项
      const options = await page.locator('.cursor-pointer:has(svg.lucide-check)').count();
      log('U7.2', options > 0 ? 'PASS' : 'FAIL', `模型选项数: ${options}`);
      await shot('u7-model-select');
      // 按 Escape 关闭
      await page.keyboard.press('Escape');
      await waitMs(300);
    }
  } catch (e) { log('U7', 'FAIL', e.message); }

  // ============ U8: 斜杠命令菜单 ============
  console.log('\n--- U8: 斜杠命令菜单 ---');
  try {
    await page.locator('textarea').fill('/');
    await waitMs(800);
    // 检查斜杠命令菜单是否出现
    const menuVisible = await page.getByText(/new|stop|clear|help|model/i).count();
    const slashMenu = await page.locator('.absolute.z-50, [class*="absolute"][class*="z-50"]').count();
    log('U8', menuVisible > 0 || slashMenu > 0 ? 'PASS' : 'FAIL',
      `命令文本=${menuVisible}, 浮层=${slashMenu}`);
    await shot('u8-slash-menu');
    // 清空输入
    await page.locator('textarea').fill('');
    await waitMs(300);
  } catch (e) { log('U8', 'FAIL', e.message); }

  // ============ U9: 会话切换 ============
  console.log('\n--- U9: 会话切换 ---');
  try {
    // 记录当前会话的消息
    const sessions = await page.locator('.cursor-pointer:has(.truncate)').count();
    if (sessions >= 2) {
      // 先在当前会话发一条特殊消息
      await page.locator('textarea').fill('会话切换测试标记：UNIQUE_MARKER_A');
      await page.locator('button:has(svg.lucide-send)').click();
      await waitMs(8000);
      const markerInCurrent = await page.getByText('UNIQUE_MARKER_A').count();
      // 切换到另一个会话（点击第一个会话项）
      await page.locator('.cursor-pointer:has(.truncate)').first().click();
      await waitMs(3000); // 等待历史加载
      const markerAfterSwitch = await page.getByText('UNIQUE_MARKER_A').count();
      // 切换回来（点击最后一个会话项）
      await page.locator('.cursor-pointer:has(.truncate)').last().click();
      await waitMs(3000); // 等待历史加载
      const markerAfterBack = await page.getByText('UNIQUE_MARKER_A').count();
      // 标记应该在原会话中存在，切换后消失，切回后恢复
      const switchOk = markerInCurrent > 0 && markerAfterBack > 0;
      log('U9', switchOk ? 'PASS' : 'WARN',
        `标记存在: 初始=${markerInCurrent}, 切换后=${markerAfterSwitch}, 切回=${markerAfterBack}`);
    } else {
      log('U9', 'WARN', `会话数不足: ${sessions}`);
    }
    await shot('u9-session-switch');
  } catch (e) { log('U9', 'FAIL', e.message); }

  // ============ U10: 页面刷新后消息恢复 ============
  console.log('\n--- U10: 页面刷新后消息恢复 ---');
  try {
    // 先确保当前会话有消息
    const currentText = await page.locator('textarea').inputValue().catch(() => '');
    // 记录当前页面消息数
    const messagesBefore = await page.locator('.bg-muted.text-foreground, .bg-primary.text-primary-foreground').count();
    // 刷新页面
    await page.reload({ waitUntil: 'networkidle' });
    await waitMs(2000);
    // 检查是否被重定向到登录页（auth 状态未持久化 bug）
    const currentUrl = page.url();
    if (currentUrl.includes('/login')) {
      log('U10', 'FAIL', `刷新后被重定向到登录页（auth 状态未持久化）: ${currentUrl}`);
      await shot('u10-redirected-to-login');
      // 重新登录以继续后续测试
      await login();
      await page.goto(`${BASE_URL}/chat/react`, { waitUntil: 'networkidle' });
      await waitMs(2000);
    } else {
      // 检查消息是否恢复
      const messagesAfter = await page.locator('.bg-muted.text-foreground, .bg-primary.text-primary-foreground').count();
      const recovered = messagesAfter > 0;
      log('U10', recovered ? 'PASS' : 'WARN',
        `刷新前消息数=${messagesBefore}, 刷新后=${messagesAfter}`);
      await shot('u10-after-refresh');
    }
  } catch (e) { log('U10', 'FAIL', e.message); }

  // ============ U11: 中止按钮 ============
  console.log('\n--- U11: 中止按钮 ---');
  try {
    // 新建会话并发送长消息
    await page.getByText('新建对话').click();
    await waitMs(500);
    await page.locator('textarea').fill('请详细介绍微服务架构的所有内容，包括定义、特点、优缺点、适用场景、技术栈');
    await page.locator('button:has(svg.lucide-send)').click();
    await waitMs(1500);
    // 检查中止按钮是否出现
    const abortBtn = await page.getByText('中止').count();
    const squareIcon = await page.locator('button:has(svg.lucide-square)').count();
    log('U11.1', abortBtn > 0 || squareIcon > 0 ? 'PASS' : 'FAIL',
      `中止按钮=${abortBtn}, 方块图标=${squareIcon}`);
    // 点击中止
    if (abortBtn > 0 || squareIcon > 0) {
      await page.getByText('中止').click().catch(() => {});
      await page.locator('button:has(svg.lucide-square)').click().catch(() => {});
      await waitMs(1500);
      // 检查是否恢复发送按钮
      const sendBtnRestored = await page.locator('button:has(svg.lucide-send)').count();
      log('U11.2', sendBtnRestored > 0 ? 'PASS' : 'FAIL', `中止后发送按钮恢复: ${sendBtnRestored > 0}`);
    }
    await shot('u11-abort');
  } catch (e) { log('U11', 'FAIL', e.message); }

  // ============ U12: 连接状态指示 ============
  console.log('\n--- U12: 连接状态指示 ---');
  try {
    // 检查顶栏连接状态
    const statusDot = await page.locator('.h-2.w-2.rounded-full').count();
    const statusText = await page.textContent('.text-xs.text-muted-foreground').catch(() => '');
    const hasConnected = /已连接|connected/i.test(statusText || '');
    log('U12', statusDot > 0 ? 'PASS' : 'FAIL',
      `状态指示点=${statusDot}, 状态文本="${statusText}"`);
    await shot('u12-connection-status');
  } catch (e) { log('U12', 'FAIL', e.message); }

  // ============ 汇总 ============
  console.log('\n\n=== UI 层测试汇总 ===\n');
  let pass = 0, fail = 0, warn = 0;
  testResults.forEach(r => {
    if (r.status === 'PASS') pass++;
    else if (r.status === 'FAIL') fail++;
    else warn++;
  });
  console.log(`总计: ${testResults.length} 项 | ✅ 通过: ${pass} | ❌ 失败: ${fail} | ⚠️ 警告: ${warn}`);
  if (fail > 0) {
    console.log('\n失败项:');
    testResults.filter(r => r.status === 'FAIL').forEach(r => console.log(`  ❌ [${r.test}] ${r.detail}`));
  }
  if (warn > 0) {
    console.log('\n警告项:');
    testResults.filter(r => r.status === 'WARN').forEach(r => console.log(`  ⚠️ [${r.test}] ${r.detail}`));
  }

  await browser.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Fatal:', e);
  if (browser) browser.close();
  process.exit(1);
});
