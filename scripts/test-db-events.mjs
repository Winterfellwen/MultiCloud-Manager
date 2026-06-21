// 直接查询数据库，验证事件持久化情况
import { sql } from 'drizzle-orm';
import { db } from './ai-gateway/src/db/index.js';

console.log('=== 查询数据库事件 ===\n');

// 查询所有事件
try {
  const events = await db.execute(sql`
    SELECT seq, session_key, event_type, payload, timestamp
    FROM acp_replay_events
    ORDER BY session_key, seq
  `);

  console.log(`总事件数: ${events.length}`);

  // 按 session_key 分组
  const sessions = {};
  for (const evt of events) {
    const key = evt.session_key;
    if (!sessions[key]) sessions[key] = [];
    sessions[key].push(evt);
  }

  console.log(`会话数: ${Object.keys(sessions).length}\n`);

  for (const [key, evts] of Object.entries(sessions)) {
    console.log(`会话: ${key}`);
    console.log(`  事件数: ${evts.length}`);

    // 按类型统计
    const typeCount = {};
    for (const evt of evts) {
      typeCount[evt.event_type] = (typeCount[evt.event_type] || 0) + 1;
    }
    for (const [type, count] of Object.entries(typeCount)) {
      console.log(`    ${type}: ${count}`);
    }

    // 显示最近几条事件内容
    console.log(`  最近事件:`);
    const recent = evts.slice(-5);
    for (const evt of recent) {
      let payload = evt.payload;
      try {
        const parsed = JSON.parse(payload);
        payload = JSON.stringify({
          ...parsed,
          message: parsed.message ? parsed.message.slice(0, 30) + '...' : undefined,
          delta: parsed.delta ? parsed.delta.slice(0, 30) + '...' : undefined,
          finalText: parsed.finalText ? parsed.finalText.slice(0, 30) + '...' : undefined,
        });
      } catch {}
      console.log(`    seq=${evt.seq} type=${evt.event_type} payload=${payload}`);
    }
    console.log('');
  }

  // 查询 acp_replay_sessions
  const sessionsTable = await db.execute(sql`
    SELECT session_key, created_at, last_seq
    FROM acp_replay_sessions
    ORDER BY created_at DESC
    LIMIT 10
  `);
  console.log('\nacp_replay_sessions:');
  for (const s of sessionsTable) {
    console.log(`  session=${s.session_key}, created_at=${s.created_at}, last_seq=${s.last_seq}`);
  }

} catch (err) {
  console.error('查询失败:', err.message);
}

process.exit(0);
