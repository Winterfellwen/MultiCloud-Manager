import { test, expect } from '@playwright/test';
import { login } from './helpers';

test('AI should handle deploy request with shell_exec', async ({ page }) => {
  test.setTimeout(120000);

  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.text().includes('Error') || msg.text().includes('error')) {
      errors.push(msg.text());
    }
  });

  await login(page);
  await page.click('.nav-item[data-page="chat"]');
  await page.waitForSelector('#page-chat', { timeout: 10000 });
  await page.waitForTimeout(1000);

  // Create new session
  const newSessionBtn = page.locator('button:has-text("新建对话"), button:has-text("New Session")');
  if (await newSessionBtn.isVisible()) {
    await newSessionBtn.click();
    await page.waitForTimeout(2000);
  }

  // Send deploy request
  const chatInput = page.locator('#chatInput');
  await chatInput.fill('帮我搭一套免费的azure tts');
  await page.waitForTimeout(500);
  await page.locator('#chatSendBtn').click();
  console.log('Sent deploy request...');

  // Monitor SSE stream
  const response = await page.waitForResponse(
    resp => resp.url().includes('/agent/chat/stream'),
    { timeout: 30000 }
  );

  console.log('Response status:', response.status());
  const body = await response.text();
  console.log('Response body (first 3000):', body.substring(0, 3000));

  // Check for shell_exec tool call
  if (body.includes('shell_exec')) {
    console.log('SUCCESS: AI wants to use shell_exec tool!');
  } else if (body.includes('tool_start')) {
    console.log('Tool calls found:', body.match(/event: tool_start\ndata: (.+)/)?.[1]?.substring(0, 500));
  }

  // Check for error
  if (body.includes('event: error')) {
    const errorMatch = body.match(/event: error\ndata: (.+)/);
    console.log('ERROR:', errorMatch?.[1]);
  }

  // Wait for full response
  await page.waitForTimeout(10000);

  // Get all messages
  const allMsgs = await page.locator('#chatMessages .msg.agent .msg-content').allTextContents();
  console.log('\nAll agent messages:');
  allMsgs.forEach((m, i) => console.log(`  [${i}]: ${m.substring(0, 200)}`));

  // Verify AI mentions deployment capability
  const lastMsg = allMsgs[allMsgs.length - 1] || '';
  const hasDeploymentCapability = lastMsg.includes('部署') || lastMsg.includes('deploy') || 
    lastMsg.includes('TTS') || lastMsg.includes('az ') || body.includes('shell_exec');
  
  console.log('\nAI mentions deployment capability:', hasDeploymentCapability);
});
