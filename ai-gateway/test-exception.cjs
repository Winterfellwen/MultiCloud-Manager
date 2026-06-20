/**
 * CloudOps AI 异常/边界测试脚本
 * 覆盖 E1-E6 测试项
 * 用法: node test-exception.cjs <token>
 */
const WebSocket = require('ws');

const TOKEN = process.argv[2] || '';
const GATEWAY_URL = 'ws://localhost:3005/ws?token=' + TOKEN;

let testResults = [];

function log(test, status, detail) {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} [${test}] ${detail}`);
  testResults.push({ test, status, detail });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class TestClient {
  constructor() {
    this.ws = null;
    this.msgId = 0;
    this.pending = new Map();
    this.events = [];
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(GATEWAY_URL);
      this.ws.on('open', () => { this.connected = true; resolve(); });
      this.ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'res' && this.pending.has(msg.id)) {
          const { resolve: res } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          res(msg);
        } else if (msg.type === 'event') {
          this.events.push(msg.payload);
        }
      });
      this.ws.on('error', reject);
      setTimeout(() => reject(new Error('timeout')), 5000);
    });
  }

  send(method, params) {
    const id = String(++this.msgId);
    return new Promise((resolve) => {
      this.pending.set(id, { resolve });
      this.ws.send(JSON.stringify({ type: 'req', id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          resolve({ ok: false, payload: { error: 'timeout' } });
        }
      }, 15000);
    });
  }

  async chat(sessionKey, message, runId, extra) {
    this.events = [];
    const params = { sessionKey, message, clientRunId: runId || `run-${Date.now()}` };
    if (extra) Object.assign(params, extra);
    return await this.send('chat.send', params);
  }

  waitForDone(timeout = 30000) {
    return new Promise((resolve) => {
      const start = Date.now();
      const check = () => {
        const doneEvent = this.events.find(e => e.type === 'done' || e.type === 'error');
        if (doneEvent) {
          resolve({
            done: doneEvent.type === 'done',
            error: doneEvent.type === 'error' ? doneEvent : null,
            events: [...this.events],
            text: this.events.filter(e => e.type === 'text_delta').map(e => e.text || e.delta || '').join(''),
          });
        } else if (Date.now() - start > timeout) {
          resolve({ done: false, error: 'timeout', events: [...this.events], text: '' });
        } else {
          setTimeout(check, 200);
        }
      };
      check();
    });
  }

  close() { if (this.ws) this.ws.close(); }
}

async function main() {
  console.log('=== CloudOps AI 异常/边界测试开始 ===\n');

  // ============ E1: 无效 Token 连接 ============
  console.log('\n--- E1: 无效 Token 连接 ---');
  try {
    const badWs = new WebSocket('ws://localhost:3005/ws?token=invalid-token-xxx');
    const result = await new Promise((resolve) => {
      let opened = false;
      badWs.on('open', () => { opened = true; });
      badWs.on('error', () => resolve({ connected: false, error: 'rejected' }));
      badWs.on('close', (code) => resolve({ connected: false, closed: true, code, wasOpen: opened }));
      badWs.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'error' && msg.error?.includes('AUTH')) {
            resolve({ connected: false, rejected: true, error: msg.error });
          }
        } catch (e) {}
      });
      // 给足时间让 close 事件触发
      setTimeout(() => resolve({ timeout: true, wasOpen: opened }), 3000);
    });
    // 服务端会先 open 连接，然后发送 error 消息并 close(4001)
    // 所以"被拒绝"的判断标准是：收到 close 或 AUTH error 消息
    const rejected = result.closed || result.rejected || result.error;
    log('E1', rejected ? 'PASS' : 'FAIL',
      `无效token被拒绝: ${rejected ? '是' : '否'}, code=${result.code || 'N/A'}, error=${result.error || 'N/A'}`);
    try { badWs.close(); } catch (e) {}
  } catch (e) { log('E1', 'FAIL', e.message); }

  // ============ E2: 空 Token 连接 ============
  console.log('\n--- E2: 空 Token 连接 ---');
  try {
    const emptyWs = new WebSocket('ws://localhost:3005/ws?token=');
    const result = await new Promise((resolve) => {
      let opened = false;
      emptyWs.on('open', () => { opened = true; });
      emptyWs.on('error', () => resolve({ connected: false, error: 'rejected' }));
      emptyWs.on('close', (code) => resolve({ connected: false, closed: true, code, wasOpen: opened }));
      emptyWs.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString());
          if (msg.type === 'error' && msg.error?.includes('AUTH')) {
            resolve({ connected: false, rejected: true, error: msg.error });
          }
        } catch (e) {}
      });
      setTimeout(() => resolve({ timeout: true, wasOpen: opened }), 3000);
    });
    const rejected = result.closed || result.rejected || result.error;
    log('E2', rejected ? 'PASS' : 'FAIL',
      `空token被拒绝: ${rejected ? '是' : '否'}, code=${result.code || 'N/A'}, error=${result.error || 'N/A'}`);
    try { emptyWs.close(); } catch (e) {}
  } catch (e) { log('E2', 'FAIL', e.message); }

  // ============ E3: 超长消息 ============
  console.log('\n--- E3: 超长消息 ---');
  try {
    const client = new TestClient();
    await client.connect();
    const longMsg = 'A'.repeat(10000); // 10KB 消息
    const res = await client.chat('test-e3', longMsg, 'run-e3');
    log('E3.1', res.ok ? 'PASS' : 'FAIL', `超长消息发送: ${res.ok ? '接受' : JSON.stringify(res.payload).slice(0,80)}`);
    if (res.ok) {
      const r = await client.waitForDone(30000);
      log('E3.2', r.done ? 'PASS' : 'WARN', `超长消息处理: ${r.done ? '完成' : r.error}`);
    }
    client.close();
  } catch (e) { log('E3', 'FAIL', e.message); }

  // ============ E4: 空消息 ============
  console.log('\n--- E4: 空消息 ---');
  try {
    const client = new TestClient();
    await client.connect();
    const res = await client.chat('test-e4', '', 'run-e4');
    log('E4', !res.ok || res.payload?.error ? 'PASS' : 'WARN',
      `空消息处理: ${!res.ok ? '被拒绝' : '被接受(可能正常)'}, ${JSON.stringify(res.payload).slice(0,80)}`);
    client.close();
  } catch (e) { log('E4', 'FAIL', e.message); }

  // ============ E5: 并发请求（同一会话） ============
  console.log('\n--- E5: 并发请求（同一会话） ---');
  try {
    const client = new TestClient();
    await client.connect();
    // 同时发送两条消息到同一会话
    const [res1, res2] = await Promise.all([
      client.chat('test-e5', '第一条消息', 'run-e5-1'),
      client.chat('test-e5', '第二条消息', 'run-e5-2'),
    ]);
    // 至少一条应该成功，另一条应该被拒绝（in_flight）
    const bothOk = res1.ok && res2.ok;
    const oneRejected = !res1.ok || !res2.ok;
    log('E5', oneRejected ? 'PASS' : 'WARN',
      `并发请求: res1=${res1.ok}, res2=${res2.ok}, ${oneRejected ? '正确拒绝并发' : '都接受了(可能有问题)'}`);
    client.close();
  } catch (e) { log('E5', 'FAIL', e.message); }

  // ============ E6: 不存在的 sessionKey 查历史 ============
  console.log('\n--- E6: 不存在的 sessionKey 查历史 ---');
  try {
    const client = new TestClient();
    await client.connect();
    const res = await client.send('chat.history', { sessionKey: 'nonexistent-session-xxx' });
    // 应该返回空数组而不是报错
    const events = res.payload?.events || res.payload?.replayEvents || [];
    log('E6', res.ok && events.length === 0 ? 'PASS' : 'WARN',
      `不存在会话历史: ${res.ok ? '正常返回空' : '报错'}, events=${events.length}`);
    client.close();
  } catch (e) { log('E6', 'FAIL', e.message); }

  // ============ 汇总 ============
  console.log('\n\n=== 异常/边界测试汇总 ===\n');
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

  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
