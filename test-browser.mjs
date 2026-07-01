import { chromium } from 'playwright';

const BASE = 'http://localhost';
const USERNAME = 'admin';
const PASSWORD = 'Admin123!';

async function test() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const results = [];

  async function log(name, ok, detail = '') {
    results.push({ name, ok, detail });
    console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ': ' + detail : ''}`);
  }

  try {
    // 1. Login page
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForSelector('input[id="username"]', { timeout: 10000 });
    await page.fill('input[id="username"]', USERNAME);
    await page.fill('input[id="password"]', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard', { timeout: 10000 });
    await log('Login', true);

    // 2. Dashboard
    await page.waitForTimeout(2000);
    const dashTitle = await page.textContent('h1');
    await log('Dashboard', dashTitle?.includes('概览') || dashTitle?.includes('Dashboard') || !!dashTitle, dashTitle);

    // 3. Resources page
    await page.goto(`${BASE}/resources`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);
    const resTitle = await page.textContent('h1');
    await log('Resources', !!resTitle, resTitle);

    // 4. Topology
    await page.goto(`${BASE}/topology`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);
    const topoTitle = await page.textContent('h1');
    await log('Topology', !!topoTitle, topoTitle);

    // 5. Monitor
    await page.goto(`${BASE}/monitor`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);
    const monTitle = await page.textContent('h1');
    await log('Monitor', !!monTitle, monTitle);

    // 6. Costs
    await page.goto(`${BASE}/costs`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);
    const costTitle = await page.textContent('h1');
    await log('Costs', !!costTitle, costTitle);

    // 7. AI Settings
    await page.goto(`${BASE}/ai-settings`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(3000);
    const aiTitle = await page.textContent('h1');
    await log('AI Settings', !!aiTitle, aiTitle);

    // 8. Tools Catalog
    await page.goto(`${BASE}/tools`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(3000);
    const toolsTitle = await page.textContent('h1');
    await log('Tools Catalog', !!toolsTitle, toolsTitle);

    // 9. MCP Config
    await page.goto(`${BASE}/mcp`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);
    const mcpTitle = await page.textContent('h1');
    await log('MCP Config', !!mcpTitle, mcpTitle);

    // 10. Users
    await page.goto(`${BASE}/users`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);
    const usersTitle = await page.textContent('h1');
    await log('Users', !!usersTitle, usersTitle);

    // 11. Audit
    await page.goto(`${BASE}/audit`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);
    const auditTitle = await page.textContent('h1');
    await log('Audit', !!auditTitle, auditTitle);

    // 12. Chat
    await page.goto(`${BASE}/chat/react`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(3000);
    const chatContent = await page.textContent('body');
    const hasChatUI = chatContent?.includes('连接') || chatContent?.includes('对话') || chatContent?.includes('会话') || chatContent?.includes('选择');
    await log('Chat', !!hasChatUI, hasChatUI ? 'Chat UI loaded' : 'No chat content found');

    // 13. Cloud Accounts
    await page.goto(`${BASE}/cloud-accounts`, { waitUntil: 'networkidle', timeout: 10000 });
    await page.waitForTimeout(2000);
    const cloudTitle = await page.textContent('h1');
    await log('Cloud Accounts', !!cloudTitle, cloudTitle);

    // Summary
    console.log('\n=== SUMMARY ===');
    const passed = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok).length;
    console.log(`Total: ${results.length}, Passed: ${passed}, Failed: ${failed}`);
    if (failed > 0) {
      console.log('\nFailed tests:');
      results.filter(r => !r.ok).forEach(r => console.log(`  ❌ ${r.name}: ${r.detail}`));
    }

  } catch (err) {
    console.error('Test error:', err.message);
  } finally {
    await browser.close();
  }
}

test();
