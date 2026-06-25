from playwright.sync_api import sync_playwright
import time

def test_all_pages():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        context = browser.new_context()
        page = context.new_page()
        
        page.goto('http://localhost:8099/login.html')
        page.wait_for_timeout(1000)
        
        print("=== Testing Login Page ===")
        page.fill('#username', 'admin')
        page.fill('#password', 'Admin123!')
        page.click('.login-btn')
        page.wait_for_timeout(2000)
        
        if page.url == 'http://localhost:8099/login.html':
            print("Login failed!")
            return
        
        print("Login successful!")
        page.wait_for_timeout(1000)
        
        pages_to_test = [
            ('dashboard', 'Dashboard'),
            ('accounts', 'Cloud Accounts'),
            ('resources', 'Cloud Resources'),
            ('sync', 'Sync Status'),
            ('cost', 'Cost Analysis'),
            ('terminal', 'Terminal'),
            ('chat', 'AI Chat'),
            ('skills', 'Skill Marketplace'),
            ('terraform', 'Terraform Templates'),
            ('model_hub', 'AI Model Hub'),
            ('profile', 'Profile'),
        ]
        
        for page_id, expected_title in pages_to_test:
            print(f"\n=== Testing {page_id} ===")
            nav_item = page.locator(f'.nav-item[data-page="{page_id}"]')
            if nav_item.count() > 0:
                nav_item.first.click()
                page.wait_for_timeout(500)
                
                current_page = page.locator(f'#page-{page_id}')
                if current_page.count() > 0 and current_page.first.is_visible():
                    print(f"✓ {page_id} page visible")
                else:
                    print(f"✗ {page_id} page not visible")
            else:
                print(f"✗ {page_id} nav item not found")
        
        print("\n=== Testing Accounts Page Buttons ===")
        page.locator('.nav-item[data-page="accounts"]').first.click()
        page.wait_for_timeout(500)
        
        refresh_btn = page.locator('.accounts-refresh-btn')
        if refresh_btn.count() > 0:
            refresh_btn.first.click()
            print("✓ Refresh button clicked")
        
        add_btn = page.locator('.accounts-add-btn')
        if add_btn.count() > 0:
            add_btn.first.click()
            print("✓ Add Account button clicked")
        
        print("\n=== Testing Dashboard Quick Actions ===")
        page.locator('.nav-item[data-page="dashboard"]').first.click()
        page.wait_for_timeout(500)
        
        quick_cards = page.locator('.quick-card')
        if quick_cards.count() > 0:
            print(f"✓ {quick_cards.count()} quick action cards found")
            for card in quick_cards.all():
                action = card.get_attribute('data-action')
                if action:
                    print(f"  - {action}")
        
        print("\n=== Testing Chat Page ===")
        page.locator('.nav-item[data-page="chat"]').first.click()
        page.wait_for_timeout(1000)
        
        new_chat_btn = page.locator('.new-chat-btn')
        if new_chat_btn.count() > 0:
            print("✓ New Chat button found")
        
        chat_input = page.locator('#chatInput')
        if chat_input.count() > 0:
            print("✓ Chat input found")
        
        print("\n=== Testing Resources Page ===")
        page.locator('.nav-item[data-page="resources"]').first.click()
        page.wait_for_timeout(1000)
        
        refresh_btn = page.locator('.resources-refresh-btn')
        if refresh_btn.count() > 0:
            print("✓ Resources refresh button found")
        
        filter_btns = page.locator('.filter-btn')
        if filter_btns.count() > 0:
            print(f"✓ {filter_btns.count()} filter buttons found")
        
        print("\n=== Testing Cost Page ===")
        page.locator('.nav-item[data-page="cost"]').first.click()
        page.wait_for_timeout(1000)
        
        period_btns = page.locator('.period-btn')
        if period_btns.count() > 0:
            print(f"✓ {period_btns.count()} period buttons found")
        
        refresh_btn = page.locator('.cost-refresh-btn')
        if refresh_btn.count() > 0:
            print("✓ Cost refresh button found")
        
        print("\n=== Testing Skills Page ===")
        page.locator('.nav-item[data-page="skills"]').first.click()
        page.wait_for_timeout(1000)
        
        search_input = page.locator('#skillSearch')
        if search_input.count() > 0:
            print("✓ Skills search input found")
        
        filter_btns = page.locator('.filter-btn')
        if filter_btns.count() > 0:
            print(f"✓ {filter_btns.count()} skill filter buttons found")
        
        print("\n=== Testing Terraform Page ===")
        page.locator('.nav-item[data-page="terraform"]').first.click()
        page.wait_for_timeout(1000)
        
        create_btn = page.locator('.tf-create-btn')
        if create_btn.count() > 0:
            print("✓ Terraform create button found")
        
        print("\n=== Testing Model Hub Page ===")
        page.locator('.nav-item[data-page="model_hub"]').first.click()
        page.wait_for_timeout(1000)
        
        providers_grid = page.locator('#providersGrid')
        if providers_grid.count() > 0:
            print("✓ Model Hub providers grid found")
        
        print("\n=== All tests completed ===")
        
        page.wait_for_timeout(3000)
        browser.close()

if __name__ == '__main__':
    test_all_pages()