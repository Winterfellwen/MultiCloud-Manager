filepath = '/Users/xinruiwen/AI-Wen/MultiCloud-Manager/verify_fixes.py'
with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

start_idx = None
end_idx = None
for i, line in enumerate(lines):
    if '========== Test 3' in line and start_idx is None:
        start_idx = i
    if '========== Test 4' in line:
        end_idx = i
        break

print(f"Found Test 3 starting at line {start_idx+1}, ending at line {end_idx+1}")

# Build new Test 3 as a list of lines
new_test3_lines = []
new_test3_lines.append('        # ========== Test 3: done event replaces partial save ==========\n')
new_test3_lines.append('        print("\\n--- Test 3: done 事件替换部分保存 ---")\n')
new_test3_lines.append('\n')
new_test3_lines.append('        sid_c = page.evaluate("""() => {\n')
new_test3_lines.append('            SESSION_MESSAGES = {};\n')
new_test3_lines.append('            STREAMING_DIV = null;\n')
new_test3_lines.append('            STREAMING_CONTENT = \'\';\n')
new_test3_lines.append('            PENDING_TOOL_CALLS = [];\n')
new_test3_lines.append('            return \'test-session-\' + Date.now();\n')
new_test3_lines.append('        }""")\n')
new_test3_lines.append('        print(f"  C = {sid_c}")\n')
new_test3_lines.append('\n')
new_test3_lines.append('        # Simulate: session has partial saves, then AI finishes - done handler should replace them\n')
new_test3_lines.append('        result = page.evaluate("""(sid) => {\n')
new_test3_lines.append('            // Step 1: Set up partial saves (as if we switched away during a run)\n')
new_test3_lines.append('            SESSION_MESSAGES[sid] = [\n')
new_test3_lines.append('                {role: \'user\', content: \'测试 done 事件\', created_at: new Date().toISOString()},\n')
new_test3_lines.append('                {role: \'agent\', content: \'正在思考...\', created_at: new Date().toISOString(), streaming: true, _run_id: \'t3-runid\'},\n')
new_test3_lines.append('                {role: \'tool-calls\', content: JSON.stringify([\n')
new_test3_lines.append('                    {name: \'get_cloud_stats\', params: \'{}\', result: \'{"ok":true}\', status: \'done\'}\n')
new_test3_lines.append('                ]), created_at: new Date().toISOString(), streaming: true, _run_id: \'t3-runid\'}\n')
new_test3_lines.append('            ];\n')
new_test3_lines.append('\n')
new_test3_lines.append('            // Step 2: Set up STREAMING_DIV with final content\n')
new_test3_lines.append('            var container = document.getElementById(\'chatMessages\');\n')
new_test3_lines.append('            while (container.firstChild) container.removeChild(container.firstChild);\n')
new_test3_lines.append('\n')
new_test3_lines.append('            var div = document.createElement(\'div\');\n')
new_test3_lines.append('            div.className = \'msg agent streaming\';\n')
new_test3_lines.append('            div.innerHTML = \'<span class="msg-role">AI</span><div class="msg-content">最终答案：调用工具后的总结</div><div class="timeline-tool-card"><div class="card-name">get_cloud_stats</div><div class="field-result">{"ok":true}</div></div><span class="msg-time">11:22</span><span class="agent-copy-btn">复制</span>\';\n')
new_test3_lines.append('            container.appendChild(div);\n')
new_test3_lines.append('            STREAMING_DIV = div;\n')
new_test3_lines.append('            PENDING_TOOL_CALLS = [];\n')
new_test3_lines.append('\n')
new_test3_lines.append('            // Step 3: Call done handler\n')
new_test3_lines.append('            handleStateChangeEvent({session_id: sid, run_id: \'t3-runid\', payload: {state: \'done\'}});\n')
new_test3_lines.append('\n')
new_test3_lines.append('            // Step 4: Return final state\n')
new_test3_lines.append('            return JSON.stringify(SESSION_MESSAGES[sid] || []);\n')
new_test3_lines.append('        }""", sid_c)\n')
new_test3_lines.append('\n')
new_test3_lines.append('        import json\n')
new_test3_lines.append('        msgs_c = json.loads(result)\n')
new_test3_lines.append('        print(f"  最终 SESSION_MESSAGES[C] entries: {len(msgs_c)}")\n')
new_test3_lines.append('        for m in msgs_c:\n')
new_test3_lines.append('            content_preview = m.get(\'content\', \'\')[:60]\n')
new_test3_lines.append('            streaming = m.get(\'streaming\', False)\n')
new_test3_lines.append('            run_id = m.get(\'_run_id\', \'\')[:12]\n')
new_test3_lines.append('            print(f"    role={m[\'role\']:12} streaming={str(streaming):6} run_id={run_id:12} content={content_preview}")\n')
new_test3_lines.append('\n')
new_test3_lines.append('        # Verify:\n')
new_test3_lines.append('        # 1. No messages with streaming:true for this run_id\n')
new_test3_lines.append('        # 2. Agent content is "最终答案..." not "正在思考..."\n')
new_test3_lines.append('        any_streaming = any(m.get(\'streaming\') and m.get(\'_run_id\') == \'t3-runid\' for m in msgs_c)\n')
new_test3_lines.append('        has_final_answer = any(\'最终答案\' in m.get(\'content\', \'\') for m in msgs_c)\n')
new_test3_lines.append('        print(f"  没有 stream:true 的消息: {not any_streaming} {\'✓\' if not any_streaming else \'✗ FAIL\'}")\n')
new_test3_lines.append('        print(f"  包含最终答案: {has_final_answer} {\'✓\' if has_final_answer else \'✗ FAIL\'}")\n')
new_test3_lines.append('\n')

new_lines = lines[:start_idx] + new_test3_lines + lines[end_idx:]

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f"Done. Replaced {end_idx - start_idx} lines with {len(new_test3_lines)} lines.")

# Verify
with open(filepath, 'r', encoding='utf-8') as f:
    check = f.read()
assert "Test 3" in check, "Test 3 not found!"
assert "Test 4" in check, "Test 4 not found!"
print("Verification: File structure looks good.")
