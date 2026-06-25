#!/usr/bin/env python3
"""
复现：AI 运行中切换会话，AI 完成后再切回导致消息重复
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
                text: m.innerText.substring(0, 300).replace(/\\n/g, ' | ')
            }));
        }
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
        
        # 发送一个会调用多个工具的消息
        page.locator('#chatInput').fill("请详细说明每个云平台能做什么")
        page.locator('#chatSendBtn').click()
        page.wait_for_timeout(1500)  # AI 开始处理
        
        # 切到第一个会话
        sessions = page.locator('.chat-session-item')
        count = sessions.count()
        print(f"\n=== 当前会话数: {count} ===")
        
        if count >= 2:
            sessions.nth(1).click()
            page.wait_for_timeout(3000)  # 让 AI 在后台完成处理
            
            print("\n=== 切到第一个会话，AI 已在后台完成 ===")
            msgs1 = get_session_messages(page)
            print(f"第一个会话消息数: {len(msgs1)}")
            for m in msgs1[:5]:
                print(f"  [{m['idx']}] class='{m['class']}': {m['text'][:120]}")
            
            # 切回新会话（AI 已经完成）
            sessions.nth(0).click()
            page.wait_for_timeout(2000)
            
            print("\n=== 切回新会话（AI 已完成）===")
            msgs2 = get_session_messages(page)
            print(f"消息容器中的子元素数: {len(msgs2)}")
            for m in msgs2:
                print(f"  [{m['idx']}] tag={m['tag']} class='{m['class']}' id='{m['id']}'")
                print(f"      text: {m['text'][:200]}")
                print()
        
        browser.close()


if __name__ == "__main__":
    main()