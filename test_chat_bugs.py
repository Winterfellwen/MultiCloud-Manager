"""
Playwright test for chat history bugs in MultiCloud-Manager.

Tests:
1. 错误状态修复 (Error display)
2. 滚动到底部 (Scroll to bottom on session load)
3. 思考中动画显示 (Thinking indicator on running AI)
4. 切回时消息数量 (Message count after switching back)
5. 对话重复展示 (Duplicate tool calls)
"""
import time
import json
from playwright.sync_api import sync_playwright, expect

BASE = 'http://localhost:8099'
USERNAME = 'admin'
PASSWORD = 'Admin123!'


def login(page):
    page.goto(BASE + '/login.html')
    page.wait_for_load_state('networkidle')
    # Fill login form
    page.fill('input[name="username"], input#username, #username', USERNAME)
    page.fill('input[name="password"], input#password, #password', PASSWORD)
    page.click('button[type="submit"], button.login-btn, .login-form button')
    page.wait_for_load_state('networkidle')
    # Wait for redirect
    page.wait_for_timeout(2000)


def go_to_chat(page):
    """Click chat nav item."""
    page.evaluate("showPage('chat')")
    page.wait_for_timeout(500)


def create_session(page):
    """Create a new session via API call."""
    token = page.evaluate("localStorage.getItem('token')")
    res = page.evaluate("""async (token) => {
        const r = await fetch('/api/agent/sessions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ title: '测试会话' })
        });
        return await r.json();
    }""", token)
    return res


def get_session(page, sid):
    """Get session data."""
    token = page.evaluate("localStorage.getItem('token')")
    res = page.evaluate("""async (args) => {
        const r = await fetch('/api/agent/sessions/' + args.sid, {
            headers: { 'Authorization': 'Bearer ' + args.token }
        });
        return await r.json();
    }""", {"sid": sid, "token": token})
    return res


def get_messages_dom_info(page):
    """Get info about rendered messages in chatMessages container."""
    return page.evaluate("""() => {
        const container = document.getElementById('chatMessages');
        if (!container) return {error: 'no container'};
        const children = Array.from(container.children);
        return {
            childCount: children.length,
            children: children.map((c, i) => ({
                idx: i,
                tag: c.tagName,
                class: c.className,
                id: c.id || '',
                textPreview: (c.textContent || '').substring(0, 100)
            })),
            scrollTop: container.scrollTop,
            scrollHeight: container.scrollHeight,
            clientHeight: container.clientHeight
        };
    }""")


def count_tool_call_cards(page):
    """Count tool call cards visible in messages."""
    return page.evaluate("""() => {
        const tlCards = document.querySelectorAll('.timeline-tool-card').length;
        const inlineToolCalls = document.querySelectorAll('.inline-tool-calls, .tool-calls').length;
        const toolMsgs = document.querySelectorAll('.msg.tool, .msg.tool-result').length;
        return { timelineCards: tlCards, inlineToolCalls: inlineToolCalls, toolMsgs: toolMsgs };
    }""")


