#!/usr/bin/env python3
"""
详细检查消息内容
"""

from playwright.sync_api import sync_playwright

BASE_URL = "http://localhost:8099"
USERNAME = "admin"
PASSWORD = "Admin123!"


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
        
        # 获取所有会话 ID
        session_data = page.evaluate("""
            () => {
                const sessions = document.querySelectorAll('.chat-session-item');
                return Array.from(sessions).map(s => ({
                    id: s.dataset.sid,
                    title: s.querySelector('.session-title')?.textContent || '',
                    isActive: s.classList.contains('active')
                }));
            }
        """)
        print("=== 已有会话 ===")
        for i, s in enumerate(session_data):
            print(f"  {i}: {s['title']} (id={s['id'][:8]}..., active={s['isActive']})")
        
        # 点击第二个会话
        if len(session_data) > 1:
            page.locator('.chat-session-item').nth(1).click()
            page.wait_for_timeout(2000)
            
            print("\n=== 切到第二个会话后 ===")
            messages = page.evaluate("""
                () => {
                    const msgs = document.querySelectorAll('.msg');
                    return Array.from(msgs).map((m, idx) => ({
                        idx: idx + 1,
                        class: m.className,
                        text: m.innerText.substring(0, 200).replace(/\\n/g, ' | '),
                        innerHTML: m.innerHTML.substring(0, 300)
                    }));
                }
            """)
            print(f"消息数: {len(messages)}")
            for m in messages:
                print(f"  [{m['idx']}] class='{m['class']}'")
                print(f"      text: {m['text']}")
                print()
            
            # 切到第三个会话
            if len(session_data) > 2:
                page.locator('.chat-session-item').nth(2).click()
                page.wait_for_timeout(2000)
                
                # 再切回第二个会话
                page.locator('.chat-session-item').nth(1).click()
                page.wait_for_timeout(2000)
                
                print("\n=== 切走再切回第二个会话后 ===")
                messages2 = page.evaluate("""
                    () => {
                        const msgs = document.querySelectorAll('.msg');
                        return Array.from(msgs).map((m, idx) => ({
                            idx: idx + 1,
                            class: m.className,
                            text: m.innerText.substring(0, 200).replace(/\\n/g, ' | ')
                        }));
                    }
                """)
                print(f"消息数: {len(messages2)}")
                for m in messages2:
                    print(f"  [{m['idx']}] class='{m['class']}'")
                    print(f"      text: {m['text']}")
                    print()
        
        browser.close()


if __name__ == "__main__":
    main()