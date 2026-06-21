// 直接用 PostgreSQL 客户端查询数据库事件
import pg from 'pg';

const client = new pg.Client({
  host: 'localhost',
  port: 5432,
  database: 'cloudops',
  user: 'cloudops',
  password: 'cloudops',
});

await client.connect();

console.log('=== 查询数据库事件 ===\n');

// 查询所有事件
const eventsRes = await client.query(`
  SELECT seq, session_key, event_type, payload, timestamp
  FROM acp_replay_events
  ORDER BY session_key, seq
`);

console.log(`总事件数: ${eventsRes.rows.length}`);

// 按 session_key 分组
const sessions = {};
for (const evt of eventsRes.rows) {
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

  // 显示最近几条事件
  console.log(`  最近事件:`);
  const recent = evts.slice(-8);
  for (const evt of recent) {
    let payloadStr = String(evt.payload);
    try {
      const parsed = typeof evt.payload === 'object' ? evt.payload : JSON.parse(payloadStr);
      const summary = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string' && v.length > 40) {
          summary[k] = v.slice(0, 40) + '...';
        } else if (typeof v === 'object') {
          summary[k] = `[object ${v?.name || 'Object'}]`;
        } else {
          summary[k] = v;
        }
      }
      payloadStr = JSON.stringify(summary);
    } catch {}
    console.log(`    seq=${evt.seq} type=${evt.event_type} payload=${payloadStr}`);
  }
  console.log('');
}

// 查询 acp_replay_sessions
const sessionsRes = await client.query(`
  SELECT session_key, created_at, last_seq
  FROM acp_replay_sessions
  ORDER BY created_at DESC
  LIMIT 10
`);
console.log('\nacp_replay_sessions:');
for (const s of sessionsRes.rows) {
  console.log(`  session=${s.session_key}, created_at=${s.created_at}, last_seq=${s.last_seq}`);
}

await client.end();
console.log('\n=== 查询完成 ===');
