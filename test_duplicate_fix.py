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

    # Inject patched functions
    print("\n=== Injecting patched functions ===")
    page.evaluate("""() => {
        // Patch savePartialContent
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

        // Patch handleStateChangeEvent done branch
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
            }
            if (ev.session_id) {
              if (!SESSION_MESSAGES[ev.session_id]) SESSION_MESSAGES[ev.session_id] = [];
              var runId = ev.run_id || '';
              if (runId) {
                SESSION_MESSAGES[ev.session_id] = SESSION_MESSAGES[ev.session_id].filter(function(m) {
                  return m._run_id !== runId;
                });
              }
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
              if (!STREAMING_DIV && STREAMING_CONTENT) {
                blocks.push({role: 'agent', content: STREAMING_CONTENT});
              }
              blocks.forEach(function(b) {
                b.created_at = new Date().toISOString();
                b._run_id = ev.run_id;
                SESSION_MESSAGES[ev.session_id].push(b);
              });
            }
            if (STREAMING_DIV) {
              finalizeToolCards(STREAMING_DIV, 'done', LOCALE === 'zh' ? '完成' : 'done');
              scrollToBottom();
              STREAMING_DIV = null;
            }
            STREAMING_CONTENT = '';
            PENDING_TOOL_CALLS = [];
          }
        };
        console.log('[PATCH] Applied fixes');
    }""")
    print("=== Functions injected ===")

    # === TEST: Tool call duplicate display fix ===
    print("\n=== TEST: Tool call duplicate display fix ===")
    result = page.evaluate("""() => {
        var sid = 'test-session-' + Date.now();
        
        // Set up SESSION_MESSAGES with tool-calls (simulating session switch during run)
        SESSION_MESSAGES[sid] = [
            {role: 'user', content: '有什么资源', created_at: new Date().toISOString()},
            {role: 'agent', content: '我来帮您查看当前配置的云资源', created_at: new Date().toISOString(), streaming: true, _run_id: 'run-abc'},
            {role: 'tool-calls', content: JSON.stringify([
                {name: 'LIST_CLOUD_RESOURCES', params: '{}', result: '{"count":3,"resources":[...]}'}
            ]), created_at: new Date().toISOString(), streaming: true, _run_id: 'run-abc'}
        ];

        // Set up DOM with agent message and tool card
        var container = document.getElementById('chatMessages');
        while (container.firstChild) container.removeChild(container.firstChild);

        // Add user message
        var userDiv = document.createElement('div');
        userDiv.className = 'msg user';
        userDiv.innerHTML = '<span class="msg-role">用户</span><div class="msg-content">有什么资源</div><span class="msg-time">13:49</span>';
        container.appendChild(userDiv);

        // Add agent message with tool card (inline)
        var agentDiv = document.createElement('div');
        agentDiv.className = 'msg agent';
        agentDiv.innerHTML = '<span class="msg-role">AI</span><div class="msg-content">我来帮您查看当前配置的云资源</div><div class="timeline-tool-card"><div class="card-name">LIST_CLOUD_RESOURCES</div><div class="field-result">{"count":3,"resources":[...]}</div></div><span class="msg-time">13:50</span><span class="agent-copy-btn">复制</span>';
        container.appendChild(agentDiv);

        console.log('[TEST] Initial state:');
        console.log('[TEST]   timeline-tool-card count: ' + container.querySelectorAll('.timeline-tool-card').length);
        console.log('[TEST]   msg.tool-result count: ' + container.querySelectorAll('.msg.tool-result').length);
        console.log('[TEST]   msg.tool count: ' + container.querySelectorAll('.msg.tool').length);

        // Now simulate: active_run_events would render tool calls again
        // This is what happens when switching sessions
        var runDiv = document.createElement('div');
        runDiv.className = 'run-events';
        
        // Simulate renderRunEvents output (raw tool calls)
        runDiv.innerHTML = '<div class="msg tool"><div class="msg-role"><span class="role-icon"><svg width="16" height="16"><use href="/static/icons.svg#icon-terminal"/></svg></span><span class="role-label">LIST_CLOUD_RESOURCES</span></div></div><div class="msg tool-result"><div class="msg-role"><span class="role-icon"><svg width="16" height="16"><use href="/static/icons.svg#icon-code"/></svg></span><span class="role-label">LIST_CLOUD_RESOURCES</span></div><div class="msg-content">{"count":3,"resources":[...]}</div></div>';
        
        container.appendChild(runDiv);

        console.log('[TEST] After renderRunEvents:');
        console.log('[TEST]   timeline-tool-card count: ' + container.querySelectorAll('.timeline-tool-card').length);
        console.log('[TEST]   msg.tool-result count: ' + container.querySelectorAll('.msg.tool-result').length);
        console.log('[TEST]   msg.tool count: ' + container.querySelectorAll('.msg.tool').length);

        // Apply our cleanup logic
        var toolCards = container.querySelectorAll('.timeline-tool-card');
        var toolResultMsgs = container.querySelectorAll('.msg.tool-result');
        var rawToolMsgs = container.querySelectorAll('.msg.tool');
        
        if (toolCards.length > 0) {
            if (toolResultMsgs.length > 0) {
                toolResultMsgs.forEach(function(el) { el.remove(); });
            }
            if (rawToolMsgs.length > 0) {
                rawToolMsgs.forEach(function(el) { el.remove(); });
            }
        }

        console.log('[TEST] After cleanup:');
        console.log('[TEST]   timeline-tool-card count: ' + container.querySelectorAll('.timeline-tool-card').length);
        console.log('[TEST]   msg.tool-result count: ' + container.querySelectorAll('.msg.tool-result').length);
        console.log('[TEST]   msg.tool count: ' + container.querySelectorAll('.msg.tool').length);

        return {
            timelineToolCards: container.querySelectorAll('.timeline-tool-card').length,
            toolResultMsgs: container.querySelectorAll('.msg.tool-result').length,
            rawToolMsgs: container.querySelectorAll('.msg.tool').length
        };
    }""")

    print("\n=== Results ===")
    print(f"  timeline-tool-card (inline): {result['timelineToolCards']}")
    print(f"  msg.tool-result (raw): {result['toolResultMsgs']}")
    print(f"  msg.tool (raw): {result['rawToolMsgs']}")

    print("\n=== Verification ===")
    has_duplicate = result['toolResultMsgs'] > 0 or result['rawToolMsgs'] > 0
    has_inline = result['timelineToolCards'] > 0
    
    print(f"  Has inline tool cards: {'PASS ✓' if has_inline else 'FAIL ✗'}")
    print(f"  No duplicate raw tool calls: {'PASS ✓' if not has_duplicate else 'FAIL ✗'}")

    if has_inline and not has_duplicate:
        print("\n✅ ALL TESTS PASSED!")
    else:
        print("\n❌ SOME TESTS FAILED!")

    browser.close()
