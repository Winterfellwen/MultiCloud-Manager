from playwright.sync_api import sync_playwright
import time, json, subprocess

BASE = 'http://localhost:8099'

def get_token():
    r = subprocess.run(['curl', '-s', '-X', 'POST', BASE + '/api/auth/login',
        '-H', 'Content-Type: application/json',
        '-d', '{"username":"admin","password":"Admin123!"}'],
        capture_output=True, text=True)
    return json.loads(r.stdout)['token']

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={'width': 1280, 'height': 800})
    page = ctx.new_page()
    page.on('console', lambda msg: print(f'[CONSOLE] {msg.text}'))

    token = get_token()
    page.goto(BASE + '/login.html')
    page.wait_for_load_state('networkidle')
    page.evaluate("localStorage.setItem('token', '" + token + "')")
    page.goto(BASE + '/')
    page.wait_for_load_state('networkidle')
    time.sleep(2)
    page.evaluate("showPage('chat')")
    time.sleep(1)

    # Now inject the PATCHED functions
    print("\n=== Injecting patched functions ===")
    page.evaluate("""() => {
        window.savePartialContent = function(ev) {
          if (!ev.session_id) return;
          if (!SESSION_MESSAGES[ev.session_id]) SESSION_MESSAGES[ev.session_id] = [];
          if (STREAMING_CONTENT) {
            SESSION_MESSAGES[ev.session_id].push({role: 'agent', content: STREAMING_CONTENT, created_at: new Date().toISOString(), _run_id: ev.run_id, streaming: true});
          }
          if (PENDING_TOOL_CALLS.length > 0) {
            SESSION_MESSAGES[ev.session_id].push({
              role: 'tool-calls',
              content: JSON.stringify(PENDING_TOOL_CALLS.map(function(tc) {
                return {name: tc.name, params: tc.params, result: tc.result};
              })),
              created_at: new Date().toISOString(),
              _run_id: ev.run_id,
              streaming: true
            });
          }
        };

        window.handleStateChangeEvent = function(ev) {
          var isCurrentSession = ev.session_id === CURRENT_SESSION;
          var newState = ev.payload.state;
          if (newState === 'done') {
            resetCurrentRun(ev);
            if (STREAMING_DIV) {
              STREAMING_DIV.classList.remove('streaming');
              var allContentEls = STREAMING_DIV.querySelectorAll('.msg-content');
              allContentEls.forEach(function(el) {
                el.classList.remove('streaming-cursor');
                var statusEl = el.querySelector('.inline-status');
                if (statusEl) statusEl.remove();
                if (!el.textContent.trim()) el.remove();
              });
              var orphanStatus = STREAMING_DIV.querySelector(':scope > .inline-status');
              if (orphanStatus) orphanStatus.remove();
              if (ev.session_id) {
                if (!SESSION_MESSAGES[ev.session_id]) SESSION_MESSAGES[ev.session_id] = [];
                var runId = ev.run_id || '';
                var shouldSave = true;
                if (runId) {
                  shouldSave = !SESSION_MESSAGES[ev.session_id].some(function(m) {
                    return m._run_id === runId && m.streaming !== true;
                  });
                  if (shouldSave) {
                    SESSION_MESSAGES[ev.session_id] = SESSION_MESSAGES[ev.session_id].filter(function(m) {
                      return m._run_id !== runId;
                    });
                  }
                }
                if (shouldSave) {
                  var timeEl = STREAMING_DIV ? STREAMING_DIV.querySelector('.msg-time') : null;
                  var blocks = [];
                  if (STREAMING_DIV) {
                    var children = STREAMING_DIV.children;
                    for (var bi = 0; bi < children.length; bi++) {
                      var child = children[bi];
                      if (child === timeEl) continue;
                      if (child.classList.contains('msg-role') || child.classList.contains('agent-copy-btn')) continue;
                      if (child.classList.contains('msg-content')) {
                        var text = child.textContent.trim();
                        if (text) blocks.push({role: 'agent', content: text});
                      } else if (child.classList.contains('timeline-tool-card')) {
                        var tcName = child.querySelector('.card-name');
                        var tcResult = child.querySelector('.field-result');
                        var tcParams = child.querySelector('.field-args');
                        var tcTimestamp = child.querySelector('.card-timestamp');
                        blocks.push({
                          role: 'tool-calls',
                          content: JSON.stringify([{
                            name: tcName ? tcName.textContent : 'unknown',
                            params: tcParams ? tcParams.textContent : '',
                            result: tcResult ? tcResult.textContent : '',
                            timestamp: tcTimestamp ? tcTimestamp.textContent : ''
                          }])
                        });
                      }
                    }
                  }
                  if (PENDING_TOOL_CALLS.length > 0) {
                    var savedTcNames = {};
                    blocks.forEach(function(b) {
                      if (b.role === 'tool-calls') {
                        try { var arr = JSON.parse(b.content); arr.forEach(function(t) { savedTcNames[t.name] = true; }); } catch(e) {}
                      }
                    });
                    PENDING_TOOL_CALLS.forEach(function(tc) {
                      if (!savedTcNames[tc.name]) {
                        blocks.push({
                          role: 'tool-calls',
                          content: JSON.stringify([{name: tc.name, params: tc.params, result: tc.result}])
                        });
                      }
                    });
                  }
                  blocks.forEach(function(b) {
                    b.created_at = new Date().toISOString();
                    b._run_id = ev.run_id;
                    SESSION_MESSAGES[ev.session_id].push(b);
                  });
                }
              }
              finalizeToolCards(STREAMING_DIV, 'done', LOCALE === 'zh' ? '完成' : 'done');
              scrollToBottom();
              STREAMING_DIV = null;
              STREAMING_CONTENT = '';
            }
            PENDING_TOOL_CALLS = [];
          }
        };
        console.log('[PATCH] Applied fixed handleStateChangeEvent and savePartialContent');
    }""")
    print("=== Functions injected ===")

    # === TEST: Done event replaces partial saves ===
    print("\n=== TEST: Done event replaces partial saves ===")
    result = page.evaluate("""() => {
        var sid = 'test-session-' + Date.now();
        // Simulate partial saves (as if switched away during AI run)
        SESSION_MESSAGES[sid] = [
            {role: 'user', content: '测试 done 事件', created_at: new Date().toISOString()},
            {role: 'agent', content: '正在思考...', created_at: new Date().toISOString(), streaming: true, _run_id: 'run-001'},
            {role: 'tool-calls', content: JSON.stringify([
                {name: 'get_cloud_stats', params: '{}', result: '{"ok":true}', status: 'done'}
            ]), created_at: new Date().toISOString(), streaming: true, _run_id: 'run-001'}
        ];

        // Set up STREAMING_DIV with final content
        var container = document.getElementById('chatMessages');
        while (container.firstChild) container.removeChild(container.firstChild);

        var div = document.createElement('div');
        div.className = 'msg agent streaming';
        div.innerHTML = '<span class="msg-role">AI</span><div class="msg-content">最终答案：调用工具后的总结</div><div class="timeline-tool-card"><div class="card-name">get_cloud_stats</div><div class="field-result">{"ok":true}</div></div><span class="msg-time">11:22</span><span class="agent-copy-btn">复制</span>';
        container.appendChild(div);
        STREAMING_DIV = div;
        PENDING_TOOL_CALLS = [];

        console.log('[TEST] Before: SESSION_MESSAGES count = ' + SESSION_MESSAGES[sid].length);
        console.log('[TEST] Before: agent content = ' + SESSION_MESSAGES[sid][1].content);

        // Call done handler
        handleStateChangeEvent({session_id: sid, run_id: 'run-001', payload: {state: 'done'}});

        console.log('[TEST] After: SESSION_MESSAGES count = ' + SESSION_MESSAGES[sid].length);
        SESSION_MESSAGES[sid].forEach(function(m, i) {
            console.log('[TEST]   msg[' + i + '] role=' + m.role + ' streaming=' + m.streaming + ' content=' + (m.content || '').substring(0, 30));
        });

        return JSON.stringify(SESSION_MESSAGES[sid]);
    }""")

    msgs = json.loads(result)
    print("\n=== Results ===")
    print(f"Total messages: {len(msgs)}")
    for m in msgs:
        content = m.get('content', '')[:80]
        streaming = m.get('streaming', False)
        run_id = m.get('_run_id', '')[:12]
        role = m.get('role', '')
        print(f"  [{role}] streaming={streaming} run_id={run_id} content={content}")

    # Verify conditions
    has_streaming_true = any(m.get('streaming') for m in msgs if m.get('_run_id') == 'run-001')
    has_final_answer = any('最终答案' in m.get('content', '') for m in msgs)
    has_thinking = any('正在思考' in m.get('content', '') for m in msgs)

    print("\n=== Verification ===")
    print(f"  NO streaming:true messages with run-001: {'PASS ✓' if not has_streaming_true else 'FAIL ✗'}")
    print(f"  HAS final answer: {'PASS ✓' if has_final_answer else 'FAIL ✗'}")
    print(f"  NO '正在思考...' (partial save): {'PASS ✓' if not has_thinking else 'FAIL ✗'}")

    if not has_streaming_true and has_final_answer and not has_thinking:
        print("\n✅ ALL TESTS PASSED!")
    else:
        print("\n❌ SOME TESTS FAILED!")

    browser.close()
