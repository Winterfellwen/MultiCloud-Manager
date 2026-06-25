#!/usr/bin/env python3
"""Test for delayed duplicates after switching back to a completed session.
Catches duplicates caused by global EventSource delivering stale done events.
Also tests switching back while AI is still running."""
import time, json, subprocess
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:8099'

def get_token():
    r = subprocess.run(['curl', '-s', '-X', 'POST', BASE + '/api/auth/login',
        '-H', 'Content-Type: application/json',
        '-d', '{"username":"admin","password":"Admin123!"}'], capture_output=True, text=True)
    return json.loads(r.stdout)['token']

def count_duplicates(msgs):
    texts = [m['text'] for m in msgs if m['role'] == 'agent']
    dupes = 0
    for i, t in enumerate(texts):
        for j in range(i+1, len(texts)):
            if t and t == texts[j]:
                print(f"    ❌ DUPE msg #{i+1} == #{j+1}: {t[:40]}")
                dupes += 1
    return dupes

def check_msgs(page, label, sid_a):
    msgs = page.evaluate("""
        () => Array.from(document.querySelectorAll('.msg')).map(m => ({
            role: m.classList.contains('user') ? 'user' : 'agent',
            text: m.textContent.substring(0, 60).replace(/\\n/g, ' ')
        }))
    """)
    roles = [m['role'] for m in msgs]
    print(f"  {label}: {len(msgs)} msgs, roles={roles}")
    dupes = count_duplicates(msgs)
    cache = page.evaluate(f"""(sid) => (SESSION_MESSAGES[sid]||[]).map(m => ({{role:m.role, streaming:!!m.streaming}}))""", sid_a)
    return dupes, len(msgs), cache

def run_test(page, token, test_name, switch_after_complete=True):
    print(f"\n{'='*60}")
    print(f"Test: {test_name}")
    print(f"{'='*60}")

    # Create Session A
    s = page.evaluate("""async (token) => {
        const r = await fetch('/api/agent/sessions', {
            method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
            body: JSON.stringify({title:'Session A'})
        }); return await r.json();
    }""", token)
    sid_a = s['session_id']
    print(f"Session A: {sid_a[:12]}...")

    # Switch and send message
    page.evaluate(f"switchSession('{sid_a}')")
    time.sleep(1)
    page.locator('#chatInput').fill('请简单介绍一下你自己')
    page.locator('#chatSendBtn').click()
    page.wait_for_function("() => (typeof STREAMING_CONTENT !== 'undefined' ? STREAMING_CONTENT.length : 0) > 50", timeout=30000)
    sc_len = page.evaluate("() => (typeof STREAMING_CONTENT !== 'undefined' ? STREAMING_CONTENT.length : -1)")
    print(f"  Streaming content: {sc_len} chars")

    # Create Session B and switch
    s2 = page.evaluate("""async (token) => {
        const r = await fetch('/api/agent/sessions', {
            method:'POST', headers:{'Content-Type':'application/json','Authorization':'Bearer '+token},
            body: JSON.stringify({title:'Session B'})
        }); return await r.json();
    }""", token)
    sid_b = s2['session_id']
    page.evaluate(f"switchSession('{sid_b}')")
    time.sleep(1)

    if switch_after_complete:
        print("  Waiting for Session A to complete on backend...")
        time.sleep(15)

    # Switch back
    print("  Switching back to Session A...")
    page.evaluate(f"switchSession('{sid_a}')")
    time.sleep(2)

    d1, n1, c1 = check_msgs(page, "Immediate", sid_a)

    print("  Waiting 10s for delayed events...")
    time.sleep(10)

    d2, n2, c2 = check_msgs(page, "After delay", sid_a)
    print(f"  Cache: {len(c2)} entries, streaming: {sum(1 for c in c2 if c['streaming'])}")

    return d1 + d2, n1, n2

def main():
    token = get_token()
    failures = 0
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = ctx.new_page()
        page.on('console', lambda msg: None)
        page.goto(BASE + '/login.html')
        page.wait_for_load_state('networkidle')
        page.evaluate(f"localStorage.setItem('token', '{token}')")
        page.goto(BASE + '/')
        page.wait_for_load_state('networkidle')
        time.sleep(2)
        page.evaluate("showPage('chat')")
        time.sleep(1)

        # Test 1: Switch after AI completes (original bug report)
        d, n1, n2 = run_test(page, token, "Switch after AI completes", switch_after_complete=True)
        if d > 0:
            print(f"  ❌ FAIL: {d} duplicates")
            failures += 1
        else:
            print(f"  ✅ PASS: {n1}/{n2} msgs, no duplicates")

        # Test 2: Switch while AI is still running
        d, n1, n2 = run_test(page, token, "Switch while AI still running", switch_after_complete=False)
        if d > 0:
            print(f"  ❌ FAIL: {d} duplicates")
            failures += 1
        else:
            print(f"  ✅ PASS: {n1}/{n2} msgs, no duplicates")

        page.screenshot(path='/tmp/mcm_delayed_dup.png', full_page=True)
        browser.close()
        print(f"\n{'='*60}")
        print(f"Results: {'✅ ALL PASS' if failures == 0 else f'❌ {failures} FAILURES'}")
        return failures

if __name__ == '__main__':
    exit(main())
