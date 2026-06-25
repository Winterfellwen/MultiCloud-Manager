#!/usr/bin/env python3
"""多轮对话 - 等AI完成后再检查"""

import time
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:8099"
USERNAME = "admin"
PASSWORD = "Admin123!"

def login(page):
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1500)
    username_input = page.locator('input[name="username"], input[type="text"]').first
    if username_input.is_visible():
        username_input.fill(USERNAME)
        page.locator('input[name="password"], input[type="password"]').first.fill(PASSWORD)
        page.locator('button[type="submit"]').first.click()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)
    print("[1] 登录完成")

def go_chat(page):
    try:
        chat_btn = page.locator('.nav-item[data-page="chat"]').first
        if chat_btn.is_visible():
            chat_btn.click()
            page.wait_for_timeout(2000)
    except:
        page.evaluate("() => { if (typeof showPage === 'function') showPage('chat'); }")
        page.wait_for_timeout(2000)

def wait_ai_done(page, timeout=30):
    """Wait until no .msg.streaming elements remain"""
    deadline = time.time() + timeout
    while time.time() < deadline:
        streaming = page.evaluate("() => document.querySelectorAll('.msg.streaming').length")
        if streaming == 0:
            return True
        page.wait_for_timeout(500)
    print(f"  ⏰ 超时，仍有 streaming 元素")
    return False

def send_msg(page, text, label):
    print(f"\n[{label}] 发送: {text}")
    page.locator('#chatInput').fill(text)
    page.wait_for_timeout(300)
    page.locator('#chatSendBtn').click()
    page.wait_for_timeout(2000)  # brief wait for AI to start
    return wait_ai_done(page, timeout=30)

def print_msgs(page, label):
    msgs = page.evaluate("""
        () => Array.from(document.querySelectorAll('.msg')).map((m, idx) => ({
            idx: idx,
            role: m.classList.contains('user') ? 'user' : m.classList.contains('agent') ? 'agent' : m.classList.contains('tool') ? 'tool' : 'other',
            text: m.innerText.substring(0, 150).replace(/\\n/g, ' | '),
            has_streaming: m.classList.contains('streaming')
        }))
    """)
    print(f"[{label}] 消息数: {len(msgs)}")
    for m in msgs:
        s = " [STREAMING]" if m['has_streaming'] else ""
        print(f"  [{m['idx']+1}] {m['role']}{s}: {m['text']}")
    # Check duplicates
    texts = [m['text'] for m in msgs]
    dupes = False
    for i, t in enumerate(texts):
        for j in range(i+1, len(texts)):
            if t and t == texts[j]:
                print(f"  ⚠️ 重复: msg #{i+1} == msg #{j+1}")
                dupes = True
    if not dupes:
        print(f"  ✅ 无重复")
    # Check run-events
    has_re = page.evaluate("() => document.querySelectorAll('.run-events').length")
    if has_re:
        print(f"  ⚠️ 有 {has_re} 个 .run-events 容器")
    else:
        print(f"  ✅ 无 .run-events 容器")
    # Check duplicate containers (two agent msgs with same text)
    roles = [m['role'] for m in msgs]
    for i in range(len(roles)-1):
        if roles[i] == 'agent' and roles[i+1] == 'agent':
            if texts[i] == texts[i+1]:
                print(f"  ⚠️ 相邻 agent 重复: #{i+1} == #{i+2}")

def print_cache_state(page):
    """Print SESSION_MESSAGES cache state"""
    cached = page.evaluate("() => { const s = {}; Object.keys(SESSION_MESSAGES || {}).forEach(k => { s[k] = SESSION_MESSAGES[k].length; }); return s; }")
    print(f"  缓存: {cached}")
    streaming_content = page.evaluate("() => Object.keys(SESSION_STREAMING || {}).length")
    if streaming_content:
        print(f"  ⚠️ SESSION_STREAMING 未清理: {streaming_content} 个会话")

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()

        login(page)
        go_chat(page)

        # Round 1
        send_msg(page, "你好，请介绍一下你自己", "第1轮")
        print_msgs(page, "第1轮")
        print_cache_state(page)
        page.screenshot(path="/tmp/mcm_mt1.png")

        # Round 2
        send_msg(page, "你支持哪些云平台", "第2轮")
        print_msgs(page, "第2轮")
        print_cache_state(page)
        page.screenshot(path="/tmp/mcm_mt2.png")

        # Round 3
        send_msg(page, "请详细说说 Azure 支持的功能", "第3轮")
        print_msgs(page, "第3轮")
        print_cache_state(page)
        page.screenshot(path="/tmp/mcm_mt3.png")

        # Detailed duplicate check
        dup_detail = page.evaluate("""
            () => {
                var msgs = document.querySelectorAll('.msg.agent');
                var result = [];
                msgs.forEach(function(m, i) {
                    var contents = m.querySelectorAll('.msg-content');
                    result.push({
                        index: i,
                        streaming: m.classList.contains('streaming'),
                        contentCount: contents.length,
                        texts: Array.from(contents).map(function(c) { return c.textContent.trim().substring(0, 80); })
                    });
                });
                // Check for dupes across all .msg-content
                var allContents = document.querySelectorAll('.msg.agent .msg-content');
                var textMap = {};
                var dupes = [];
                allContents.forEach(function(c, i) {
                    var t = c.textContent.trim();
                    if (!t) return;
                    if (textMap[t] !== undefined) {
                        dupes.push({first: textMap[t], second: i, text: t.substring(0, 60)});
                    } else {
                        textMap[t] = i;
                    }
                });
                return JSON.stringify({agentInfo: result, dupes: dupes});
            }
        """)
        import json
        dd = json.loads(dup_detail)
        print(f"\n  Agent msg 详情: {json.dumps(dd['agentInfo'], indent=2, ensure_ascii=False)}")
        if dd['dupes']:
            print(f"  ⚠️ 重复 .msg-content: {json.dumps(dd['dupes'], ensure_ascii=False)}")
        else:
            print(f"  ✅ 无重复 .msg-content")

        browser.close()
        print("\n=== 多轮对话测试完成 ===")

if __name__ == "__main__":
    main()
