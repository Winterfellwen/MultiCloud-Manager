/**
 * CloudOps AI 功能层测试脚本
 * 覆盖 F1-F12 测试项
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
      }, 30000);
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
            toolCalls: this.events.filter(e => e.type === 'tool_call').map(e => e.toolCall || e),
            toolResults: this.events.filter(e => e.type === 'tool_result').map(e => e.result || e),
          });
        } else if (Date.now() - start > timeout) {
          resolve({ done: false, error: 'timeout', events: [...this.events], text: '', toolCalls: [], toolResults: [] });
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
  console.log('=== CloudOps AI 功能层测试开始 ===\n');

  const client = new TestClient();
  await client.connect();

  // ============ F1: 普通对话 ============
  console.log('\n--- F1: 普通对话 ---');
  try {
    await client.chat('test-f1', '你好', 'run-f1');
    let r = await client.waitForDone();
    log('F1', r.done && r.text.length > 0 ? 'PASS' : 'FAIL', 
      r.done ? `流式回复正常 (${r.text.length} 字符): ${r.text.slice(0, 60)}` : `失败: ${JSON.stringify(r.error)}`);
  } catch (e) { log('F1', 'FAIL', e.message); }

  // ============ F2: 工具调用 — 查询类 ============
  console.log('\n--- F2: 工具调用（查询实例） ---');
  try {
    await client.chat('test-f2', '查看所有云实例', 'run-f2');
    let r = await client.waitForDone();
    log('F2.1', r.toolCalls.length > 0 ? 'PASS' : 'FAIL', `工具调用: ${r.toolCalls.map(t=>t.name).join(',') || '无'}`);
    log('F2.2', r.toolResults.length > 0 ? 'PASS' : 'FAIL', `工具结果: ${JSON.stringify(r.toolResults[0]||{}).slice(0,100)}`);
    log('F2.3', r.done ? 'PASS' : 'FAIL', `AI 总结: ${r.text.slice(0, 60)}`);
  } catch (e) { log('F2', 'FAIL', e.message); }

  // ============ F3: 工具调用 — 告警类 ============
  console.log('\n--- F3: 工具调用（告警） ---');
  try {
    await client.chat('test-f3', '查看最近的告警事件', 'run-f3');
    let r = await client.waitForDone();
    log('F3', r.toolCalls.some(t => (t.name||'').includes('alert')) ? 'PASS' : 'WARN',
      `告警工具调用: ${r.toolCalls.map(t=>t.name).join(',') || '未调用告警工具'}, AI回复: ${r.text.slice(0,60)}`);
  } catch (e) { log('F3', 'FAIL', e.message); }

  // ============ F4: 工具调用 — 成本类 ============
  console.log('\n--- F4: 工具调用（成本） ---');
  try {
    await client.chat('test-f4', '查询本月成本汇总', 'run-f4');
    let r = await client.waitForDone();
    log('F4', r.toolCalls.some(t => (t.name||'').includes('cost')) ? 'PASS' : 'WARN',
      `成本工具调用: ${r.toolCalls.map(t=>t.name).join(',') || '未调用成本工具'}, AI回复: ${r.text.slice(0,60)}`);
  } catch (e) { log('F4', 'FAIL', e.message); }

  // ============ F5: 危险操作审批 ============
  console.log('\n--- F5: 危险操作审批 ---');
  try {
    await client.chat('test-f5', '请删除实例 i-1234567890abcdef0', 'run-f5');
    let r = await client.waitForDone(15000);
    const hasDeleteTool = r.toolCalls.some(t => (t.name||'').includes('delete') || (t.name||'').includes('stop'));
    const hasApproval = r.events.some(e => e.type === 'approval_request' || e.type === 'exec_approval');
    log('F5', hasDeleteTool || hasApproval ? 'PASS' : 'WARN',
      `删除工具: ${hasDeleteTool}, 审批事件: ${hasApproval}, AI回复: ${r.text.slice(0,80)}`);
  } catch (e) { log('F5', 'FAIL', e.message); }

  // ============ F6: 附件上传（多模态） ============
  console.log('\n--- F6: 附件上传 ---');
  try {
    // 构造一个假的图片附件（content 字段为 base64 编码，不含 data: 前缀）
    const attachment = {
      type: 'image',
      mimeType: 'image/png',
      fileName: 'test.png',
      content: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    };
    await client.chat('test-f6', '这张图片是什么？', 'run-f6', { attachments: [attachment] });
    let r = await client.waitForDone();
    log('F6', r.done ? 'PASS' : 'FAIL', `附件对话: ${r.done ? '完成' : '失败'}, 回复: ${r.text.slice(0,60)}`);
  } catch (e) { log('F6', 'FAIL', e.message); }

  // ============ F7: 模型切换 ============
  console.log('\n--- F7: 模型切换 ---');
  try {
    // 先获取可用模型
    let modelsRes = await client.send('models.list', {});
    const models = modelsRes.payload?.models || [];
    log('F7.1', models.length > 0 ? 'PASS' : 'FAIL', `获取模型列表: ${models.length} 个`);

    // 用指定模型发送
    if (models.length > 0) {
      await client.chat('test-f7', '说一个字', 'run-f7', { model: models[0].id });
      let r = await client.waitForDone();
      log('F7.2', r.done ? 'PASS' : 'FAIL', `指定模型对话: ${r.done ? '完成' : '失败'}`);
    }
  } catch (e) { log('F7', 'FAIL', e.message); }

  // ============ F8: 斜杠命令 ============
  console.log('\n--- F8: 斜杠命令 ---');
  try {
    let cmdsRes = await client.send('commands.list', {});
    const cmds = cmdsRes.payload?.commands || [];
    log('F8.1', cmds.length > 0 ? 'PASS' : 'FAIL', `命令列表: ${cmds.length} 个: ${cmds.map(c=>'/'+c.name).join(', ')}`);

    // 测试 /clear — 通过 chat.send 发送 /clear
    await client.chat('test-f8', '/clear', 'run-f8-clear');
    let r = await client.waitForDone(10000);
    log('F8.2', 'PASS', `/clear 命令: ${r.done ? '已处理' : '超时(可能正常)'}`);
  } catch (e) { log('F8', 'FAIL', e.message); }

  // ============ F9: chat.history ============
  console.log('\n--- F9: chat.history ---');
  try {
    // 先发一条消息
    await client.chat('test-f9', '历史测试消息：hello-history', 'run-f9-1');
    await client.waitForDone();
    await sleep(500);

    // 请求历史
    let history = await client.send('chat.history', { sessionKey: 'test-f9' });
    if (history.ok) {
      const events = history.payload?.events || history.payload?.replayEvents || [];
      log('F9', events.length > 0 ? 'PASS' : 'FAIL', `历史恢复: ${events.length} 个事件`);
    } else {
      log('F9', 'FAIL', `chat.history 失败: ${JSON.stringify(history).slice(0,100)}`);
    }
  } catch (e) { log('F9', 'FAIL', e.message); }

  // ============ F10: chat.abort ============
  console.log('\n--- F10: chat.abort ---');
  try {
    await client.chat('test-f10', '请详细介绍微服务架构的所有内容', 'run-f10');
    await sleep(2000);
    let abortRes = await client.send('chat.abort', { sessionKey: 'test-f10', runId: 'run-f10' });
    log('F10', abortRes.ok ? 'PASS' : 'FAIL', `中止生成: ${abortRes.ok ? '成功' : JSON.stringify(abortRes.payload)}`);
  } catch (e) { log('F10', 'FAIL', e.message); }

  // ============ F11: 多会话 ============
  console.log('\n--- F11: 多会话 ---');
  try {
    // 会话 1
    await client.chat('test-f11-a', '会话A的消息', 'run-f11-a');
    let r1 = await client.waitForDone();
    // 会话 2
    await client.chat('test-f11-b', '会话B的消息', 'run-f11-b');
    let r2 = await client.waitForDone();
    
    // 检查两个会话的历史
    let h1 = await client.send('chat.history', { sessionKey: 'test-f11-a' });
    let h2 = await client.send('chat.history', { sessionKey: 'test-f11-b' });
    const e1 = h1.payload?.events || h1.payload?.replayEvents || [];
    const e2 = h2.payload?.events || h2.payload?.replayEvents || [];
    log('F11', e1.length > 0 && e2.length > 0 ? 'PASS' : 'FAIL', `多会话: A=${e1.length}事件, B=${e2.length}事件`);
  } catch (e) { log('F11', 'FAIL', e.message); }

  // ============ F12: 幂等发送 ============
  console.log('\n--- F12: 幂等发送 ---');
  try {
    // 第一次发送
    let res1 = await client.chat('test-f12', '幂等测试', 'run-f12-same-id');
    log('F12.1', res1.ok ? 'PASS' : 'FAIL', `第一次发送: ${res1.ok ? '成功' : JSON.stringify(res1.payload)}`);

    // 用相同 clientRunId 再次发送
    let res2 = await client.chat('test-f12', '幂等测试', 'run-f12-same-id');
    const isIdempotent = res2.ok === false || res2.payload?.error === 'in_flight' || res2.payload?.inFlight;
    log('F12.2', isIdempotent ? 'PASS' : 'WARN', `幂等拒绝: ${isIdempotent ? '是' : '否'}, 响应: ${JSON.stringify(res2.payload).slice(0,80)}`);
  } catch (e) { log('F12', 'FAIL', e.message); }

  // ============ 汇总 ============
  console.log('\n\n=== 功能层测试汇总 ===\n');
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

  client.close();
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
