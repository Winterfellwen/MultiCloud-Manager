#!/usr/bin/env python3
"""
调试：检查页面元素
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
        
        page.on("console", lambda msg: print(f"  [console.{msg.type}] {msg.text[:200]}"))
        
        print("=" * 60)
        print("[1] 打开登录页")
        page.goto(BASE_URL)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)
        
        # 检查登录表单
        login_form = page.locator('form')
        print(f"[2] 登录表单数量: {login_form.count()}")
        
        if login_form.count() > 0:
            print("[3] 填写登录表单")
            page.locator('input[type="text"], input[name="username"]').first.fill(USERNAME)
            page.locator('input[type="password"], input[name="password"]').first.fill(PASSWORD)
            page.locator('button[type="submit"]').first.click()
            page.wait_for_load_state("networkidle")
            page.wait_for_timeout(2000)
        
        page.screenshot(path="/tmp/mcm_debug_01.png", full_page=True)
        print("[4] 登录后截图")
        
        # 获取所有可交互元素
        print("\n=== 关键元素检查 ===")
        for selector in [
            '#chatInput', '#chatMessages', '#chatSendBtn',
            '.chat-input', '.chat-container', '.chat-sidebar',
            'textarea', '[contenteditable]',
            '.chat-session-item', '.msg', '.chat-new-btn'
        ]:
            count = page.locator(selector).count()
            print(f"  {selector}: {count}")
        
        # 获取页面文本
        body_text = page.locator('body').inner_text()[:500]
        print(f"\n[5] 页面文本片段: {body_text}")
        
        # 获取 localStorage 中的 token
        token = page.evaluate("() => localStorage.getItem('token')")
        user_info = page.evaluate("() => localStorage.getItem('userInfo')")
        print(f"\n[6] localStorage token: {token[:50] if token else 'None'}...")
        print(f"[7] localStorage userInfo: {user_info}")
        
        browser.close()


if __name__ == "__main__":
    main()