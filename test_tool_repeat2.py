"""
Precise test for tool calls appearing as plain text when switching sessions.
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


def setup_page(page, token):
    page.goto(BASE + '/login.html')
    page.wait_for_load_state('networkidle')
    page.evaluate("localStorage.setItem('token', '" + token + "')")
    page.goto(BASE + '/')
    page.wait_for_load_state('networkidle')
    time.sleep(2)
    page.evaluate("showPage('chat')")
    time.sleep(1)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()
        token = get_token()
        setup_page(page, token)

        # Create 2 sessions
        sid_a = page.evaluate("""async (token) => {
            const r = await fetch('/api/agent/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ title: 'A' })
            });
            return (await r.json()).session_id;
        }""", token)
        sid_b = page.evaluate("""async (token) => {
            const r = await fetch('/api/agent/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
                body: JSON.stringify({ title: 'B' })
            });
            return (await r.json()).session_id;
        }""", token)

        print(f"A = {sid_a}")
        print(f"B = {sid_b}")

        # ========================================================================
        # TEST 1: Switch away -> switch back, but tool-calls are saved BEFORE agent
        # This simulates savePartialContent which saves tool-calls first, then agent
        # ========================================================================
        print("\n" + "=" * 60)
        print("TEST 1: tool-calls saved BEFORE agent (savePartialContent order)")
        print("=" * 60)

        # Save with order: user -> tool-calls -> agent (like savePartialContent does)
        js = """
        (function() {
            var sid = arguments[0];
            SESSION_MESSAGES[sid] = [
                {role: 'user', content: '查询云平台资源', created_at: new Date().toISOString()},
                {role: 'tool-calls', content: JSON.stringify([
                    {name: 'get_cloud_stats', params: '{}', result: '{"accounts":1,"resources":3}', status: 'done'},
                    {name: 'list_cloud_resources', params: '{}', result: '{"count":3,"resources":[]}', status: 'done'}
                ]), created_at: new Date().toISOString(), streaming: true, _run_id: 'run-123'},
                {role: 'agent', content: '好的，以下是查询结果：', created_at: new Date().toISOString(), streaming: true, _run_id: 'run-123'}
            ];
        }).apply(this, arguments)
        """
        page.evaluate(js, sid_a)

        # Switch to session A
        page.evaluate("switchSession(arguments[0])", sid_a)
        time.sleep(1)

        info = page.evaluate("""() => {
            const c = document.getElementById('chatMessages');
            return Array.from(c.children).map((el, i) => ({
                idx: i, tag: el.tagName, cls: el.className,
                id: el.id, text: el.textContent.substring(0, 100)
            }));
        }""")
        print(f"DOM has {len(info)} children:")
        for child in info:
            mark = ''
            if 'msg.tools' in child['cls']:
                mark = '  <-- 独立工具组 (问题！应该内联在agent里)'
            if 'run-events' in child['cls']:
                mark = '  <-- active_run_events 重复渲染'
            print(f"  [{child['idx']}] {child['tag']} class='{child['cls']}' id='{child['id']}'{mark}")
            print(f"       text: {child['text'][:80]}")

        dup_check = page.evaluate("""() => {
            const c = document.getElementById('chatMessages');
            const txt = c.textContent;
            return {
                get_cloud_stats_count: (txt.match(/get_cloud_stats/gi) || []).length,
                tool_group_count: document.querySelectorAll('.msg.tools').length,
                run_events_count: document.querySelectorAll('.run-events').length,
                tool_card_count: document.querySelectorAll('.timeline-tool-card, .tool-card').length
            };
        }""")
        print(f"\n重复分析: {dup_check}")
        print(f"  get_cloud_stats 出现 {dup_check['get_cloud_stats_count']} 次 (期望: 2-3次)")

        page.screenshot(path='/tmp/mcm_test_t1.png', full_page=True)

        # ========================================================================
        # TEST 2: AI completed, tool-calls saved BEFORE agent, but not streaming
        # This is the case after handleStateChangeEvent done finishes
        # ========================================================================
        print("\n" + "=" * 60)
        print("TEST 2: AI completed, tool-calls saved BEFORE agent (standard order)")
        print("=" * 60)

        js = """
        (function() {
            var sid = arguments[0];
            SESSION_MESSAGES[sid] = [
                {role: 'user', content: '查询云平台资源', created_at: new Date().toISOString()},
                {role: 'tool-calls', content: JSON.stringify([
                    {name: 'get_cloud_stats', params: '{}', result: '{"accounts":1,"resources":3}', status: 'done'},
                    {name: 'list_cloud_resources', params: '{}', result: '{"count":3,"resources":[]}', status: 'done'}
                ]), created_at: new Date().toISOString(), _run_id: 'run-done-456'},
                {role: 'agent', content: '好的，以下是查询结果：账号数：1，资源数：3', created_at: new Date().toISOString(), _run_id: 'run-done-456'}
            ];
        }).apply(this, arguments)
        """
        page.evaluate(js, sid_b)

        page.evaluate("switchSession(arguments[0])", sid_b)
        time.sleep(1)

        info = page.evaluate("""() => {
            const c = document.getElementById('chatMessages');
            return Array.from(c.children).map((el, i) => ({
                idx: i, tag: el.tagName, cls: el.className,
                id: el.id, text: el.textContent.substring(0, 100)
            }));
        }""")
        print(f"DOM has {len(info)} children:")
        for child in info:
            mark = ''
            if 'msg.tools' in child['cls']:
                mark = '  <-- 独立工具组 (重复)'
            print(f"  [{child['idx']}] {child['tag']} class='{child['cls']}' id='{child['id']}'{mark}")
            print(f"       text: {child['text'][:80]}")

        page.screenshot(path='/tmp/mcm_test_t2.png', full_page=True)

        # ========================================================================
        # TEST 3: AI completed with CORRECT order (agent first, then tool-calls)
        # This is how it should be saved (matching handleStateChangeEvent's done branch)
        # ========================================================================
        print("\n" + "=" * 60)
        print("TEST 3: Correct order (agent FIRST, then tool-calls)")
        print("=" * 60)

        # First switch to B again to clear the test above
        page.evaluate("switchSession(arguments[0])", sid_b)
        time.sleep(0.5)

        js = """
        (function() {
            var sid = arguments[0];
            SESSION_MESSAGES[sid] = [
                {role: 'user', content: '查询云平台资源', created_at: new Date().toISOString()},
                {role: 'agent', content: '好的，以下是查询结果：账号数：1，资源数：3', created_at: new Date().toISOString(), _run_id: 'run-correct-789'},
                {role: 'tool-calls', content: JSON.stringify([
                    {name: 'get_cloud_stats', params: '{}', result: '{"accounts":1,"resources":3}', status: 'done'},
                    {name: 'list_cloud_resources', params: '{}', result: '{"count":3,"resources":[]}', status: 'done'}
                ]), created_at: new Date().toISOString(), _run_id: 'run-correct-789'}
            ];
        }).apply(this, arguments)
        """
        page.evaluate(js, sid_a)

        page.evaluate("switchSession(arguments[0])", sid_a)
        time.sleep(1)

        info = page.evaluate("""() => {
            const c = document.getElementById('chatMessages');
            return Array.from(c.children).map((el, i) => ({
                idx: i, tag: el.tagName, cls: el.className,
                id: el.id, text: el.textContent.substring(0, 100)
            }));
        }""")
        print(f"DOM has {len(info)} children:")
        for child in info:
            mark = ''
            if 'msg.tools' in child['cls']:
                mark = '  <-- 独立工具组 (不该有！)'
            print(f"  [{child['idx']}] {child['tag']} class='{child['cls']}' id='{child['id']}'{mark}")
            print(f"       text: {child['text'][:80]}")

        page.screenshot(path='/tmp/mcm_test_t3.png', full_page=True)

        browser.close()
        print("\nTests done. Screenshots: /tmp/mcm_test_t1.png, t2.png, t3.png")


if __name__ == '__main__':
    main()
