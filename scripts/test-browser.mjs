// Playwright 浏览器测试脚本：验证消息双发和审批刷新问题
// 用法：node test-browser.mjs
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const SCREENSHOT_DIR = join(process.cwd(), 'test-screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

const BASE_URL = 'http://localhost:3006';
const API_URL = 'http://localhost:3000';

let step = 0;
function screenshotPath(name) {
  step++;
  return join(SCREENSHOT_DIR, `${String(step).padStart(2, '0')}-${name}.png`);
}

async function login(page) {
  console.log('[1] 登录系统...');
  await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: screenshotPath('login-page'), fullPage: true });

  // 填写登录表单（根据实际页面结构：id="username", id="password"）
  await page.locator('#username').fill('testadmin');
  await page.locator('#password').fill('testadmin123');

  // 点击登录按钮
  await page.locator('button:has-text("登录")').click();

  // 等待跳转
  await page.waitForURL('**/dashboard**', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: screenshotPath('after-login'), fullPage: true });
  console.log(`  登录成功，当前 URL: ${page.url()}`);
}

async function navigateToChat(page) {
  console.log('[2] 导航到 AI 对话页面...');
  // 点击侧边栏的 AI 对话链接
  const chatLink = page.locator('a:has-text("AI"), a:has-text("对话"), a:has-text("Chat"), a[href*="chat"]').first();
  if (await chatLink.count() > 0) {
    await chatLink.click();
    await page.waitForTimeout(2000);
  } else {
    await page.goto(`${BASE_URL}/chat`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: screenshotPath('chat-page'), fullPage: true });
  console.log('  已进入对话页面');
}

async function sendMessage(page, text) {
  console.log(`[3] 发送消息: "${text}"`);
  const textarea = page.locator('textarea').first();
  await textarea.fill(text);
  await page.waitForTimeout(500);

  // 截图发送前
  await page.screenshot({ path: screenshotPath('before-send'), fullPage: true });

  // 按 Enter 发送或点击发送按钮
  const sendBtn = page.locator('button:has-text("发送")').first();
  if (await sendBtn.count() > 0) {
    await sendBtn.click();
  } else {
    await textarea.press('Enter');
  }

  // 等待消息发送和响应
  await page.waitForTimeout(5000);
  await page.screenshot({ path: screenshotPath('after-send'), fullPage: true });

  // 统计用户消息数量
  const userMessages = await page.locator('text="' + text + '"').count();
  console.log(`  用户消息 "${text}" 在页面中出现次数: ${userMessages}`);
  return userMessages;
}

async function refreshAndCheck(page, originalText) {
  console.log('[4] 刷新页面...');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: screenshotPath('after-refresh'), fullPage: true });

  // 检查刷新后消息是否重复
  const userMessagesAfterRefresh = await page.locator(`text="${originalText}"`).count();
  console.log(`  刷新后用户消息出现次数: ${userMessagesAfterRefresh}`);

  // 检查是否有审批弹窗
  const approvalDialog = await page.locator('[role="dialog"]:has-text("审批"), [role="dialog"]:has-text("工具执行")').count();
  console.log(`  刷新后审批弹窗数量: ${approvalDialog}`);

  return { userMessagesAfterRefresh, approvalDialog };
}

async function checkApprovalDialog(page) {
  console.log('[5] 检查审批弹窗...');
  await page.waitForTimeout(2000);
  await page.screenshot({ path: screenshotPath('approval-check'), fullPage: true });

  const dialogs = await page.locator('[role="dialog"]').count();
  console.log(`  当前弹窗数量: ${dialogs}`);
  return dialogs;
}

async function main() {
  console.log('=== 启动浏览器测试 ===\n');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  // 收集控制台日志
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log(`  [console.error] ${msg.text()}`);
    }
  });

  // 收集 WebSocket 帧
  const wsFrames = [];
  page.on('websocket', (ws) => {
    ws.on('framesent', (frame) => {
      try {
        const data = JSON.parse(frame.payload.toString());
        if (data.method === 'chat.send' || data.method === 'exec.approval.list') {
          wsFrames.push({ direction: 'sent', method: data.method, time: Date.now() });
        }
      } catch {}
    });
  });

  const results = {
    sendMessageCount: 0,
    refreshMessageCount: 0,
    approvalDialogCount: 0,
    wsChatSendCount: 0,
  };

  try {
    await login(page);
    await navigateToChat(page);

    // 发送测试消息
    const testMessage = `测试消息-${Date.now()}`;
    const sendCount = await sendMessage(page, testMessage);
    results.sendMessageCount = sendCount;

    // 检查审批弹窗
    const approvalCount = await checkApprovalDialog(page);
    results.approvalDialogCount = approvalCount;

    // 刷新页面
    const refreshResult = await refreshAndCheck(page, testMessage);
    results.refreshMessageCount = refreshResult.userMessagesAfterRefresh;

    // 统计 WebSocket chat.send 调用次数
    results.wsChatSendCount = wsFrames.filter(f => f.method === 'chat.send').length;

    console.log('\n=== 测试结果 ===');
    console.log(JSON.stringify(results, null, 2));

    // 判断
    console.log('\n=== 判断 ===');
    if (results.sendMessageCount > 1) {
      console.log(`❌ 双发问题：发送后用户消息出现 ${results.sendMessageCount} 次（应为 1）`);
    } else {
      console.log(`✓ 发送后用户消息数量正常 (${results.sendMessageCount})`);
    }

    if (results.refreshMessageCount > 1) {
      console.log(`❌ 刷新后双发：刷新后用户消息出现 ${results.refreshMessageCount} 次（应为 1）`);
    } else {
      console.log(`✓ 刷新后用户消息数量正常 (${results.refreshMessageCount})`);
    }

    if (results.wsChatSendCount > 1) {
      console.log(`❌ WebSocket 双发：chat.send 被调用 ${results.wsChatSendCount} 次（应为 1）`);
    } else {
      console.log(`✓ WebSocket chat.send 调用次数正常 (${results.wsChatSendCount})`);
    }

    if (results.approvalDialogCount > 0) {
      console.log(`⚠️  有审批弹窗 (${results.approvalDialogCount} 个) — 需要人工确认是否合理`);
    }

  } catch (err) {
    console.error('测试出错:', err.message);
    await page.screenshot({ path: screenshotPath('error'), fullPage: true }).catch(() => {});
  } finally {
    await browser.close();
  }
}

main().catch(console.error);
