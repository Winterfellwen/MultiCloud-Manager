"""
Simulated test for duplicate rendering bug.
Manually populate SESSION_MESSAGES to test the bug without needing the LLM.
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

        # Create 2 sessions via API
        s_a = page.evaluate("""async (token) => {
            const r = await fetch('/api/agent/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ title: 'A' })
            });
            return await r.json();
        }""", token)
        sid_a = s_a.get('session_id')

        s_b = page.evaluate("""async (token) => {
            const r = await fetch('/api/agent/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ title: 'B' })
            });
            return await r.json();
        }""", token)
        sid_b = s_b.get('session_id')
        print(f"Sessions: A={sid_a}, B={sid_b}")

        # Simulate the bug scenario:
        # 1. Manually populate SESSION_MESSAGES[A] with tool-calls (as if switchSession saved it)
        # 2. Set CURRENT_SESSION to A
        # 3. Render the messages
        # 4. Then call openDirectSSEStream which would replay the "done" event
        # 5. Check for duplicates

        # Step 1: Populate SESSION_MESSAGES[A] with simulated state
        page.evaluate(f"""(sid) => {{
            SESSION_MESSAGES[sid] = [
                {{role: 'user', content: '查询所有云平台的资源统计信息', created_at: new Date().toISOString()}},
                {{role: 'tool-calls', content: JSON.stringify([
                    {{name: 'get_cloud_stats', params: '{{}}', result: '{{"accounts":1,"resources":3}}', status: 'done'}}
                ]), created_at: new Date().toISOString(), streaming: true, _run_id: 'test-run-123'}},
                {{role: 'agent', content: '以下是查询结果：\\n\\n账号数：1\\n资源数：3', created_at: new Date().toISOString(), streaming: true, _run_id: 'test-run-123'}}
            ];
        }}""", sid_a)
        print("Populated SESSION_MESSAGES[A] with simulated state (with _run_id)")

        # Step 2: Switch to A - this should render the messages
        page.evaluate(f"switchSession('{sid_a}')")
        time.sleep(2)

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
        print(f"\nDOM after switch to A ({len(info)} children):")
        for child in info:
            print(f"  [{child['idx']}] {child['tag']} class='{child['cls']}' id='{child['id']}'")
            print(f"       text: {child['text'][:80]}")

        # Step 3: Now simulate handleStateChangeEvent being called for the "done" event
        # This is what happens when SSE replays the event
        print("\n--- Simulating handleStateChangeEvent 'done' ---")
        page.evaluate(f"""(args) => {{
            // Simulate the event
            var ev = {{
                session_id: args.sid,
                run_id: 'test-run-123',
                payload: {{state: 'done'}}
            }};
            handleStateChangeEvent(ev);
        }}""", {"sid": sid_a})
        time.sleep(1)

        sm = page.evaluate("""(sid) => {
            return (SESSION_MESSAGES[sid] || []).map(m => ({role: m.role, _run_id: m._run_id || ''}));
        }""", sid_a)
        print(f"SESSION_MESSAGES[A] after handleStateChangeEvent: {len(sm)} entries")
        for m in sm:
            print(f"  {m}")

        # Step 4: Switch to B
        page.evaluate(f"switchSession('{sid_b}')")
        time.sleep(1)

        # Step 5: Switch back to A
        page.evaluate(f"switchSession('{sid_a}')")
        time.sleep(1)

        sm = page.evaluate("""(sid) => {
            return (SESSION_MESSAGES[sid] || []).map(m => ({role: m.role, _run_id: m._run_id || ''}));
        }""", sid_a)
        print(f"\nSESSION_MESSAGES[A] after switch back: {len(sm)} entries")
        for m in sm:
            print(f"  {m}")

        # Step 6: Multiple switches to see if duplicates accumulate
        for i in range(3):
            page.evaluate(f"switchSession('{sid_b}')")
            time.sleep(0.5)
            page.evaluate(f"switchSession('{sid_a}')")
            time.sleep(0.5)

        sm = page.evaluate("""(sid) => {
            return (SESSION_MESSAGES[sid] || []).map(m => ({role: m.role, _run_id: m._run_id || ''}));
        }""", sid_a)
        print(f"\nSESSION_MESSAGES[A] after 3 more switches: {len(sm)} entries")
        for m in sm:
            print(f"  {m}")

        # Final DOM check
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
        print(f"\nFinal DOM ({len(info)} children):")
        for child in info:
            print(f"  [{child['idx']}] {child['tag']} class='{child['cls']}' id='{child['id']}'")

        page.screenshot(path='/tmp/mcm_test_simulated.png', full_page=True)

        browser.close()


if __name__ == '__main__':
    main()
