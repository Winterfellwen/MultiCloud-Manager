// 完整测试：清除旧数据后测试发送+刷新
import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

console.log('=== 完整测试（清除旧数据）===\n');

// 登录
await page.goto('http://localhost:3006/login', { waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
await page.locator('#username').fill('testadmin');
await page.locator('#password').fill('testadmin123');
await page.locator('button:has-text("登录")').click();
await page.waitForURL('**/dashboard**', { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(2000);

// 导航到对话页
await page.goto('http://localhost:3006/chat/react', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// 清除所有 chat 相关 localStorage
await page.evaluate(() => {
  localStorage.removeItem('cloudops:chat:sessions');
  localStorage.removeItem('cloudops:chat:currentSessionKey');
  localStorage.removeItem('cloudops:chat:runIdToSession');
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(3000);

// 发送消息
const testMessage = `完整测试-${Date.now()}`;
console.log(`[1] 发送消息: "${testMessage}"`);

await page.waitForSelector('textarea', { timeout: 10000 });
await page.locator('textarea').fill(testMessage);
await page.waitForTimeout(500);

// 截图发送前
await page.screenshot({ path: 'test-screenshots/full-01-before-send.png', fullPage: true });

await page.locator('button:has-text("发送")').click();
await page.waitForTimeout(5000);

// 截图发送后
await page.screenshot({ path: 'test-screenshots/full-02-after-send.png', fullPage: true });

// 统计发送后消息出现次数（排除会话列表标题）
const countAfterSend = await page.evaluate((msg) => {
  const escaped = msg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const allMatches = document.body.innerText.match(new RegExp(escaped, 'g')) || [];
  // 排除会话列表中的标题（class 包含 "truncate"）
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let messageAreaCount = 0;
  let sessionListCount = 0;
  while (walker.nextNode()) {
    if (walker.currentNode.textContent.includes(msg)) {
      const parent = walker.currentNode.parentElement;
      if (parent?.getAttribute('class')?.includes('truncate')) {
        sessionListCount++;
      } else {
        messageAreaCount++;
      }
    }
  }
  return { total: allMatches.length, messageArea: messageAreaCount, sessionList: sessionListCount };
}, testMessage);

console.log(`  发送后: 总计=${countAfterSend.total}, 消息区=${countAfterSend.messageArea}, 会话列表=${countAfterSend.sessionList}`);

// 刷新
console.log('\n[2] 刷新页面...');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(5000);

await page.screenshot({ path: 'test-screenshots/full-03-after-refresh.png', fullPage: true });

const countAfterRefresh = await page.evaluate((msg) => {
  const escaped = msg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const allMatches = document.body.innerText.match(new RegExp(escaped, 'g')) || [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let messageAreaCount = 0;
  let sessionListCount = 0;
  while (walker.nextNode()) {
    if (walker.currentNode.textContent.includes(msg)) {
      const parent = walker.currentNode.parentElement;
      if (parent?.getAttribute('class')?.includes('truncate')) {
        sessionListCount++;
      } else {
        messageAreaCount++;
      }
    }
  }
  return { total: allMatches.length, messageArea: messageAreaCount, sessionList: sessionListCount };
}, testMessage);

console.log(`  刷新后: 总计=${countAfterRefresh.total}, 消息区=${countAfterRefresh.messageArea}, 会话列表=${countAfterRefresh.sessionList}`);

// 检查审批弹窗
const approvalDialogs = await page.locator('[role="dialog"]:has-text("审批"), [role="dialog"]:has-text("工具执行")').count();
console.log(`  审批弹窗: ${approvalDialogs}`);

// 结果判断
console.log('\n=== 判断 ===');
if (countAfterSend.messageArea === 1) {
  console.log('✓ 发送后消息区只有 1 条消息');
} else {
  console.log(`❌ 发送后消息区有 ${countAfterSend.messageArea} 条消息（应为 1）— 双发问题！`);
}

if (countAfterRefresh.messageArea === 1) {
  console.log('✓ 刷新后消息区只有 1 条消息');
} else if (countAfterRefresh.messageArea === 0) {
  console.log('⚠️  刷新后消息区有 0 条消息（可能历史未加载）');
} else {
  console.log(`❌ 刷新后消息区有 ${countAfterRefresh.messageArea} 条消息（应为 1）— 刷新后双发！`);
}

if (approvalDialogs === 0) {
  console.log('✓ 无审批弹窗重新弹出');
} else {
  console.log(`❌ 有 ${approvalDialogs} 个审批弹窗重新弹出`);
}

await browser.close();
console.log('\n=== 测试完成 ===');
