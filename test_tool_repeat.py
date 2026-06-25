"""
Precise test for tool calls appearing as plain text group when switching sessions.
Simulates: AI running with tool calls -> switch away -> switch back.
"""
import time
import json
import subprocess
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:8099'


def get_token():
    r = subprocess.run(['curl', '-s', '-X', 'POST', BASE + '/api/auth/login',
        '-H', 'Content-Type: application/json',
        '-d', '{"username":"admin","password":"Admin123!"}'], capture_output=True, text=True)
    return json.loads(r.stdout)['token']


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        token = get_token()
        page.goto(BASE + '/login.html')
        page.wait_for_load_state('networkidle')
        page.evaluate(f"localStorage.setItem('token', '{token}')")
        page.goto(BASE + '/')
        page.wait_for_load_state('networkidle')
        time.sleep(2)
        page.evaluate("showPage('chat')")
        time.sleep(1)

        # ===== TEST: Switch away while AI is running (with tool calls already in progress) =====
        print("=" * 60)
        print("TEST: Switch away during AI run (with tool calls), then switch back")
        print("=" * 60)

        # Create session A
        s_a = page.evaluate("""async (token) => {
            const r = await fetch('/api/agent/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ title: 'A' })
            });
            return await r.json();
        }""", token)
        sid_a = s_a.get('session_id')

        # Create session B
        s_b = page.evaluate("""async (token) => {
            const r = await fetch('/api/agent/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ title: 'B' })
            });
            return await r.json();
        }""", token)
        sid_b = s_b.get('session_id')

        print(f"A = {sid_a}")
        print(f"B = {sid_b}")

        # Simulate: user sends message, AI streaming, tool calls have been issued
        # In this state, SESSION_MESSAGES[A] would have:
        #   user -> tool-calls (from handleToolStartEvent) -> agent (streaming)
        # But savePartialContent saves: tool-calls first, then agent
        # And switchSession's own save logic: tool-calls first, then agent

        # Populate SESSION_MESSAGES[A] like the system would after handle events
        page.evaluate(f"""(sid) => {{
            SESSION_MESSAGES[sid] = [
                {{role: 'user', content: '查询云平台资源', created_at: new Date().toISOString()}},
                {{role: 'tool-calls', content: JSON.stringify([
                    {{name: 'get_cloud_stats', params: '{{}}', result: '{{"accounts":1,"resources":3}}', status: 'done'}},
                    {{name: 'list_cloud_resources', params: '{{}}', result: '{{"count":3,"resources":[]}}', status: 'done'}}
                ]), created_at: new Date().toISOString(), streaming: true, _run_id: 'run-xyz'}},
                {{role: 'agent', content: '好的，以下是查询结果：', created_at: new Date().toISOString(), streaming: true, _run_id: 'run-xyz'}}
            ];
        }}""", sid_a)

        # Override API fetch to return "running" state
        page.evaluate(f"""(sid) => {{
            window._origFetch = window._origFetch || window.fetch;
            window.fetch = function(url, opts) {{
                if (typeof url === 'string' && url.includes('/api/agent/sessions/{sid}') && (!opts || opts.method === undefined || opts.method === 'GET')) {{
                    return Promise.resolve(new Response(JSON.stringify({{
                        session_id: sid,
                        status: 'running',
                        active_run_id: 'run-xyz',
                        active_run_events: [
                            {{event_type: 'tool_start', payload: {{tool_calls: [
                                {{function: {{arguments: '{{}}', name: 'get_cloud_stats'}}, id: 't1'
                            ]}}}},
                            {{event_type: 'tool_result', payload: {{tool_name: 'get_cloud_stats', result: '{{"accounts":1,"resources":3}}'}},
                            {{event_type: 'tool_start', payload: {{tool_calls: [
                                {{function: {{arguments: '{{}}', name: 'list_cloud_resources'}}, id: 't2'
                            ]}}}},
                            {{event_type: 'tool_result', payload: {{tool_name: 'list_cloud_resources', result: '{{"count":3,"resources":[]}}'}},
                        ],
                        messages: [
                            {{role: 'user', content: '查询云平台资源', created_at: new Date().toISOString()}},
                            {{role: 'agent', content: '好的，以下是查询结果：', created_at: new Date().toISOString()}}
                        ],
                        pending_runs: [],
                        incomplete_runs: []
                    }}), {{status: 200, headers: {{'Content-Type': 'application/json'}}}});
                }}
                return window._origFetch(url, opts);
            }};
        }}""", sid_a)

        # Switch to session A
        page.evaluate(f"switchSession('{sid_a}')")
        time.sleep(1)

        # Print DOM
        info = page.evaluate("""() => {
            const c = document.getElementById('chatMessages');
            return Array.from(c.children).map((el, i) => ({
                idx: i,
                tag: el.tagName,
                cls: el.className,
                id: el.id,
                text: el.textContent.substring(0, 100)
            }));
        }""")

        print(f"\nDOM has {len(info)} children:")
        for child in info:
            mark = ''
            if 'msg.tools' in child['cls']:
                mark = '  <-- 独立的 tool group（可能是重复的纯文本工具调用）'
            if 'run-events' in child['cls']:
                mark = '  <-- active_run_events 再次渲染'
            if child['cls'] == 'msg tool' or child['cls'] == 'msg tool-result':
                mark = '  <-- 独立的 tool 消息'
            print(f"  [{child['idx']}] {child['tag']} class='{child['cls']}' id='{child['id']}'{mark}")
            print(f"       text: {child['text'][:80]}")

        # Check for duplicates
        dup_check = page.evaluate("""() => {
            const c = document.getElementById('chatMessages');
            const txt = c.textContent;
            return {
                get_cloud_stats_count: (txt.match(/get_cloud_stats/gi) || []).length,
                list_cloud_resources_count: (txt.match(/list_cloud_resources/gi) || []).length,
                tool_group_count: document.querySelectorAll('.msg.tools').length,
                run_events_count: document.querySelectorAll('.run-events').length,
                tool_card_count: document.querySelectorAll('.timeline-tool-card, .tool-card').length,
                inline_tool_count: document.querySelectorAll('.inline-tool-calls, .tool-calls-inline').length
            };
        }""")
        print(f"\nDuplicate analysis: {dup_check}")

        # Also print SESSION_MESSAGES
        sm = page.evaluate("""(sid) => {
            return (SESSION_MESSAGES[sid] || []).map(m => ({role: m.role, content_preview: (m.content || '').substring(0, 60)}));
        }""", sid_a)
        print(f"\nSESSION_MESSAGES[A]: {len(sm)} entries")
        for m in sm:
            print(f"  role={m['role']:12} content={m['content_preview'][:60]}")

        page.screenshot(path='/tmp/mcm_test_duplicate2.png', full_page=True)

        # ===== TEST 2: AI has already completed, switching back =====
        print("\n" + "=" * 60)
        print("TEST 2: AI completed, switch away, switch back")
        print("=" * 60)

        # Override: return done state with messages that include tool-calls
        page.evaluate(f"""(sid) => {{
            window.fetch = function(url, opts) {{
                if (typeof url === 'string' && url.includes('/api/agent/sessions/{sid}') && (!opts || opts.method === undefined || opts.method === 'GET')) {{
                    return Promise.resolve(new Response(JSON.stringify({{
                        session_id: sid,
                        status: 'idle',
                        active_run_id: '',
                        active_run_events: [],
                        messages: [
                            {{role: 'user', content: '查询云平台资源', created_at: new Date().toISOString()}},
                            {{role: 'tool-calls', content: JSON.stringify([
                                {{name: 'get_cloud_stats', params: '{{}}', result: '{{"accounts":1,"resources":3}}', status: 'done'}},
                                {{name: 'list_cloud_resources', params: '{{}}', result: '{{"count":3,"resources":[]}}', status: 'done'}}
                            ]), created_at: new Date().toISOString()}},
                            {{role: 'agent', content: '好的，以下是查询结果：\\n\\n账号数：1\\n资源数：3', created_at: new Date().toISOString()}}
                        ],
                        pending_runs: [],
                        incomplete_runs: []
                    }}), {{status: 200, headers: {{'Content-Type': 'application/json'}}}});
                }}
                return window._origFetch(url, opts);
            }};
        }}""", sid_b)

        # Switch to B - this has messages from API including tool-calls
        page.evaluate(f"switchSession('{sid_b}')")
        time.sleep(1)

        info = page.evaluate("""() => {
            const c = document.getElementById('chatMessages');
            return Array.from(c.children).map((el, i) => ({
                idx: i,
                tag: el.tagName,
                cls: el.className,
                id: el.id,
                text: el.textContent.substring(0, 100)
            }));
        }""")

        print(f"\nDOM has {len(info)} children:")
        for child in info:
            mark = ''
            if 'msg.tools' in child['cls']:
                mark = '  <-- 独立的 tool group（纯文本工具调用）'
            print(f"  [{child['idx']}] {child['tag']} class='{child['cls']}' id='{child['id']}'{mark}")
            print(f"       text: {child['text'][:80]}")

        page.screenshot(path='/tmp/mcm_test_completed.png', full_page=True)
        browser.close()


if __name__ == '__main__':
    main()
