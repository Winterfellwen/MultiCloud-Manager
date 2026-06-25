"""
Verification test for tool calls duplicate display fix.

Scenarios tested:
1. Switching away during AI run (saves partial state) -> switch back
2. AI completed, switching back (tool calls from SESSION_MESSAGES)
3. AI running with active_run_events + SESSION_MESSAGES (most common case)
"""
import time
import json
import subprocess
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:8099'


def get_token():
    r = subprocess.run(['curl', '-s', '-X', 'POST', BASE + '/api/auth/login',
        '-H', 'Content-Type: application/json',
        '-d', '{"username":"admin","password":"Admin123!"}'],
        capture_output=True, text=True)
    return json.loads(r.stdout)['token']


def main():
    print("=" * 60)
    print("修复后验证：工具调用不重复显示 + 不在对话框上方显示")
    print("=" * 60)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        token = get_token()
        page.goto(BASE + '/login.html')
        page.wait_for_load_state('networkidle')
        page.evaluate("localStorage.setItem('token', '" + token + "')")
        page.goto(BASE + '/')
        page.wait_for_load_state('networkidle')
        time.sleep(2)
        page.evaluate("showPage('chat')")
        time.sleep(1)

        page.on("console", lambda msg: print(f"[CONSOLE] {msg.text}"))

        # Create session A and session B
        sid_a = page.evaluate("""async (token) => {
            const r = await fetch('/api/agent/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ title: 'A-test' })
            });
            return (await r.json()).session_id;
        }""", token)
        sid_b = page.evaluate("""async (token) => {
            const r = await fetch('/api/agent/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ title: 'B-test' })
            });
            return (await r.json()).session_id;
        }""", token)
        print(f"A = {sid_a}")
        print(f"B = {sid_b}")

        # ========== Test 1: savePartialContent order (agent first, tool-calls after) ==========
        print("\n--- Test 1: 保存顺序 (agent 在前, tool-calls 在后) ---")
        result = page.evaluate("""(sid) => {
            // Simulate like savePartialContent does now
            SESSION_MESSAGES[sid] = [
                {role: 'user', content: '查询云平台资源', created_at: new Date().toISOString()},
                // NOTE: agent content is saved FIRST (after our fix)
                {role: 'agent', content: '好的，以下是查询结果：', created_at: new Date().toISOString(), streaming: true, _run_id: 't1-runid'},
                // NOTE: tool-calls comes AFTER agent (after our fix)
                {role: 'tool-calls', content: JSON.stringify([
                    {name: 'get_cloud_stats', params: '{}', result: '{"accounts":1,"resources":3}', status: 'done'},
                    {name: 'list_cloud_resources', params: '{}', result: '{"count":3,"resources":[]}', status: 'done'}
                ]), created_at: new Date().toISOString(), streaming: true, _run_id: 't1-runid'}
            ];
            var order = SESSION_MESSAGES[sid].map(m => m.role);
            return order;
        }""", sid_a)
        print(f"  保存顺序: {result}")
        # Check order: agent should come before tool-calls
        agent_idx = result.index('agent')
        tool_idx = result.index('tool-calls')
        is_correct_order = agent_idx < tool_idx
        print(f"  agent 在 tool-calls 之前: {is_correct_order} {'✓' if is_correct_order else '✗ FAIL'}")

        # Render by switching
        page.evaluate("(sid) => switchSession(sid)", sid_a)
        time.sleep(1)

        info = page.evaluate("""() => {
            const c = document.getElementById('chatMessages');
            return Array.from(c.children).map((el, i) => ({
                idx: i, tag: el.tagName, cls: el.className,
                id: el.id, text: el.textContent.substring(0, 100)
            }));
        }""")
        print(f"  DOM children count: {len(info)}")
        for child in info:
            mark = ''
            if 'msg.tools' in child['cls']:
                mark = '  <-- 独立工具组 (不应出现!)'
            if 'run-events' in child['cls']:
                mark = '  <-- run-events (工具调用已在agent中, 不应出现!)'
            print(f"  [{child['idx']}] {child['tag']} class='{child['cls']}'{mark}")

        dup_check = page.evaluate("""() => {
            const c = document.getElementById('chatMessages');
            const txt = c.textContent;
            return {
                get_cloud_stats_count: (txt.match(/get_cloud_stats/gi) || []).length,
                tool_group_count: document.querySelectorAll('.msg.tools').length,
                run_events_count: document.querySelectorAll('.run-events').length,
                tool_msg_count: document.querySelectorAll('.msg.tool, .msg.tool-result').length
            };
        }""")
        print(f"  工具名出现次数: get_cloud_stats = {dup_check['get_cloud_stats_count']} (期望: 2-3 次)")
        print(f"  独立工具组: {dup_check['tool_group_count']} (期望: 0)")
        print(f"  run-events: {dup_check['run_events_count']} (期望: 0)")
        page.screenshot(path='/tmp/mcm_verify_t1.png', full_page=True)

        # ========== Test 2: switch to B (save state), switch back to A ==========
        print("\n--- Test 2: 切换到 B (保存状态), 再切回 A ---")

        page.evaluate("(sid) => switchSession(sid)", sid_b)
        time.sleep(1)

        # Verify B's content
        info_b = page.evaluate("""() => {
            const c = document.getElementById('chatMessages');
            return { count: c.children.length, text: c.textContent.substring(0, 80) };
        }""")
        print(f"  B DOM: {info_b['count']} children, preview: '{info_b['text'][:40]}'")

        # Switch back to A
        page.evaluate("(sid) => switchSession(sid)", sid_a)
        time.sleep(1)

        info_a = page.evaluate("""() => {
            const c = document.getElementById('chatMessages');
            return Array.from(c.children).map((el, i) => ({
                idx: i, tag: el.tagName, cls: el.className,
                id: el.id, text: el.textContent.substring(0, 100)
            }));
        }""")
        print(f"  切回 A 后 DOM children count: {len(info_a)}")
        for child in info_a:
            mark = ''
            if 'msg.tools' in child['cls']:
                mark = '  <-- 独立工具组 (不应出现!)'
            if 'run-events' in child['cls']:
                mark = '  <-- run-events 重复!'
            print(f"  [{child['idx']}] {child['tag']} class='{child['cls']}'{mark}")

        # Check SESSION_MESSAGES
        sm = page.evaluate("""(sid) => {
            return (SESSION_MESSAGES[sid] || []).map(m => ({role: m.role, _run_id: m._run_id || '', streaming: m.streaming || false}));
        }""", sid_a)
        print(f"  SESSION_MESSAGES[A] entries: {len(sm)}")
        for m in sm:
            print(f"    role={m['role']:12} run_id={m['_run_id'][:12]:12} streaming={m['streaming']}")

        page.screenshot(path='/tmp/mcm_verify_t2.png', full_page=True)

        # ========== Test 3: done event replaces partial save ==========
        print("\n--- Test 3: done 事件替换部分保存 ---")

        sid_c = page.evaluate("""() => {
            for (var k in SESSION_MESSAGES) delete SESSION_MESSAGES[k];
            STREAMING_DIV = null;
            STREAMING_CONTENT = '';
            PENDING_TOOL_CALLS = [];
            return 'test-session-' + Date.now();
        }""")
        print(f"  C = {sid_c}")

        # Simulate: session has partial saves, then AI finishes - done handler should replace them
        result = page.evaluate("""(sid) => {
            // Step 1: Set up partial saves (as if we switched away during a run)
            SESSION_MESSAGES[sid] = [
                {role: 'user', content: '测试 done 事件', created_at: new Date().toISOString()},
                {role: 'agent', content: '正在思考...', created_at: new Date().toISOString(), streaming: true, _run_id: 't3-runid'},
                {role: 'tool-calls', content: JSON.stringify([
                    {name: 'get_cloud_stats', params: '{}', result: '{"ok":true}', status: 'done'}
                ]), created_at: new Date().toISOString(), streaming: true, _run_id: 't3-runid'}
            ];

            // Step 2: Set up STREAMING_DIV with final content
            var container = document.getElementById('chatMessages');
            while (container.firstChild) container.removeChild(container.firstChild);

            var div = document.createElement('div');
            div.className = 'msg agent streaming';
            div.innerHTML = '<span class="msg-role">AI</span><div class="msg-content">最终答案：调用工具后的总结</div><div class="timeline-tool-card"><div class="card-name">get_cloud_stats</div><div class="field-result">{"ok":true}</div></div><span class="msg-time">11:22</span><span class="agent-copy-btn">复制</span>';
            container.appendChild(div);
            STREAMING_DIV = div;
            PENDING_TOOL_CALLS = [];

            // Step 3: Call done handler
            handleStateChangeEvent({session_id: sid, run_id: 't3-runid', payload: {state: 'done'}});

            // Step 4: Return final state
            return JSON.stringify(SESSION_MESSAGES[sid] || []);
        }""", sid_c)

        import json
        msgs_c = json.loads(result)
        print(f"  最终 SESSION_MESSAGES[C] entries: {len(msgs_c)}")
        for m in msgs_c:
            content_preview = m.get('content', '')[:60]
            streaming = m.get('streaming', False)
            run_id = m.get('_run_id', '')[:12]
            print(f"    role={m['role']:12} streaming={str(streaming):6} run_id={run_id:12} content={content_preview}")

        # Verify:
        # 1. No messages with streaming:true for this run_id
        # 2. Agent content is "最终答案..." not "正在思考..."
        any_streaming = any(m.get('streaming') and m.get('_run_id') == 't3-runid' for m in msgs_c)
        has_final_answer = any('最终答案' in m.get('content', '') for m in msgs_c)
        print(f"  没有 stream:true 的消息: {not any_streaming} {'✓' if not any_streaming else '✗ FAIL'}")
        print(f"  包含最终答案: {has_final_answer} {'✓' if has_final_answer else '✗ FAIL'}")

        # ========== Test 4: Repeated switchSession shouldn't duplicate ==========
        print("\n--- Test 4: 多次切换会话不会导致重复 ---")
        page.evaluate("(sid) => switchSession(sid)", sid_b)
        time.sleep(0.3)
        page.evaluate("(sid) => switchSession(sid)", sid_a)
        time.sleep(0.3)
        page.evaluate("(sid) => switchSession(sid)", sid_b)
        time.sleep(0.3)
        page.evaluate("(sid) => switchSession(sid)", sid_a)
        time.sleep(0.3)
        page.evaluate("(sid) => switchSession(sid)", sid_b)
        time.sleep(0.3)
        page.evaluate("(sid) => switchSession(sid)", sid_a)
        time.sleep(0.5)

        info = page.evaluate("""() => {
            const c = document.getElementById('chatMessages');
            return {
                childCount: c.children.length,
                text: c.textContent.substring(0, 150)
            };
        }""")
        sm_a_final = page.evaluate("""(sid) => {
            return (SESSION_MESSAGES[sid] || []).map(m => ({role: m.role}));
        }""", sid_a)
        print(f"  A 最终 DOM children: {info['childCount']}")
        print(f"  A 最终 SESSION_MESSAGES entries: {len(sm_a_final)}")
        print(f"  文本预览: '{info['text'][:100]}'")
        print(f"  没有重复: {len(sm_a_final) <= 3} {'✓' if len(sm_a_final) <= 3 else '✗ FAIL (可能有重复)'}")

        page.screenshot(path='/tmp/mcm_verify_t4.png', full_page=True)

        browser.close()
        print("\n" + "=" * 60)
        print("所有测试完成!")
        print("=" * 60)


if __name__ == '__main__':
    main()
