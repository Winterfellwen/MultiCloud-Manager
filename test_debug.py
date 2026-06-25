from playwright.sync_api import sync_playwright
import json

def test_app():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        
        # Capture console errors
        errors = []
        def log_error(msg):
            if msg.type == 'error':
                errors.append(f"Console error: {msg.text}")
        
        page.on('console', log_error)
        
        # Test 1: Navigate to login page
        print("=== Test 1: Login Page ===")
        page.goto('http://localhost:8099/login.html')
        page.wait_for_load_state('networkidle')
        page.screenshot(path='/tmp/login_page.png')
        
        username_input = page.locator('#username')
        password_input = page.locator('#password')
        login_btn = page.locator('.login-btn')
        
        print(f"  Username input found: {username_input.count() > 0}")
        print(f"  Password input found: {password_input.count() > 0}")
        print(f"  Login button found: {login_btn.count() > 0}")
        
        # Test 2: Login
        print("\n=== Test 2: Login ===")
        username_input.fill('admin')
        password_input.fill('Admin123!')
        login_btn.click()
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(1000)
        page.screenshot(path='/tmp/after_login.png')
        
        print(f"  Current URL: {page.url}")
        print(f"  Login successful: {page.url != 'http://localhost:8099/login.html'}")
        
        if page.url == 'http://localhost:8099/login.html':
            error_msg = page.locator('#errorMsg')
            if error_msg.count() > 0:
                print(f"  Error message: {error_msg.inner_text()}")
            browser.close()
            return
        
        # Test 3: Check sidebar navigation
        print("\n=== Test 3: Sidebar Navigation ===")
        nav_items = page.locator('.nav-item')
        print(f"  Navigation items found: {nav_items.count()}")
        
        # Test 4: Click on accounts
        print("\n=== Test 4: Navigate to Accounts ===")
        accounts_nav = page.locator('.nav-item[data-page="accounts"]')
        if accounts_nav.count() > 0:
            accounts_nav.first.click()
            page.wait_for_load_state('networkidle')
            page.wait_for_timeout(500)
            page.screenshot(path='/tmp/accounts_page.png')
            
            # Check if accounts page is active
            accounts_page = page.locator('#page-accounts')
            print(f"  Accounts page exists: {accounts_page.count() > 0}")
            print(f"  Accounts page is visible: {accounts_page.first.is_visible()}")
            
            # Check buttons
            refresh_btn = page.locator('.accounts-refresh-btn')
            add_btn = page.locator('.accounts-add-btn')
            print(f"  Refresh button found: {refresh_btn.count() > 0}")
            print(f"  Add Account button found: {add_btn.count() > 0}")
            
            # Click add button and check for toast
            if add_btn.count() > 0:
                add_btn.first.click()
                page.wait_for_timeout(500)
                toast = page.locator('.toast.show')
                print(f"  Toast visible after click: {toast.count() > 0}")
                if toast.count() > 0:
                    print(f"  Toast message: {toast.first.inner_text()}")
        
        # Test 5: Check console errors
        print("\n=== Test 5: Console Errors ===")
        if errors:
            for error in errors[:5]:
                print(f"  {error}")
        else:
            print("  No console errors")
        
        # Test 6: Check page structure
        print("\n=== Test 6: Page Structure ===")
        app_div = page.locator('#app')
        sidebar = page.locator('.sidebar')
        content = page.locator('.content')
        pages = page.locator('.page')
        
        print(f"  #app exists: {app_div.count() > 0}")
        print(f"  .sidebar exists: {sidebar.count() > 0}")
        print(f"  .content exists: {content.count() > 0}")
        print(f"  .page elements: {pages.count()}")
        
        # Test 7: Test other pages
        print("\n=== Test 7: Other Pages ===")
        test_pages = ['dashboard', 'resources', 'cost', 'chat', 'skills', 'terraform', 'model_hub']
        
        for page_id in test_pages:
            nav_item = page.locator(f'.nav-item[data-page="{page_id}"]')
            if nav_item.count() > 0:
                nav_item.first.click()
                page.wait_for_load_state('networkidle')
                page.wait_for_timeout(300)
                
                target_page = page.locator(f'#page-{page_id}')
                is_active = target_page.first.is_visible() if target_page.count() > 0 else False
                print(f"  {page_id}: {'✓' if is_active else '✗'}")
        
        # Cleanup
        browser.close()
        
        # Print summary
        print("\n=== Test Summary ===")
        print("All tests completed. Check screenshots in /tmp/")

if __name__ == '__main__':
    test_app()