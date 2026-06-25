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
        # TEST 1: tool-calls saved BEFORE agent (savePartialContent order)
        # ========================================================================
        print("\n" + "=" * 60)
        print("TEST 1: tool-calls saved BEFORE agent")
        print("=" * 60)

        page.evaluate("""(sid) => {
            SESSION_MESSAGES[sid] = [
                {role: 'user', content: '查询云平台资源', created_at: new Date().toISOString()},
                {role: 'tool-calls', content: JSON.stringify([
                    {name: 'get_cloud_stats', params: '{}', result: '{"accounts":1,"resources":3}', status: 'done'},
                    {name: 'list_cloud_resources', params: '{}', result: '{"count":3,"resources":[]}', status: 'done'}
                ]), created_at: new Date().toISOString(), streaming: true, _run_id: 'run-123'},
                {role: 'agent', content: '好的，以下是查询结果：', created_at: new Date().toISOString(), streaming: true, _run_id: 'run-123'}
            ];
        }""", sid_a)

        page.evaluate("(sid) => switchSession(sid)", sid_a)
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
                mark = '  <-- active_run_events 重复'
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
        page.screenshot(path='/tmp/mcm_test_t1.png', full_page=True)

        # ========================================================================
        # TEST 2: AI completed with correct order (agent first, tool-calls after)
        # ========================================================================
        print("\n" + "=" * 60)
        print("TEST 2: Correct order - agent FIRST, then tool-calls")
        print("=" * 60)

        page.evaluate("""(sid) => {
            SESSION_MESSAGES[sid] = [
                {role: 'user', content: '查询云平台资源', created_at: new Date().toISOString()},
                {role: 'agent', content: '好的，以下是查询结果：账号数1，资源数3', created_at: new Date().toISOString(), _run_id: 'run-correct-789'},
                {role: 'tool-calls', content: JSON.stringify([
                    {name: 'get_cloud_stats', params: '{}', result: '{"accounts":1,"resources":3}', status: 'done'},
                    {name: 'list_cloud_resources', params: '{}', result: '{"count":3,"resources":[]}', status: 'done'}
                ]), created_at: new Date().toISOString(), _run_id: 'run-correct-789'}
            ];
        }""", sid_b)

        page.evaluate("(sid) => switchSession(sid)", sid_b)
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
                mark = '  <-- 独立工具组'
            print(f"  [{child['idx']}] {child['tag']} class='{child['cls']}' id='{child['id']}'{mark}")
            print(f"       text: {child['text'][:80]}")

        page.screenshot(path='/tmp/mcm_test_t2.png', full_page=True)

        # ========================================================================
        # TEST 3: active_run_events also renders -> double rendering!
        # ========================================================================
        print("\n" + "=" * 60)
        print("TEST 3: active_run_events causes double rendering")
        print("=" * 60)

        # Populate session with tool-calls + active_run_events
        page.evaluate("""(sid) => {
            SESSION_MESSAGES[sid] = [
                {role: 'user', content: '查询云平台资源', created_at: new Date().toISOString()},
                {role: 'agent', content: '好的，以下是查询结果：', created_at: new Date().toISOString(), streaming: true, _run_id: 'run-double'},
                {role: 'tool-calls', content: JSON.stringify([
                    {name: 'get_cloud_stats', params: '{}', result: '{"accounts":1,"resources":3}', status: 'done'},
                    {name: 'list_cloud_resources', params: '{}', result: '{"count":3,"resources":[]}', status: 'done'}
                ]), created_at: new Date().toISOString(), streaming: true, _run_id: 'run-double'}
            ];
        }""", sid_a)

        # Mock: return running state with active_run_events
        page.evaluate("""(sid) => {
            if (!window._origFetch) window._origFetch = window.fetch;
            window.fetch = function(url, opts) {
                if (typeof url === 'string' && url.includes('/api/agent/sessions/' + sid) &&
                    (!opts || !opts.method || opts.method === 'GET')) {
                    return Promise.resolve(new Response(JSON.stringify({
                        session_id: sid,
                        status: 'running',
                        active_run_id: 'run-double',
                        active_run_events: [
                            {event_type: 'tool_start', payload: {tool_calls: [
                                {function: {arguments: '{}', name: 'get_cloud_stats'}}
                            ]}},
                            {event_type: 'tool_result', payload: {tool_name: 'get_cloud_stats', result: '{"accounts":1,"resources":3}'}},
                            {event_type: 'tool_start', payload: {tool_calls: [
                                {function: {arguments: '{}', name: 'list_cloud_resources'}}
                            ]}},
                            {event_type: 'tool_result', payload: {tool_name: 'list_cloud_resources', result: '{"count":3,"resources":[]}'}}
                        ],
                        messages: [
                            {role: 'user', content: '查询云平台资源', created_at: new Date().toISOString()}
                        ],
                        pending_runs: [],
                        incomplete_runs: []
                    }), {status: 200, headers: {'Content-Type': 'application/json'}}));
                }
                return window._origFetch(url, opts);
            };
        }""", sid_a)

        page.evaluate("(sid) => switchSession(sid)", sid_a)
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
                mark = '  <-- 独立工具组'
            if 'run-events' in child['cls']:
                mark = '  <-- active_run_events 又渲染一次！'
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
        page.screenshot(path='/tmp/mcm_test_t3.png', full_page=True)

        browser.close()
        print("\nTests done.")


if __name__ == '__main__':
    main()
