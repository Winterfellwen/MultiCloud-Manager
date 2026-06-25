"""
Focused Playwright test for the duplicate rendering bug when switching sessions during AI run.
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

        # Capture console logs
        page.on("console", lambda msg: print(f"[CONSOLE {msg.type}] {msg.text}"))

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
        print(f"Session A: {sid_a}")

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
        print(f"Session B: {sid_b}")

        # Start AI run in A - use a message that requires multiple tool calls
        page.evaluate("""async (args) => {
            await fetch('/api/agent/chat/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + args.token },
                body: JSON.stringify({ session_id: args.sid, message: '请调用 get_cloud_stats 和 list_cloud_resources 工具,然后详细告诉我每个云平台的资源情况' })
            });
        }""", {"sid": sid_a, "token": token})
        print("Started AI run in A")

        # Wait for AI to be running
        for i in range(20):
            time.sleep(1)
            sess_a = page.evaluate("""async (args) => {
                const r = await fetch('/api/agent/sessions/' + args.sid, {
                    headers: { 'Authorization': 'Bearer ' + args.token }
                });
                return await r.json();
            }""", {"sid": sid_a, "token": token})
            if sess_a.get('status') == 'running' and sess_a.get('active_run_id'):
                events = sess_a.get('active_run_events') or []
                print(f"  [{i+1}s] AI running, {len(events)} events")
                if len(events) >= 3:  # Wait for some events
                    break

        # Switch to A so the SSE stream connects
        page.evaluate(f"switchSession('{sid_a}')")
        time.sleep(2)

        # Check state
        sess_a = page.evaluate("""async (args) => {
            const r = await fetch('/api/agent/sessions/' + args.sid, {
                headers: { 'Authorization': 'Bearer ' + args.token }
            });
            return await r.json();
        }""", {"sid": sid_a, "token": token})
        print(f"Session A state: status={sess_a.get('status')}, active_run={sess_a.get('active_run_id', '')[:8]}")
        events = sess_a.get('active_run_events') or []
        print(f"Active run events: {len(events)}")
        for e in events:
            print(f"  - {e.get('event_type')}: {json.dumps(e.get('payload'))[:80]}")

        # Now switch to B (this should save A's streaming state to SESSION_MESSAGES)
        page.evaluate(f"switchSession('{sid_b}')")
        time.sleep(1)

        # Check SESSION_MESSAGES for A
        sm_a = page.evaluate("""(sid) => {
            const msgs = SESSION_MESSAGES[sid] || [];
            return msgs.map(m => ({role: m.role, streaming: m.streaming, _run_id: m._run_id, content_preview: (m.content || '').substring(0, 80)}));
        }""", sid_a)
        print(f"\nSESSION_MESSAGES[A] after switching away ({len(sm_a)} entries):")
        for m in sm_a:
            print(f"  role={m['role']:12} streaming={m['streaming']!s:6} _run_id={(m['_run_id'] or '')[:8] if m['_run_id'] else '':10} content={m['content_preview'][:60]}")

        # Wait for A's AI to finish
        print("\nWaiting for A's AI to complete...")
        for i in range(30):
            time.sleep(2)
            sess = page.evaluate("""async (args) => {
                const r = await fetch('/api/agent/sessions/' + args.sid, {
                    headers: { 'Authorization': 'Bearer ' + args.token }
                });
                return await r.json();
            }""", {"sid": sid_a, "token": token})
            if sess.get('status') not in ('running', 'queued'):
                print(f"  AI done at iteration {i}, status: {sess.get('status')}")
                break

        # Now switch back to A
        page.evaluate(f"switchSession('{sid_a}')")
        time.sleep(2)

        # Examine the DOM
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
        print(f"\nA's DOM after switching back ({len(info)} children):")
        for child in info:
            print(f"  [{child['idx']}] {child['tag']} class='{child['cls']}' id='{child['id']}'")
            print(f"       text: {child['text'][:80]}")

        # Count tool-related elements
        tool_counts = page.evaluate("""() => {
            return {
                msg_tools: document.querySelectorAll('.msg.tools').length,
                msg_tool: document.querySelectorAll('.msg.tool').length,
                msg_tool_result: document.querySelectorAll('.msg.tool-result').length,
                timeline_tool_card: document.querySelectorAll('.timeline-tool-card').length,
                run_events: document.querySelectorAll('.run-events').length,
                get_cloud_stats_occurrences: (document.getElementById('chatMessages').textContent.match(/get_cloud_stats/gi) || []).length,
                list_cloud_accounts_occurrences: (document.getElementById('chatMessages').textContent.match(/list_cloud_accounts/gi) || []).length
            };
        }""")
        print(f"\nTool counts: {tool_counts}")

        page.screenshot(path='/tmp/mcm_test_duplicate.png', full_page=True)
        print("Screenshot: /tmp/mcm_test_duplicate.png")

        # Test 2: switch and switch back multiple times
        print("\n--- Test 2: Multiple switches ---")
        for i in range(3):
            page.evaluate(f"switchSession('{sid_b}')")
            time.sleep(1)
            page.evaluate(f"switchSession('{sid_a}')")
            time.sleep(1)
            count = page.evaluate("document.getElementById('chatMessages').children.length")
            print(f"  After switch {i+1}: children count = {count}")

        # Test 3: Check the in-memory SESSION_MESSAGES
        sm_a_after = page.evaluate("""(sid) => {
            const msgs = SESSION_MESSAGES[sid] || [];
            return {count: msgs.length, entries: msgs.map(m => ({role: m.role, streaming: m.streaming, _run_id: m._run_id || ''}))};
        }""", sid_a)
        print(f"\nSESSION_MESSAGES[A] after multiple switches: {sm_a_after['count']} entries")
        for m in sm_a_after['entries']:
            print(f"  {m}")

        browser.close()


if __name__ == '__main__':
    main()
