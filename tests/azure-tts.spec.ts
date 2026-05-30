import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'https://multicloud-backend-qw9d.onrender.com';
const USER = process.env.TEST_USER || 'admin';
const PASS = process.env.TEST_PASS || 'Test.1234';

async function login(page: any) {
  await page.goto(BASE + '/login.html');
  await page.waitForSelector('#username', { timeout: 15000 });
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  await page.click('button:has-text("登 录")');
  await page.waitForSelector('#page-dashboard', { timeout: 20000 });
}

test('Azure TTS creation - monitor stream flow', async ({ page }) => {
  test.setTimeout(600000);

  await login(page);

  // Navigate to chat — ensure dashboard is loaded first
  await page.waitForSelector('#page-dashboard', { timeout: 15000, state: 'visible' });
  await page.click('.nav-item[data-page="chat"]');
  await page.waitForFunction(() => {
    const el = document.getElementById('page-chat');
    return el && el.style.display !== 'none' && el.offsetParent !== null;
  }, { timeout: 10000 });
  await page.waitForTimeout(500);

  // Create new session
  const newBtn = page.locator('button:has-text("新建对话"), button:has-text("New Session")');
  if (await newBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await newBtn.click();
    await page.waitForTimeout(1500);
  }

  // Set to Plan mode (safer, won't try to execute commands)
  await page.locator('.mode-btn[data-mode="plan"]').click();
  await page.waitForTimeout(500);

  // Send message
  await page.locator('#chatInput').fill('帮我建免费的azure tts');
  await page.locator('#chatSendBtn').click();
  console.log('Sent: "帮我建免费的azure tts"\n');

  // Wait for streaming to complete (no more .streaming elements)
  let waited = 0;
  while (waited < 450) {
    await page.waitForTimeout(5000);
    waited += 5;
    const streaming = await page.locator('.msg.streaming').count();
    const done = await page.locator('.msg.agent').count();
    console.log(`[${waited}s] streaming: ${streaming}, messages: ${done}`);
    if (streaming === 0 && done > 0) break;
  }

  const msgs = await page.locator('#chatMessages .msg.agent .msg-content');
  const count = await msgs.count();
  console.log('Total agent message count:', count);

  for (let i = 0; i < count; i++) {
    const text = await msgs.nth(i).textContent();
    console.log(`\n=== Message ${i + 1} (${(text || '').length} chars) ===`);
    console.log((text || '').substring(0, 500));
  }

  // Verify
  const allContent = await page.locator('#chatMessages').textContent();
  expect(allContent).toBeTruthy();
  expect((allContent || '').length).toBeGreaterThan(100);

  console.log('\n✅ Azure TTS stream test completed');
});
