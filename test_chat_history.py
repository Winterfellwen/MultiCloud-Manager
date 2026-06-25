#!/usr/bin/env python3
"""
Playwright 测试脚本 - 测试对话历史重复展示问题修复

测试场景：
1. 登录系统
2. 创建多个会话
3. 在 AI 运行中切换会话
4. 切换回原会话，验证消息是否重复
"""

import time
from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:8099"
USERNAME = "admin"
PASSWORD = "Admin123!"


def login(page):
    """登录系统"""
    print("\n[1] 打开登录页")
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1000)
    
    username_input = page.locator('input[name="username"], input[type="text"]').first
    password_input = page.locator('input[name="password"], input[type="password"]').first
    
    if username_input.is_visible():
        print("[1.1] 填写登录表单")
        username_input.fill(USERNAME)
        password_input.fill(PASSWORD)
        page.locator('button[type="submit"]').first.click()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)
    
    print("[1] 登录完成")


def navigate_to_chat(page):
    """导航到 AI 聊天页面"""
    print("\n[2] 导航到 AI 聊天页面")
    # 尝试通过导航栏的 div (nav-item) 按钮
    try:
        chat_btn = page.locator('.nav-item[data-page="chat"]').first
        if chat_btn.is_visible():
            chat_btn.click()
            page.wait_for_timeout(2000)
    except Exception as e:
        print(f"  备用方案: {e}")
        # 备用方案：直接通过 JS 切换视图
        page.evaluate("""
            () => {
                if (typeof showPage === 'function') {
                    showPage('chat');
                }
            }
        """)
        page.wait_for_timeout(2000)
    
    page.screenshot(path="/tmp/mcm_02_chat_page.png")
    print("[2] 已进入聊天页面")
    return True


def send_message(page, message, wait=3):
    """发送消息到 AI"""
    print(f"\n[3] 发送消息: {message}")
    chat_input = page.locator('#chatInput')
    chat_input.fill(message)
    page.wait_for_timeout(500)
    
    send_btn = page.locator('#chatSendBtn')
    send_btn.click()
    page.wait_for_timeout(wait * 1000)
    print(f"[3] 消息已发送，等待 {wait} 秒")


def get_message_count(page):
    """获取当前显示的消息数量"""
    return page.locator('.msg').count()


def get_session_count(page):
    """获取会话数量"""
    return page.locator('.chat-session-item').count()


def switch_to_session(page, index):
    """切换到指定索引的会话"""
    print(f"\n[4] 切换到会话 #{index}")
    sessions = page.locator('.chat-session-item')
    count = sessions.count()
    
    if index >= count:
        print(f"[4.1] 错误: 会话索引 {index} 超出范围 (总数: {count})")
        return False
    
    sessions.nth(index).click()
    page.wait_for_timeout(2000)
    page.screenshot(path=f"/tmp/mcm_04_session_{index}.png")
    print(f"[4] 切换到会话 #{index} 完成")
    return True


def create_new_session(page):
    """创建新会话"""
    print("\n[5] 创建新会话")
    new_btn = page.locator('.chat-new-btn').first
    new_btn.click()
    page.wait_for_timeout(2000)
    page.screenshot(path="/tmp/mcm_05_new_session.png")
    print("[5] 新会话已创建")
    return True


