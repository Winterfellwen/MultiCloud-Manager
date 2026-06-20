/**
 * CloudOps AI Agent 完整测试脚本
 * 覆盖 A1-A10 测试项
 * 
 * 运行方式：docker exec newcloud-ai-gateway-1 node /app/test-agent.js
 */
const WebSocket = require('ws');

const TOKEN = process.argv[2] || '';
const GATEWAY_URL = 'ws://localhost:3005/ws?token=' + TOKEN;

let testResults = [];
let currentTest = '';

function log(test, status, detail) {
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${icon} [${test}] ${detail}`);
  testResults.push({ test, status, detail });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

class TestClient {
  constructor(name) {
    this.name = name;
    this.ws = null;
    this.msgId = 0;
    this.pending = new Map();
    this.events = [];
    this.connected = false;
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(GATEWAY_URL);
      this.ws.on('open', () => {
        this.connected = true;
        // 订阅 session 事件
        this.send('sessions.subscribe', {});
        resolve();
      });
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
      this.ws.on('error', (err) => {
        if (!this.connected) reject(err);
      });
      setTimeout(() => reject(new Error('connect timeout')), 5000);
    });
  }

  send(method, params) {
    const id = String(++this.msgId);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ type: 'req', id, method, params }));
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          resolve({ ok: false, payload: { error: 'timeout' } });
        }
      }, 30000);
    });
  }

  async chat(sessionKey, message, runId) {
    // 清空之前的事件
    this.events = [];
    const res = await this.send('chat.send', {
      sessionKey,
      message,
      clientRunId: runId || `run-${Date.now()}-${Math.random().toString(36).slice(2,8)}`
    });
    return res;
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

  getText() {
    return this.events.filter(e => e.type === 'text_delta').map(e => e.text || e.delta || '').join('');
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function main() {
  console.log('=== CloudOps AI Agent 测试开始 ===\n');
  console.log('Token: ' + TOKEN.slice(0, 20) + '...\n');

  // ============ A1: 多轮上下文保持 ============
  currentTest = 'A1';
  console.log('\n--- A1: 多轮上下文保持 ---');
  try {
    const client = new TestClient('A1');
    await client.connect();
    
    // 第一轮：告诉 AI 信息
    await client.chat('test-a1', '请记住：我的名字是张三，我负责运维团队', 'run-a1-1');
    let r1 = await client.waitForDone();
    if (r1.done) {
      log('A1.1', 'PASS', '第一轮对话完成: ' + r1.text.slice(0, 60));
    } else {
      log('A1.1', 'FAIL', '第一轮对话失败: ' + JSON.stringify(r1.error));
    }

    await sleep(500);

    // 第二轮：询问之前的信息
    await client.chat('test-a1', '我叫什么名字？', 'run-a1-2');
    let r2 = await client.waitForDone();
    if (r2.done && r2.text.includes('张三')) {
      log('A1.2', 'PASS', '上下文保持成功: AI 记住了"张三"');
    } else if (r2.done) {
      log('A1.2', 'FAIL', '上下文丢失: 回复中未包含"张三"，回复: ' + r2.text.slice(0, 100));
    } else {
      log('A1.2', 'FAIL', '第二轮对话失败: ' + JSON.stringify(r2.error));
    }
    client.close();
  } catch (e) {
    log('A1', 'FAIL', '异常: ' + e.message);
  }

  // ============ A2: 工具调用链 ============
  currentTest = 'A2';
  console.log('\n--- A2: 工具调用链 ---');
  try {
    const client = new TestClient('A2');
    await client.connect();
    
    await client.chat('test-a2', '帮我查看所有云实例，然后告诉我一共有几台实例', 'run-a2-1');
    let r = await client.waitForDone();
    
    if (r.toolCalls.length > 0) {
      log('A2.1', 'PASS', 'AI 调用了工具: ' + r.toolCalls.map(t => t.name).join(', '));
    } else {
      log('A2.1', 'FAIL', 'AI 未调用任何工具');
    }
    
    if (r.toolResults.length > 0) {
      log('A2.2', 'PASS', '工具返回结果: ' + JSON.stringify(r.toolResults[0]).slice(0, 100));
    } else {
      log('A2.2', 'FAIL', '无工具结果');
    }
    
    if (r.done && r.text.length > 0) {
      log('A2.3', 'PASS', 'AI 总结回复: ' + r.text.slice(0, 80));
    } else {
      log('A2.3', 'FAIL', 'AI 未给出总结');
    }
    client.close();
  } catch (e) {
    log('A2', 'FAIL', '异常: ' + e.message);
  }

  // ============ A3: 跨会话隔离 ============
  currentTest = 'A3';
  console.log('\n--- A3: 跨会话隔离 ---');
  try {
    const client = new TestClient('A3');
    await client.connect();
    
    // 会话 A：告诉信息
    await client.chat('test-a3-a', '请记住：我的名字是李四', 'run-a3-1');
    let r1 = await client.waitForDone();
    log('A3.1', r1.done ? 'PASS' : 'FAIL', '会话A设置信息: ' + (r1.done ? '完成' : '失败'));

    await sleep(500);

    // 会话 B：询问信息
    await client.chat('test-a3-b', '我叫什么名字？', 'run-a3-2');
    let r2 = await client.waitForDone();
    if (r2.done) {
      if (!r2.text.includes('李四')) {
        log('A3.2', 'PASS', '会话隔离成功: 会话B不知道"李四"');
      } else {
        log('A3.2', 'FAIL', '会话隔离失败: 会话B知道了"李四"，回复: ' + r2.text.slice(0, 100));
      }
    } else {
      log('A3.2', 'FAIL', '会话B对话失败');
    }
    client.close();
  } catch (e) {
    log('A3', 'FAIL', '异常: ' + e.message);
  }

  // ============ A4: 切换会话恢复 ============
  currentTest = 'A4';
  console.log('\n--- A4: 切换会话恢复 ---');
  try {
    const client = new TestClient('A4');
    await client.connect();
    
    // 会话 A 对话
    await client.chat('test-a4-a', '你好，这是会话A的第一条消息', 'run-a4-1');
    let r1 = await client.waitForDone();
    log('A4.1', r1.done ? 'PASS' : 'FAIL', '会话A对话: ' + (r1.done ? '完成' : '失败'));

    await sleep(500);

    // 会话 B 对话
    await client.chat('test-a4-b', '你好，这是会话B的消息', 'run-a4-2');
    let r2 = await client.waitForDone();
    log('A4.2', r2.done ? 'PASS' : 'FAIL', '会话B对话: ' + (r2.done ? '完成' : '失败'));

    await sleep(500);

    // 切回会话 A，请求历史
    let history = await client.send('chat.history', { sessionKey: 'test-a4-a' });
    if (history.ok && history.payload) {
      const events = history.payload.events || history.payload.replayEvents || [];
      log('A4.3', events.length > 0 ? 'PASS' : 'FAIL', `会话A历史恢复: ${events.length} 个事件`);
    } else {
      log('A4.3', 'FAIL', 'chat.history 返回异常: ' + JSON.stringify(history).slice(0, 150));
    }
    client.close();
  } catch (e) {
    log('A4', 'FAIL', '异常: ' + e.message);
  }

  // ============ A5: 刷新页面恢复（chat.history） ============
  currentTest = 'A5';
  console.log('\n--- A5: 刷新页面恢复 ---');
  try {
    // 第一个连接：发送消息
    const client1 = new TestClient('A5-1');
    await client1.connect();
    await client1.chat('test-a5', '请记住：今天是测试日，编号9527', 'run-a5-1');
    let r1 = await client1.waitForDone();
    log('A5.1', r1.done ? 'PASS' : 'FAIL', '初始对话: ' + (r1.done ? '完成' : '失败'));
    client1.close();

    await sleep(1000);

    // 第二个连接：模拟刷新后恢复
    const client2 = new TestClient('A5-2');
    await client2.connect();
    let history = await client2.send('chat.history', { sessionKey: 'test-a5' });
    if (history.ok) {
      const events = history.payload?.events || history.payload?.replayEvents || [];
      const hasUserMsg = events.some(e => {
        const text = JSON.stringify(e);
        return text.includes('9527') || text.includes('测试日');
      });
      log('A5.2', events.length > 0 ? 'PASS' : 'FAIL', `历史恢复: ${events.length} 个事件，含原始消息: ${hasUserMsg}`);
    } else {
      log('A5.2', 'FAIL', 'chat.history 失败: ' + JSON.stringify(history).slice(0, 150));
    }

    // 验证上下文是否保持
    await client2.chat('test-a5', '我之前说的编号是多少？', 'run-a5-2');
    let r2 = await client2.waitForDone();
    if (r2.done && r2.text.includes('9527')) {
      log('A5.3', 'PASS', '刷新后上下文保持: AI 记住了"9527"');
    } else if (r2.done) {
      log('A5.3', 'FAIL', '刷新后上下文丢失: 回复未包含"9527"，回复: ' + r2.text.slice(0, 100));
    } else {
      log('A5.3', 'FAIL', '刷新后对话失败: ' + JSON.stringify(r2.error));
    }
    client2.close();
  } catch (e) {
    log('A5', 'FAIL', '异常: ' + e.message);
  }

  // ============ A6: 生成中刷新恢复 ============
  currentTest = 'A6';
  console.log('\n--- A6: 生成中刷新恢复 ---');
  try {
    const client1 = new TestClient('A6-1');
    await client1.connect();
    // 发送一个需要较长回复的消息
    await client1.chat('test-a6', '请详细介绍一下云计算的三大服务模型，每个模型至少100字', 'run-a6-1');
    // 等 1 秒让生成开始，然后断开
    await sleep(1000);
    const partialText = client1.getText();
    log('A6.1', partialText.length > 0 ? 'PASS' : 'WARN', `生成中断开，已收到 ${partialText.length} 字符`);
    client1.close();

    await sleep(1000);

    // 新连接恢复
    const client2 = new TestClient('A6-2');
    await client2.connect();
    let history = await client2.send('chat.history', { sessionKey: 'test-a6' });
    if (history.ok) {
      const events = history.payload?.events || history.payload?.replayEvents || [];
      const hasInFlight = history.payload?.inFlightRuns?.length > 0 || events.some(e => e.type === 'text_delta');
      log('A6.2', events.length > 0 ? 'PASS' : 'FAIL', `恢复: ${events.length} 个事件，有生成中内容: ${hasInFlight}`);
    } else {
      log('A6.2', 'FAIL', 'chat.history 失败');
    }
    client2.close();
  } catch (e) {
    log('A6', 'FAIL', '异常: ' + e.message);
  }

  // ============ A7: WS 断线重连恢复 ============
  currentTest = 'A7';
  console.log('\n--- A7: WS 断线重连恢复 ---');
  try {
    const client1 = new TestClient('A7-1');
    await client1.connect();
    await client1.chat('test-a7', '断线重连测试消息：编号7788', 'run-a7-1');
    let r1 = await client1.waitForDone();
    log('A7.1', r1.done ? 'PASS' : 'FAIL', '初始对话: ' + (r1.done ? '完成' : '失败'));
    
    // 模拟断线
    client1.ws.close();
    await sleep(2000);

    // 重连
    const client2 = new TestClient('A7-2');
    await client2.connect();
    let history = await client2.send('chat.history', { sessionKey: 'test-a7' });
    if (history.ok) {
      const events = history.payload?.events || history.payload?.replayEvents || [];
      log('A7.2', events.length > 0 ? 'PASS' : 'FAIL', `断线重连后恢复: ${events.length} 个事件`);
    } else {
      log('A7.2', 'FAIL', '断线重连恢复失败');
    }
    client2.close();
  } catch (e) {
    log('A7', 'FAIL', '异常: ' + e.message);
  }

  // ============ A8: 长对话上下文 ============
  currentTest = 'A8';
  console.log('\n--- A8: 长对话上下文 ---');
  try {
    const client = new TestClient('A8');
    await client.connect();
    
    // 第一轮：设置关键信息
    await client.chat('test-a8', '请记住我的项目代号是PHOENIX，这是一个多云管理项目', 'run-a8-1');
    let r1 = await client.waitForDone();
    log('A8.1', r1.done ? 'PASS' : 'FAIL', '第一轮设置信息: ' + (r1.done ? '完成' : '失败'));

    // 中间几轮：插入其他对话
    for (let i = 2; i <= 4; i++) {
      await sleep(500);
      await client.chat('test-a8', `第${i}轮对话：请简单说一句话`, `run-a8-${i}`);
      let r = await client.waitForDone();
      if (!r.done) {
        log(`A8.${i}`, 'FAIL', `第${i}轮对话失败`);
      }
    }

    // 最后一轮：验证是否还记得
    await sleep(500);
    await client.chat('test-a8', '我的项目代号是什么？', 'run-a8-5');
    let r5 = await client.waitForDone();
    if (r5.done && r5.text.toUpperCase().includes('PHOENIX')) {
      log('A8.5', 'PASS', '5轮对话后上下文保持: AI 记住了"PHOENIX"');
    } else if (r5.done) {
      log('A8.5', 'FAIL', '上下文丢失: 回复未包含"PHOENIX"，回复: ' + r5.text.slice(0, 100));
    } else {
      log('A8.5', 'FAIL', '第5轮对话失败');
    }
    client.close();
  } catch (e) {
    log('A8', 'FAIL', '异常: ' + e.message);
  }

  // ============ A9: Agent 错误恢复 ============
  currentTest = 'A9';
  console.log('\n--- A9: Agent 错误恢复 ---');
  try {
    const client = new TestClient('A9');
    await client.connect();
    
    // 请求查看一个不存在的实例详情
    await client.chat('test-a9', '请查看实例ID为 nonexistent-instance-12345 的详情', 'run-a9-1');
    let r = await client.waitForDone();
    
    if (r.toolCalls.length > 0) {
      log('A9.1', 'PASS', 'AI 调用了工具: ' + r.toolCalls.map(t => t.name).join(', '));
    } else {
      log('A9.1', 'WARN', 'AI 未调用工具（可能直接回复了）');
    }
    
    if (r.done) {
      log('A9.2', 'PASS', 'AI 错误恢复: 给出了回复（未崩溃）: ' + r.text.slice(0, 80));
    } else {
      log('A9.2', 'FAIL', 'AI 崩溃: ' + JSON.stringify(r.error).slice(0, 100));
    }
    client.close();
  } catch (e) {
    log('A9', 'FAIL', '异常: ' + e.message);
  }

  // ============ A10: 中止后继续 ============
  currentTest = 'A10';
  console.log('\n--- A10: 中止后继续 ---');
  try {
    const client = new TestClient('A10');
    await client.connect();
    
    // 发送消息
    await client.chat('test-a10', '请详细介绍Kubernetes的架构组件', 'run-a10-1');
    await sleep(2000); // 等生成开始
    
    // 中止
    let abortRes = await client.send('chat.abort', { sessionKey: 'test-a10', runId: 'run-a10-1' });
    log('A10.1', abortRes.ok ? 'PASS' : 'FAIL', '中止生成: ' + (abortRes.ok ? '成功' : JSON.stringify(abortRes.payload)));

    await sleep(1000);

    // 发送新消息
    await client.chat('test-a10', '简单说一下Docker是什么', 'run-a10-2');
    let r2 = await client.waitForDone();
    if (r2.done && r2.text.length > 0) {
      log('A10.2', 'PASS', '中止后新对话正常: ' + r2.text.slice(0, 60));
    } else {
      log('A10.2', 'FAIL', '中止后新对话失败: ' + JSON.stringify(r2.error));
    }
    client.close();
  } catch (e) {
    log('A10', 'FAIL', '异常: ' + e.message);
  }

  // ============ 汇总 ============
  console.log('\n\n=== 测试汇总 ===\n');
  let pass = 0, fail = 0, warn = 0;
  testResults.forEach(r => {
    if (r.status === 'PASS') pass++;
    else if (r.status === 'FAIL') fail++;
    else warn++;
  });
  console.log(`总计: ${testResults.length} 项 | ✅ 通过: ${pass} | ❌ 失败: ${fail} | ⚠️ 警告: ${warn}`);
  console.log('\n失败项:');
  testResults.filter(r => r.status === 'FAIL').forEach(r => {
    console.log(`  ❌ [${r.test}] ${r.detail}`);
  });
  console.log('\n警告项:');
  testResults.filter(r => r.status === 'WARN').forEach(r => {
    console.log(`  ⚠️ [${r.test}] ${r.detail}`);
  });

  process.exit(fail > 0 ? 1 : 0);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