def count_streaming_indicators(page):
    """Count streaming class divs."""
    return page.evaluate("""() => {
        const streaming = document.querySelectorAll('.msg.streaming').length;
        const thinking = document.querySelectorAll('.inline-status').length;
        return { streaming: streaming, thinkingIndicators: thinking };
    }""")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 800})
        page = context.new_page()

        print("=" * 60)
        print("Test 1: Login and create sessions")
        print("=" * 60)
        login(page)
        go_to_chat(page)

        # Test 1: Create session 1 and send a message
        s1 = create_session(page)
        print(f"Session 1: {s1.get('session_id', s1)}")
        sid1 = s1.get('session_id') or s1.get('id')
        if not sid1:
            print(f"Failed to create session: {s1}")
            return

        # Test 2: Send a simple message
        print("\n" + "=" * 60)
        print("Test 2: Send first message")
        print("=" * 60)
        token = page.evaluate("localStorage.getItem('token')")
        chat_result = page.evaluate("""async (args) => {
            const r = await fetch('/api/agent/chat/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + args.token },
                body: JSON.stringify({ session_id: args.sid, message: '你好，请简单介绍一下你自己' })
            });
            return { status: r.status, ok: r.ok };
        }""", {"sid": sid1, "token": token})
        print(f"Chat result: {chat_result}")

        # Wait for AI to finish
        time.sleep(20)

        sess1 = get_session(page, sid1)
        print(f"Session 1 state: {sess1.get('state', 'unknown')}")
        msg_count = len(sess1.get('messages', []))
        print(f"Session 1 message count: {msg_count}")

        # Test 3: Switch to session 1
        print("\n" + "=" * 60)
        print("Test 3: Switch to session 1 - check scroll position")
        print("=" * 60)
        page.evaluate(f"switchSession('{sid1}')")
        time.sleep(2)
        info = get_messages_dom_info(page)
        print(f"Session 1 child count: {info['childCount']}")
        print(f"Scroll top: {info['scrollTop']}, scrollHeight: {info['scrollHeight']}")
        print(f"At bottom: {info['scrollTop'] + info['clientHeight'] >= info['scrollHeight'] - 5}")

        # Test 4: Create session 2 and send a message that triggers tools
        print("\n" + "=" * 60)
        print("Test 4: Create session 2 and send tool-using message")
        print("=" * 60)
        s2 = create_session(page)
        sid2 = s2.get('session_id') or s2.get('id')
        print(f"Session 2: {sid2}")

        # Send a message that requires tool calls
        chat_result = page.evaluate("""async (args) => {
            const r = await fetch('/api/agent/chat/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + args.token },
                body: JSON.stringify({ session_id: args.sid, message: '查询所有云平台的资源统计信息' })
            });
            return { status: r.status, ok: r.ok };
        }""", {"sid": sid2, "token": token})
        print(f"Chat result: {chat_result}")

        # Poll for running state
        for i in range(10):
            time.sleep(1)
            s = get_session(page, sid2)
            state = s.get('state', 'unknown')
            print(f"  [{i+1}s] Session 2 state: {state}")
            if state == 'running' or state == 'queued':
                # Switch away while running
                print(f"\n[AI is running!] Switching to session 1...")
                page.evaluate(f"switchSession('{sid1}')")
                time.sleep(2)
                # Now switch back
                print(f"\n[Switching back to session 2]")
                page.evaluate(f"switchSession('{sid2}')")
                time.sleep(2)
                break

        # Wait for AI to complete
        print("Waiting for AI to complete...")
        for i in range(60):
            time.sleep(2)
            s = get_session(page, sid2)
            state = s.get('state', 'unknown')
            if state not in ('running', 'queued'):
                print(f"  AI completed at iteration {i}, state: {state}")
                break

        # Now switch back to test the completed state
        page.evaluate(f"switchSession('{sid1}')")
        time.sleep(2)
        page.evaluate(f"switchSession('{sid2}')")
        time.sleep(2)

        info = get_messages_dom_info(page)
        print(f"\nSession 2 child count after switch back: {info['childCount']}")
        for child in info['children']:
            print(f"  [{child['idx']}] {child['tag']} class='{child['class']}' id='{child['id']}' text: {child['textPreview']}")

        # Check session 2 messages
        sess2 = get_session(page, sid2)
        print(f"\nSession 2 messages: {len(sess2.get('messages', []))}")
        for m in sess2.get('messages', []):
            print(f"  role={m.get('role')}, content_preview={(m.get('content') or '')[:80]}")

        # Count tools/messages with tool names
        tool_check = page.evaluate("""() => {
            const c = document.getElementById('chatMessages');
            const txt = c.textContent;
            return {
                cloud_stats_count: (txt.match(/get_cloud_stats/gi) || []).length,
                list_accounts_count: (txt.match(/list_cloud_accounts/gi) || []).length,
                run_events_count: document.querySelectorAll('.run-events').length,
                tool_msg_count: document.querySelectorAll('.msg.tools, .msg.tool, .msg.tool-result').length,
                tool_card_count: document.querySelectorAll('.timeline-tool-card').length,
                streaming_count: document.querySelectorAll('.msg.streaming').length
            };
        }""")
        print(f"\nTool check: {tool_check}")

        # Save screenshot
        page.screenshot(path='/tmp/mcm_test_final.png', full_page=True)
        print("Screenshot: /tmp/mcm_test_final.png")

        # Test scroll to bottom
        print("\n" + "=" * 60)
        print("Test: Scroll to bottom on session load")
        print("=" * 60)
        page.evaluate(f"switchSession('{sid1}')")
        time.sleep(1)
        page.evaluate(f"switchSession('{sid2}')")
        time.sleep(1)
        scroll_info = page.evaluate("""() => {
            const c = document.getElementById('chatMessages');
            return { scrollTop: c.scrollTop, scrollHeight: c.scrollHeight, clientHeight: c.clientHeight };
        }""")
        print(f"After switch: scrollTop={scroll_info['scrollTop']}, scrollHeight={scroll_info['scrollHeight']}")
        print(f"At bottom: {scroll_info['scrollTop'] + scroll_info['clientHeight'] >= scroll_info['scrollHeight'] - 5}")

        browser.close()
        print("\n" + "=" * 60)
        print("Tests complete")
        print("=" * 60)


if __name__ == '__main__':
    main()
