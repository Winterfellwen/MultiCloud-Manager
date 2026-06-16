// Patched functions for MultiCloud Manager to fix tool call duplicate display
// These override the built-in handleStateChangeEvent and savePartialContent

window.savePartialContent = function(ev) {
  if (!ev.session_id) return;
  if (!SESSION_MESSAGES[ev.session_id]) SESSION_MESSAGES[ev.session_id] = [];
  // Save agent content FIRST, then tool-calls. This matches the order
  // used by handleStateChangeEvent's done branch and ensures renderToolCallsInline
  // can attach tool cards to the preceding agent message (not a standalone group).
  // Mark partial saves as streaming:true so the done handler can replace them.
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
    // Tool calls are already rendered inline in STREAMING_DIV during execution.
    // No need to render a separate group.
    // Note: STREAMING_DIV may be null if user switched sessions during streaming.
    // In that case, use STREAMING_CONTENT directly to save final state.
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
    // Save to in-memory cache — always do this for the run's session
    // even if STREAMING_DIV is null (user switched sessions during streaming).
    if (ev.session_id) {
      if (!SESSION_MESSAGES[ev.session_id]) SESSION_MESSAGES[ev.session_id] = [];
      var runId = ev.run_id || '';
      // Strategy: always replace partial saves for this run with final content.
      // Delete all messages with this run_id (partial saves have streaming:true,
      // which distinguishes them from truly finalized messages).
      if (runId) {
        SESSION_MESSAGES[ev.session_id] = SESSION_MESSAGES[ev.session_id].filter(function(m) {
          // Keep messages without run_id (e.g., user messages, old finalized messages)
          // Delete messages with matching run_id (they're partial saves to be replaced)
          return m._run_id !== runId;
        });
      }
      // Collect all content blocks and tool cards from STREAMING_DIV in order
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
      // Also save pending tool calls that may not have DOM cards
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
      // If STREAMING_DIV is null (switched sessions), use STREAMING_CONTENT directly
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
  } else if (newState === 'error') {
    if (isCurrentSession) showError(ev.payload.error_message);
    resetCurrentRun(ev);
    if (STREAMING_DIV) {
      STREAMING_DIV.classList.remove('streaming');
      var contentElErr = STREAMING_DIV.querySelector('.msg-content');
      if (contentElErr) {
        contentElErr.classList.remove('streaming-cursor');
        var errorMsg = ev.payload.error_message || (LOCALE === 'zh' ? '发生错误' : 'Error occurred');
        contentElErr.innerHTML = '<div style="color:var(--error);padding:8px 0">' + escHtml(errorMsg) + '</div>';
      }
      savePartialContent(ev);
      finalizeToolCards(STREAMING_DIV, 'error', LOCALE === 'zh' ? '错误' : 'error');
      STREAMING_DIV = null;
      STREAMING_CONTENT = '';
    }
  } else if (newState === 'stopped') {
    if (ev.run_id) STOPPED_RUNS.add(ev.run_id);
    _pendingStopSession = null;
    if (isCurrentSession) showError(LOCALE === 'zh' ? '已停止' : 'Stopped');
    resetCurrentRun(ev);
    if (STREAMING_DIV) {
      STREAMING_DIV.classList.remove('streaming');
      var contentElStop = STREAMING_DIV.querySelector('.msg-content');
      if (contentElStop) contentElStop.classList.remove('streaming-cursor');
      savePartialContent(ev);
      finalizeToolCards(STREAMING_DIV, 'done', LOCALE === 'zh' ? '完成' : 'done');
      STREAMING_DIV = null;
      STREAMING_CONTENT = '';
    }
  }
};

// Patch the alreadyHasToolCalls check in switchSession to not depend on run_id matching
window._originalSwitchSession = window.switchSession;
window.switchSession = async function(sid) {
  // Call original switchSession
  await window._originalSwitchSession(sid);
  
  // After switching, check if we need to clean up duplicate tool calls
  // This is a safety net for cases where the active_run_events were rendered
  // despite tool-calls already existing in SESSION_MESSAGES
  var container = document.getElementById('chatMessages');
  if (container) {
    var toolCards = container.querySelectorAll('.timeline-tool-card');
    var toolResultMsgs = container.querySelectorAll('.msg.tool-result');
    
    // If we have both timeline-tool-card (inline) and tool-result (raw), remove the raw ones
    if (toolCards.length > 0 && toolResultMsgs.length > 0) {
      toolResultMsgs.forEach(function(el) {
        el.remove();
      });
    }
    
    // Also remove any raw tool messages
    var rawToolMsgs = container.querySelectorAll('.msg.tool');
    if (toolCards.length > 0 && rawToolMsgs.length > 0) {
      rawToolMsgs.forEach(function(el) {
        el.remove();
      });
    }
  }
};

console.log('[PATCH] Applied fixed handleStateChangeEvent, savePartialContent, and switchSession');
