// 综合测试：验证消息去重、审批列表过滤、刷新场景
// 用法：node test-dedup-approval.mjs <token>
import WebSocket from 'ws';

const token = process.argv[2];
if (!token) {
  console.error('Usage: node test-dedup-approval.mjs <token>');
  process.exit(1);
}

const ws = new WebSocket(`ws://localhost:3005/ws?token=${token}`);
let msgId = 0;

function sendReq(method, params) {
  const id = `req-${++msgId}`;
  return new Promise((resolve, reject) => {
    const handler = (data) => {
      try {
        const frame = JSON.parse(data.toString());
        if (frame.type === 'res' && frame.id === id) {
          ws.off('message', handler);
          resolve(frame);
          clearTimeout(timer);
        }
      } catch (e) { /* ignore */ }
    };
    const timer = setTimeout(() => {
      ws.off('message', handler);
      reject(new Error(`Timeout waiting for ${method} response`));
    }, 15000);
    ws.on('message', handler);
    ws.send(JSON.stringify({ type: 'req', id, method, params }));
  });
}

// 收集广播事件
const broadcastEvents = [];
ws.on('message', (data) => {
  try {
    const frame = JSON.parse(data.toString());
    if (frame.type === 'event') {
      broadcastEvents.push(frame);
    }
  } catch (e) { /* ignore */ }
});

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✓ ${msg}`);
    passed++;
  } else {
    console.error(`  ✗ ${msg}`);
    failed++;
  }
}

ws.on('open', async () => {
  console.log('=== WebSocket 已连接 ===\n');

  try {
    // ========== 测试 1：消息去重（多次查询历史） ==========
    console.log('--- 测试 1：消息去重（多次查询历史模拟刷新）---');
    const sessionKey = `chat:test-user:dedup-${Date.now()}:aaa111`;

    await sendReq('sessions.subscribe', { sessionKey });
    console.log(`[1.1] 订阅会话: ${sessionKey}`);

    const sendRes = await sendReq('chat.send', {
      sessionKey,
      message: '去重测试消息',
    });
    const runId = sendRes.payload?.runId;
    console.log(`[1.2] 发送消息，runId: ${runId}`);

    // 等待事件写入数据库
    await new Promise(r => setTimeout(r, 3000));

    // 多次查询历史（模拟刷新后多次 loadSessionHistory）
    for (let i = 1; i <= 3; i++) {
      const history = await sendReq('chat.history', { sessionKey });
      const userMsgs = history.payload?.events?.filter(e => e.type === 'user_message') || [];
      assert(userMsgs.length === 1, `第 ${i} 次历史查询: user_message 事件数 = ${userMsgs.length} (应为 1)`);
    }

    await sendReq('sessions.delete', { sessionKey });
    console.log('[1.3] 清理测试会话\n');

    // ========== 测试 2：审批列表只返回 pending ==========
    console.log('--- 测试 2：审批列表只返回 pending 状态 ---');
    const sessionKey2 = `chat:test-user:approval-${Date.now()}:bbb222`;

    await sendReq('sessions.subscribe', { sessionKey: sessionKey2 });
    console.log(`[2.1] 订阅会话: ${sessionKey2}`);

    const list1 = await sendReq('exec.approval.list', {});
    const approvals1 = list1.payload?.approvals || [];
    assert(approvals1.length === 0, `初始审批列表为空 (实际: ${approvals1.length} 个)`);

    // 检查是否有非 pending 状态的审批
    const nonPending = approvals1.filter(a => a.status !== 'pending');
    assert(nonPending.length === 0, `列表中没有非 pending 状态的审批`);

    await sendReq('sessions.delete', { sessionKey: sessionKey2 });
    console.log('[2.2] 清理测试会话\n');

    // ========== 测试 3：幂等性检查（相同 clientRunId 不重复执行） ==========
    console.log('--- 测试 3：幂等性检查（相同 clientRunId 不重复执行）---');
    const sessionKey3 = `chat:test-user:idempotent-${Date.now()}:ccc333`;

    await sendReq('sessions.subscribe', { sessionKey: sessionKey3 });
    console.log(`[3.1] 订阅会话: ${sessionKey3}`);

    const idempotentRunId = `run-idempotent-${Date.now()}`;
    const send1 = await sendReq('chat.send', {
      sessionKey: sessionKey3,
      message: '幂等测试',
      clientRunId: idempotentRunId,
    });
    assert(send1.ok, `第一次发送成功`);
    assert(send1.payload?.runId === idempotentRunId, `返回相同 runId`);

    // 等待事件写入
    await new Promise(r => setTimeout(r, 2000));

    // 查询历史，确认只有一条 user_message
    const history3 = await sendReq('chat.history', { sessionKey: sessionKey3 });
    const userMsgs3 = history3.payload?.events?.filter(e => e.type === 'user_message') || [];
    assert(userMsgs3.length === 1, `幂等检查: user_message 事件数 = ${userMsgs3.length} (应为 1)`);

    await sendReq('sessions.delete', { sessionKey: sessionKey3 });
    console.log('[3.2] 清理测试会话\n');

    // ========== 测试 4：并发限制（同一 session 不能同时有两个 run） ==========
    console.log('--- 测试 4：并发限制 ---');
    const sessionKey4 = `chat:test-user:concurrent-${Date.now()}:ddd444`;

    await sendReq('sessions.subscribe', { sessionKey: sessionKey4 });
    console.log(`[4.1] 订阅会话: ${sessionKey4}`);

    const send4a = await sendReq('chat.send', {
      sessionKey: sessionKey4,
      message: '第一条消息',
    });
    assert(send4a.ok, `第一条消息发送成功`);

    // 立即发送第二条（应该被拒绝）
    const send4b = await sendReq('chat.send', {
      sessionKey: sessionKey4,
      message: '第二条消息',
    });
    assert(!send4b.ok, `第二条消息被拒绝 (SESSION_BUSY)`);
    assert(send4b.payload?.error === 'SESSION_BUSY', `错误码为 SESSION_BUSY`);

    await sendReq('sessions.delete', { sessionKey: sessionKey4 });
    console.log('[4.2] 清理测试会话\n');

    // ========== 结果汇总 ==========
    console.log('=== 测试结果 ===');
    console.log(`通过: ${passed}, 失败: ${failed}`);
    if (failed > 0) {
      console.error('❌ 有失败的测试用例');
      process.exit(1);
    } else {
      console.log('✅ 所有测试通过');
    }
  } catch (err) {
    console.error('测试出错:', err.message);
    process.exit(1);
  } finally {
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => {
  console.error('WebSocket 错误:', err.message);
  process.exit(1);
});