def print_messages(page, label):
    """打印当前消息内容"""
    msg_data = page.evaluate("""
        () => Array.from(document.querySelectorAll('.msg')).map((m, idx) => ({
            idx: idx,
            role: m.classList.contains('user') ? 'user' : m.classList.contains('agent') ? 'agent' : m.classList.contains('tool') ? 'tool' : 'other',
            content: m.innerText.substring(0, 150).replace(/\\n/g, ' | '),
            classes: m.className
        }))
    """)
    print(f"\n[{label}] 消息数: {len(msg_data)}")
    for m in msg_data:
        print(f"  [{m['idx']+1}] {m['role']}: {m['content']}")
    # Also print cache state
    cache_info = page.evaluate("""
        () => {
            var result = {};
            Object.keys(SESSION_MESSAGES || {}).forEach(function(sid) {
                result[sid.substring(0,8) + '...'] = SESSION_MESSAGES[sid].map(function(m) {
                    return m.role + ':' + (m.content || '').substring(0, 40).replace(/\\n/g, ' ');
                });
            });
            return JSON.stringify(result);
        }
    """)
    print(f"  [缓存] {cache_info}")


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()
        
        console_messages = []
        page.on("console", lambda msg: console_messages.append(f"[{msg.type}] {msg.text[:200]}"))
        
        # 1. 登录
        login(page)
        
        # 2. 进入聊天页面
        if not navigate_to_chat(page):
            print("错误: 无法进入聊天页面")
            return
        
        # 3. 发送第一条消息
        print("\n=== 场景 1: 在当前会话发送消息 ===")
        send_message(page, "你好，请简单介绍一下你自己", wait=5)
        print_messages(page, "发送后")
        page.screenshot(path="/tmp/mcm_06_first_msg.png")

        # 4. 创建第二个会话
        print("\n=== 场景 2: 创建第二个会话并发送消息 ===")
        create_new_session(page)
        send_message(page, "列出你支持哪些云平台", wait=8)
        print_messages(page, "第二个会话")
        page.screenshot(path="/tmp/mcm_07_second_chat.png")
        
        # 5. 切回第一个会话
        print("\n=== 场景 3: 切回第一个会话 ===")
        cache_before = page.evaluate("""
            () => JSON.stringify(Object.keys(SESSION_MESSAGES || {}).map(function(sid) {
                return sid.substring(0,8) + ': ' + SESSION_MESSAGES[sid].map(function(m) {
                    return m.role + '=' + (m.content || '').substring(0, 50).replace(/\\n/g, ' ');
                }).join(' | ');
            }))
        """)
        print(f"  切换前缓存: {cache_before}")
        if switch_to_session(page, 1):
            print_messages(page, "切回第一个会话")
        
        # 6. 切回第二个会话
        print("\n=== 场景 4: 切回第二个会话 ===")
        if switch_to_session(page, 0):
            print_messages(page, "切回第二个会话")
        
        # 7. 关键测试：AI 运行中切换会话
        print("\n=== 场景 5: AI 运行中切换会话 ===")
        # 发送消息但不等待完成
        chat_input = page.locator('#chatInput')
        chat_input.fill("请详细说明每个云平台能做什么")
        page.locator('#chatSendBtn').click()
        page.wait_for_timeout(1500)  # 只等 1.5 秒，让 AI 开始处理
        page.screenshot(path="/tmp/mcm_08_streaming.png")
        
        # 立即切换到第一个会话
        print("\n[6] AI 处理中，切换到第一个会话")
        if switch_to_session(page, 1):
            print_messages(page, "AI 运行中 - 在第一个会话")
            page.wait_for_timeout(2000)
            page.screenshot(path="/tmp/mcm_09_first_session.png")
        
        # 切回第二个会话（此时 AI 可能在运行）
        print("\n[7] 切回第二个会话")
        if switch_to_session(page, 0):
            page.wait_for_timeout(2000)
            print_messages(page, "切回第二个会话 - AI 状态")
            page.screenshot(path="/tmp/mcm_10_back_to_second.png")
        
        # 等待 AI 处理完成
        print("\n[8] 等待 AI 处理完成")
        page.wait_for_timeout(8000)
        print_messages(page, "AI 处理完成后")
        page.screenshot(path="/tmp/mcm_11_after_complete.png")
        
        # 8. 输出关键信息
        print("\n=== 浏览器控制台消息（最近 20 条）===")
        for msg in console_messages[-20:]:
            print(f"  {msg}")
        
        browser.close()
        print("\n=== 测试完成 ===")
        print("截图保存路径:")
        print("  /tmp/mcm_02_chat_page.png - 聊天页面")
        print("  /tmp/mcm_06_first_msg.png - 第一个会话")
        print("  /tmp/mcm_07_second_chat.png - 第二个会话")
        print("  /tmp/mcm_08_streaming.png - AI 正在运行")
        print("  /tmp/mcm_10_back_to_second.png - 切回第二个会话")
        print("  /tmp/mcm_11_after_complete.png - AI 处理完成")


if __name__ == "__main__":
    main()
