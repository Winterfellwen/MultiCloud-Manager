from playwright.sync_api import sync_playwright
import time

def test_done_replaces_partial():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        
        # Enable console logging
        page.on('console', lambda msg: print(f'[CONSOLE] {msg.text}'))
        
        # Login first
        page.goto('http://localhost:8000/login.html')
        page.fill('input[name="username"]', 'admin')
        page.fill('input[name="password"]', '123456')
        page.click('button[type="submit"]')
        time.sleep(1)
        
        # Go to main page - loads current index.html
        page.goto('http://localhost:8000/')
        page.wait_for_selector('#chatMessages', timeout=10000)
        page.evaluate("showPage('chat')")
        time.sleep(0.5)
        
        sid = 'test-session-' + str(int(time.time()))
        
        result = page.evaluate("""(sid) => {
            SESSION_MESSAGES[sid] = [
                {role: 'user', content: '测试 done 事件', created_at: new Date().toISOString()},
                {role: 'agent', content: '正在思考...', created_at: new Date().toISOString(), streaming: true, _run_id: 'runid-001'},
                {role: 'tool-calls', content: JSON.stringify([{name: 'get_cloud_stats', params: '{}', result: '{"ok":true}'}]), created_at: new Date().toISOString(), streaming: true, _run_id: 'runid-001'}
            ];
            
            var container = document.getElementById('chatMessages');
            while (container.firstChild) container.removeChild(container.firstChild);
            
            var div = document.createElement('div');
            div.className = 'msg agent streaming';
            div.innerHTML = '<span class="msg-role">AI</span><div class="msg-content">最终答案：调用工具后的总结</div><div class="timeline-tool-card"><div class="card-name">get_cloud_stats</div><div class="field-result">{"ok":true}</div></div><span class="msg-time">11:22</span><span class="agent-copy-btn">复制</span>';
            container.appendChild(div);
            STREAMING_DIV = div;
            PENDING_TOOL_CALLS = [];
            CURRENT_SESSION = sid;
            
            console.log('before HSC: SESSION_MESSAGES count=' + SESSION_MESSAGES[sid].length);
            handleStateChangeEvent({session_id: sid, run_id: 'runid-001', payload: {state: 'done'}});
            console.log('after HSC: SESSION_MESSAGES count=' + (SESSION_MESSAGES[sid] || []).length);
            
            return JSON.stringify(SESSION_MESSAGES[sid] || []);
        }""", sid)
        
        import json
        msgs = json.loads(result)
        for i, m in enumerate(msgs):
            content_preview = m.get('content', '')[:50]
            print(f"  msg[{i}] role={m['role']} streaming={m.get('streaming', 'NOT SET')} content={content_preview}")
        
        print("\n--- Check Results ---")
        has_streaming_true = any(m.get('streaming') is True for m in msgs)
        print(f"  Has streaming:true messages: {has_streaming_true}")
        print(f"  Expected: False (partial saves should be replaced by final content)")
        
        if has_streaming_true:
            print("  ❌ FAIL: Partial saves were NOT replaced!")
        else:
            print("  ✅ PASS: Partial saves were replaced correctly!")
        
        browser.close()

if __name__ == '__main__':
    test_done_replaces_partial()
