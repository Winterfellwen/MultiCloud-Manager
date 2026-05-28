const automator = require('miniprogram-automator');
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function waitForPage(mp, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const page = await mp.currentPage();
      if (page && page.path && !page.path.includes('login')) {
        return page;
      }
    } catch (e) {}
    await sleep(500);
  }
  return await mp.currentPage();
}

(async () => {
  console.log('=== 连接微信开发者工具 ===');
  const mp = await automator.connect({ wsEndpoint: 'ws://localhost:9420' });
  
  await mp.callWxMethod('setStorageSync', { key: '__automation__', data: '1' });
  console.log('✅ 已连接\n');

  // ========== 1. 账号密码登录 ==========
  console.log('【1】账号密码登录');
  
  await mp.redirectTo('/pages/login/login');
  await sleep(2000);
  
  let page = await mp.currentPage();
  console.log('  页面:', page.path);
  
  // 获取所有输入框
  const inputs = await page.$$('input');
  console.log('  找到', inputs.length, '个输入框');
  
  if (inputs.length >= 2) {
    // 第一个输入框是用户名，第二个是密码
    console.log('  输入用户名: admin');
    await inputs[0].input('admin');
    await sleep(300);
    
    console.log('  输入密码: Test.1234');
    await inputs[1].input('Test.1234');
    await sleep(300);
    
    // 点击登录按钮
    const loginBtn = await page.$('button.btn-login');
    if (loginBtn) {
      console.log('  点击登录按钮...');
      await loginBtn.tap();
      
      // 等待跳转
      page = await waitForPage(mp, 5000);
      console.log('  登录后:', page.path);
      
      if (!page.path.includes('login')) {
        console.log('✅ 登录成功\n');
      } else {
        console.log('⚠️ 登录未跳转\n');
      }
    }
  }

  // ========== 2. AI助手 ==========
  console.log('【2】AI助手 - 输入消息');
  
  await mp.switchTab('/pages/agent/chat');
  await sleep(2000);
  
  page = await mp.currentPage();
  console.log('  页面:', page.path);
  
  // 等待输入框
  let input = null;
  for (let i = 0; i < 5; i++) {
    await sleep(500);
    page = await mp.currentPage();
    input = await page.$('input.message-input');
    if (input) break;
  }
  
  if (input) {
    console.log('  ✅ 找到输入框');
    
    const msg = '列出当前所有资源';
    console.log('  输入:', msg);
    await input.input(msg);
    await sleep(500);
    
    const sendBtn = await page.$('button.send-btn');
    if (sendBtn) {
      await sendBtn.tap();
      console.log('  ✅ 已发送，等待回复...');
      
      await sleep(5000);
      page = await mp.currentPage();
      const data = await page.data();
      const msgs = data.messages || [];
      
      for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === 'assistant' && msgs[i].content) {
          console.log('  AI回复:', msgs[i].content.substring(0, 200));
          break;
        }
      }
    }
  } else {
    console.log('  ⚠️ 未找到输入框');
  }
  console.log('✅ AI助手完成\n');

  // ========== 3. 遍历页面 ==========
  console.log('【3】遍历所有页面');
  const pages = [
    { name: '首页', path: '/pages/index/index', type: 'tab' },
    { name: 'AI助手', path: '/pages/agent/chat', type: 'tab' },
    { name: '资源列表', path: '/pages/resources/list', type: 'tab' },
    { name: '个人中心', path: '/pages/user/profile', type: 'tab' },
    { name: '登录页', path: '/pages/login/login', type: 'sub' },
    { name: '账号列表', path: '/pages/accounts/list', type: 'sub' },
    { name: '添加账号', path: '/pages/accounts/add', type: 'sub' },
    { name: '团队成员', path: '/pages/team/members', type: 'sub' },
    { name: 'Terraform配置', path: '/pages/terraform/list', type: 'sub' },
    { name: 'Terraform上传', path: '/pages/terraform/upload', type: 'sub' },
    { name: '用户管理', path: '/pages/admin/users/users', type: 'sub' },
  ];
  
  let passed = 0, failed = 0;
  for (const p of pages) {
    try {
      if (p.type === 'tab') {
        await mp.switchTab(p.path);
      } else {
        await mp.redirectTo(p.path);
      }
      await sleep(1500);
      page = await mp.currentPage();
      console.log('  ✅', p.name, '-', page.path);
      passed++;
    } catch (e) {
      console.log('  ❌', p.name, '-', e.message.substring(0, 50));
      failed++;
    }
  }
  
  console.log('\n========== 结果 ==========');
  console.log(passed, '通过 /', failed, '失败 /', pages.length, '总计');
  
  mp.disconnect();
  console.log('✅ 完成');
})().catch(e => {
  console.error('❌', e.message);
  process.exit(1);
});
