#!/usr/bin/env python3
"""
详细复现 AI 运行中切换会话导致消息重复的问题
"""

from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:8099"
USERNAME = "admin"
PASSWORD = "Admin123!"


def get_session_messages(page):
    """获取当前会话的所有消息"""
    return page.evaluate("""
        () => {
            const msgs = document.querySelectorAll('#chatMessages > *');
            return Array.from(msgs).map((m, idx) => ({
                idx: idx + 1,
                class: m.className,
                tag: m.tagName,
                id: m.id || '',
                text: m.innerText.substring(0, 200).replace(/\\n/g, ' | '),
                html: m.outerHTML.substring(0, 400)
            }));
        }
    """)


def get_all_session_ids(page):
    """获取所有会话的 ID"""
    return page.evaluate("""
        () => Array.from(document.querySelectorAll('.chat-session-item')).map(s => s.dataset.sid)
    """)


def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 800})
        page = context.new_page()
        
        # 登录
        page.goto(BASE_URL)
        page.wait_for_load_state("networkidle")
        page.locator('input[name="username"], input[type="text"]').first.fill(USERNAME)
        page.locator('input[name="password"], input[type="password"]').first.fill(PASSWORD)
        page.locator('button[type="submit"]').first.click()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)
        
        # 进入聊天
        page.locator('.nav-item[data-page="chat"]').first.click()
        page.wait_for_timeout(2000)
        
        # 创建新会话
        page.locator('.chat-new-btn').first.click()
        page.wait_for_timeout(2000)
        print("=== 创建新会话 ===")
        
        # 发送一个会调用工具的消息
        page.locator('#chatInput').fill("查看一下你支持哪些云平台")
        page.locator('#chatSendBtn').click()
        page.wait_for_timeout(2000)  # AI 开始处理
        
        # 切换到第一个会话
        sessions = page.locator('.chat-session-item')
        count = sessions.count()
        print(f"\n=== 当前会话数: {count} ===")
        
        if count >= 2:
            sessions.nth(1).click()
            page.wait_for_timeout(2000)
            print("\n=== 已切到第一个会话 ===")
            
            # 立即切回新会话（AI 仍在运行）
            sessions.nth(0).click()
            page.wait_for_timeout(1000)
            
            print("\n=== 切回新会话（AI 仍在运行）===")
            msgs = get_session_messages(page)
            print(f"消息容器中的子元素数: {len(msgs)}")
            for m in msgs:
                print(f"  [{m['idx']}] tag={m['tag']} class='{m['class']}' id='{m['id']}'")
                print(f"      text: {m['text']}")
                print()
            
            # 等待 AI 完成
            page.wait_for_timeout(8000)
            
            print("\n=== AI 处理完成后 ===")
            msgs2 = get_session_messages(page)
            print(f"消息容器中的子元素数: {len(msgs2)}")
            for m in msgs2:
                print(f"  [{m['idx']}] tag={m['tag']} class='{m['class']}' id='{m['id']}'")
                print(f"      text: {m['text'][:120]}")
                print()
        
        browser.close()


if __name__ == "__main__":
    main()