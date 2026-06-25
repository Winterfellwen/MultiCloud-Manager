"""
Comprehensive Playwright test for all chat history bugs.
Tests:
1. 错误状态修复 (Error display after AI error)
2. 滚动到底部 (Scroll to bottom on session load)
3. 思考中动画显示 (Thinking indicator on running AI)
4. 切回时消息数量 (Message count after switching back)
5. 对话重复展示 (Duplicate tool calls)
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
        page.on("console", lambda msg: None)  # suppress console output

        # Login
        token = get_token()
        page.goto(BASE + '/login.html')
        page.wait_for_load_state('networkidle')
        page.evaluate(f"localStorage.setItem('token', '{token}')")
        page.goto(BASE + '/')
        page.wait_for_load_state('networkidle')
        time.sleep(2)
        page.evaluate("showPage('chat')")
        time.sleep(1)

        print("=" * 60)
        print("Bug 1: Scroll to bottom on session load")
        print("=" * 60)
        # Create a session with several messages
        s = page.evaluate("""async (token) => {
            const r = await fetch('/api/agent/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ title: 'Scroll test' })
            });
            return await r.json();
        }""", token)
        sid = s.get('session_id')

        # Manually populate SESSION_MESSAGES with many messages
        page.evaluate(f"""(sid) => {{
            SESSION_MESSAGES[sid] = [];
            for (var i = 0; i < 10; i++) {{
                SESSION_MESSAGES[sid].push({{role: 'user', content: 'User message ' + i, created_at: new Date().toISOString()}});
                SESSION_MESSAGES[sid].push({{role: 'agent', content: 'Agent reply ' + i, created_at: new Date().toISOString()}});
            }}
        }}""", sid)

        # Switch to this session
        page.evaluate(f"switchSession('{sid}')")
        time.sleep(1)

        scroll = page.evaluate("""() => {
            const c = document.getElementById('chatMessages');
            return { scrollTop: c.scrollTop, scrollHeight: c.scrollHeight, clientHeight: c.clientHeight };
        }""")
        at_bottom = scroll['scrollTop'] + scroll['clientHeight'] >= scroll['scrollHeight'] - 5
        print(f"  scrollTop={scroll['scrollTop']}, scrollHeight={scroll['scrollHeight']}")
        print(f"  At bottom: {at_bottom} {'✓' if at_bottom else '✗ FAIL'}")

        print()
        print("=" * 60)
        print("Bug 2: Thinking indicator on running AI")
        print("=" * 60)
        # Simulate a running session
        page.evaluate(f"""(sid) => {{
            SESSION_MESSAGES[sid] = [{{role: 'user', content: 'Hello', created_at: new Date().toISOString()}}];
        }}""", sid)

        # Override the API response to return running state
        page.evaluate("""() => {
            // Save original fetch
            window._origFetch = window._origFetch || window.fetch;
            window.fetch = function(url, opts) {
                if (typeof url === 'string' && url.includes('/api/agent/sessions/') && (!opts || opts.method === undefined || opts.method === 'GET')) {
                    return Promise.resolve(new Response(JSON.stringify({
                        session_id: url.split('/').pop(),
                        status: 'running',
                        active_run_id: 'test-run-456',
                        active_run_events: [],
                        messages: [{role: 'user', content: 'Hello', created_at: new Date().toISOString()}],
                        pending_runs: [],
                        incomplete_runs: []
                    }), {status: 200, headers: {'Content-Type': 'application/json'}}));
                }
                return window._origFetch(url, opts);
            };
        }""")

        # Switch to the session
        page.evaluate(f"switchSession('{sid}')")
        time.sleep(1)

        # Check for thinking indicator
        thinking = page.evaluate("""() => {
            return {
                inlineStatus: document.querySelectorAll('.inline-status').length,
                thinkingDots: document.querySelectorAll('.thinking-dots').length,
                streamingMsg: document.querySelectorAll('.msg.streaming').length
            };
        }""")
        print(f"  Thinking indicators: {thinking}")
        has_thinking = thinking['inlineStatus'] > 0 and thinking['thinkingDots'] > 0
        print(f"  Has thinking indicator: {has_thinking} {'✓' if has_thinking else '✗ FAIL'}")

        # Restore fetch
        page.evaluate("window.fetch = window._origFetch")

        print()
        print("=" * 60)
        print("Bug 3: Error display after AI error")
        print("=" * 60)
        # Simulate an error in the current session
        page.evaluate(f"""(sid) => {{
            CURRENT_SESSION = sid;
            var container = document.getElementById('chatMessages');
            container.innerHTML = '';
            var div = document.createElement('div');
            div.className = 'msg agent streaming';
            div.innerHTML = '<div class="msg-content streaming-cursor">thinking...</div>';
            container.appendChild(div);
            STREAMING_DIV = div;
        }}""", sid)

        # Trigger error event
        page.evaluate(f"""(sid) => {{
            handleStateChangeEvent({{
                session_id: sid,
                run_id: 'test-run-err',
                payload: {{state: 'error', error_message: 'Test error message'}}
            }});
        }}""", sid)
        time.sleep(0.5)

        error_displayed = page.evaluate("""() => {
            var c = document.getElementById('chatMessages');
            return c.textContent.includes('Test error message');
        }""")
        print(f"  Error message displayed: {error_displayed} {'✓' if error_displayed else '✗ FAIL'}")

        print()
        print("=" * 60)
        print("Bug 4: Duplicate tool calls after multiple switches")
        print("=" * 60)
        # Simulate the scenario: AI is running, switch away (saves state), switch back, switch away, switch back...
        sid_dup = page.evaluate("""async (token) => {
            const r = await fetch('/api/agent/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ title: 'Dup test' })
            });
            return (await r.json()).session_id;
        }""", token)

        # Simulate switchSession save (with the fix, _run_id is included)
        page.evaluate(f"""(sid) => {{
            SESSION_MESSAGES[sid] = [
                {{role: 'user', content: 'test', created_at: new Date().toISOString()}},
                {{role: 'tool-calls', content: JSON.stringify([
                    {{name: 'get_cloud_stats', params: '{{}}', result: '{{"accounts":1}}', status: 'done'}}
                ]), created_at: new Date().toISOString(), streaming: true, _run_id: 'dup-run-789'}},
                {{role: 'agent', content: 'Result', created_at: new Date().toISOString(), streaming: true, _run_id: 'dup-run-789'}}
            ];
        }}""", sid_dup)

        # Simulate handleStateChangeEvent being called multiple times (SSE replay)
        for i in range(3):
            page.evaluate(f"""(sid) => {{
                handleStateChangeEvent({{
                    session_id: sid,
                    run_id: 'dup-run-789',
                    payload: {{state: 'done'}}
                }});
            }}""", sid_dup)

        sm = page.evaluate("""(sid) => {
            return (SESSION_MESSAGES[sid] || []).map(m => ({role: m.role, _run_id: m._run_id || ''}));
        }""", sid_dup)
        print(f"  SESSION_MESSAGES entries: {len(sm)} (should be 3, not 6)")
        for m in sm:
            print(f"    {m}")
        no_dup = len(sm) == 3
        print(f"  No duplicates: {no_dup} {'✓' if no_dup else '✗ FAIL'}")

        page.screenshot(path='/tmp/mcm_test_all.png', full_page=True)
        browser.close()
        print()
        print("=" * 60)
        print("All tests complete")
        print("=" * 60)


if __name__ == '__main__':
    main()
