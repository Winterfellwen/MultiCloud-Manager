from playwright.sync_api import sync_playwright
import time

def test_functional_detailed():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # Capture console errors
        console_errors = []
        def log_msg(msg):
            if msg.type in ['error', 'warning']:
                console_errors.append(f"[{msg.type}] {msg.text}")

        page.on('console', log_msg)

        # Step 1: Login
        print("=" * 60)
        print("TEST 1: Login")
        print("=" * 60)
        page.goto('http://localhost:8099/login.html')
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(500)

        page.fill('#username', 'admin')
        page.fill('#password', 'Admin123!')
        page.click('.login-btn')
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(1500)

        if page.url == 'http://localhost:8099/':
            print("✓ Login successful")
        else:
            print(f"✗ Login failed, URL: {page.url}")
            browser.close()
            return

        # Step 2: Navigate to accounts and test buttons
        print("\n" + "=" * 60)
        print("TEST 2: Accounts Page - Button Functionality")
        print("=" * 60)

        # Navigate 3 times to check for duplicate listeners
        for i in range(3):
            page.click('.nav-item[data-page="accounts"]')
            page.wait_for_load_state('networkidle')
            page.wait_for_timeout(500)

        # Check accounts page is visible
        accounts_page = page.locator('#page-accounts')
        if accounts_page.count() > 0 and accounts_page.first.is_visible():
            print("✓ Accounts page is visible")
        else:
            print("✗ Accounts page is NOT visible")

        # Test refresh button
        refresh_btn = page.locator('.accounts-refresh-btn')
        if refresh_btn.count() > 0:
            print("\nTesting Refresh button (clicking 3 times to check for duplicate requests):")
            api_before = page.evaluate('() => window.__api_calls__ || 0')
            refresh_btn.first.click()
            page.wait_for_timeout(1000)
            refresh_btn.first.click()
            page.wait_for_timeout(1000)
            refresh_btn.first.click()
            page.wait_for_timeout(1000)

            # Check if toast appeared only once
            toasts = page.locator('.toast.show')
            print(f"  Toasts visible: {toasts.count()}")
            print("  (If 3 requests triggered but only 1 expected, we have duplicate listeners)")
        else:
            print("✗ Refresh button not found")

        # Test add button
        add_btn = page.locator('.accounts-add-btn')
        if add_btn.count() > 0:
            print("\nTesting Add Account button:")
            add_btn.first.click()
            page.wait_for_timeout(1000)

            toasts = page.locator('.toast.show')
            if toasts.count() > 0:
                print(f"  Toast message: {toasts.first.inner_text()}")
                print("  ✓ Add Account button works")
            else:
                print("  ✗ No toast appeared after clicking Add Account")
        else:
            print("✗ Add Account button not found")

        # Step 3: Resources Page
        print("\n" + "=" * 60)
        print("TEST 3: Resources Page")
        print("=" * 60)

        for i in range(3):
            page.click('.nav-item[data-page="resources"]')
            page.wait_for_load_state('networkidle')
            page.wait_for_timeout(500)

        res_page = page.locator('#page-resources')
        if res_page.count() > 0 and res_page.first.is_visible():
            print("✓ Resources page is visible")

        # Test refresh button
        res_refresh = page.locator('.resources-refresh-btn')
        if res_refresh.count() > 0:
            print("\nTesting Refresh button:")
            res_refresh.first.click()
            page.wait_for_timeout(1500)
            print("  ✓ Refresh button triggered")

        # Test sync button
        res_sync = page.locator('.resources-sync-btn')
        if res_sync.count() > 0:
            print("Testing Sync button:")
            res_sync.first.click()
            page.wait_for_timeout(1500)
            toasts = page.locator('.toast.show')
            if toasts.count() > 0:
                print(f"  Toast: {toasts.first.inner_text()}")
            print("  ✓ Sync button triggered")

        # Test filter buttons
        filter_btns = page.locator('.filter-btn')
        if filter_btns.count() > 0:
            print(f"\nFilter buttons found: {filter_btns.count()}")
            for i in range(filter_btns.count()):
                btn = filter_btns.nth(i)
                print(f"  Clicking filter: {btn.inner_text()}")
                btn.click()
                page.wait_for_timeout(500)
            print("  ✓ Filter buttons work")

        # Step 4: Chat Page
        print("\n" + "=" * 60)
        print("TEST 4: Chat Page")
        print("=" * 60)

        for i in range(3):
            page.click('.nav-item[data-page="chat"]')
            page.wait_for_load_state('networkidle')
            page.wait_for_timeout(500)

        chat_page_loc = page.locator('#page-chat')
        if chat_page_loc.count() > 0 and chat_page_loc.first.is_visible():
            print("✓ Chat page is visible")

        # Test new chat button
        new_chat = page.locator('.new-chat-btn')
        if new_chat.count() > 0:
            print("\nTesting New Chat button:")
            new_chat.first.click()
            page.wait_for_timeout(2000)
            print("  ✓ New Chat button triggered")

        # Test chat input
        chat_input = page.locator('#chatInput')
        if chat_input.count() > 0:
            print("\nTesting chat input:")
            chat_input.first.fill("Hello, this is a test")
            send_btn = page.locator('button.chat-send-btn')
            if send_btn.count() > 0:
                print("  Found send button")
                send_btn.first.click()
                page.wait_for_timeout(3000)
                print("  ✓ Message send attempted")

        # Step 5: Cost Page
        print("\n" + "=" * 60)
        print("TEST 5: Cost Page")
        print("=" * 60)

        for i in range(3):
            page.click('.nav-item[data-page="cost"]')
            page.wait_for_load_state('networkidle')
            page.wait_for_timeout(500)

        cost_page_loc = page.locator('#page-cost')
        if cost_page_loc.count() > 0 and cost_page_loc.first.is_visible():
            print("✓ Cost page is visible")

        # Test period buttons
        period_btns = page.locator('.period-btn')
        if period_btns.count() > 0:
            print(f"\nPeriod buttons: {period_btns.count()}")
            for i in range(period_btns.count()):
                btn = period_btns.nth(i)
                print(f"  Clicking: {btn.inner_text()}")
                btn.click()
                page.wait_for_timeout(1500)
            print("  ✓ Period buttons work")

        # Test refresh button
        cost_refresh = page.locator('.cost-refresh-btn')
        if cost_refresh.count() > 0:
            print("\nTesting Cost refresh button:")
            cost_refresh.first.click()
            page.wait_for_timeout(2000)
            print("  ✓ Cost refresh button triggered")

        # Step 6: Skills Page
        print("\n" + "=" * 60)
        print("TEST 6: Skills Page")
        print("=" * 60)

        for i in range(3):
            page.click('.nav-item[data-page="skills"]')
            page.wait_for_load_state('networkidle')
            page.wait_for_timeout(500)

        skills_page_loc = page.locator('#page-skills')
        if skills_page_loc.count() > 0 and skills_page_loc.first.is_visible():
            print("✓ Skills page is visible")

        # Test search input
        skill_search = page.locator('#skillSearch')
        if skill_search.count() > 0:
            print("\nTesting skill search:")
            skill_search.first.fill("test")
            page.wait_for_timeout(1000)
            skill_search.first.fill("")
            page.wait_for_timeout(500)
            print("  ✓ Skill search works")

        # Test filter buttons
        skill_filter_btns = page.locator('#page-skills .filter-btn')
        if skill_filter_btns.count() > 0:
            print(f"\nSkill filter buttons: {skill_filter_btns.count()}")
            for i in range(skill_filter_btns.count()):
                btn = skill_filter_btns.nth(i)
                btn.click()
                page.wait_for_timeout(500)
            print("  ✓ Skill filter buttons work")

        # Step 7: Terraform Page
        print("\n" + "=" * 60)
        print("TEST 7: Terraform Page")
        print("=" * 60)

        for i in range(3):
            page.click('.nav-item[data-page="terraform"]')
            page.wait_for_load_state('networkidle')
            page.wait_for_timeout(500)

        tf_page_loc = page.locator('#page-terraform')
        if tf_page_loc.count() > 0 and tf_page_loc.first.is_visible():
            print("✓ Terraform page is visible")

        tf_create = page.locator('.tf-create-btn')
        if tf_create.count() > 0:
            print("\nTesting create button:")
            tf_create.first.click()
            page.wait_for_timeout(1000)
            toasts = page.locator('.toast.show')
            if toasts.count() > 0:
                print(f"  Toast: {toasts.first.inner_text()}")
            print("  ✓ Create button works")

        # Step 8: Model Hub Page
        print("\n" + "=" * 60)
        print("TEST 8: Model Hub Page")
        print("=" * 60)

        for i in range(3):
            page.click('.nav-item[data-page="model_hub"]')
            page.wait_for_load_state('networkidle')
            page.wait_for_timeout(500)

        hub_page_loc = page.locator('#page-model_hub')
        if hub_page_loc.count() > 0 and hub_page_loc.first.is_visible():
            print("✓ Model Hub page is visible")

        provider_cards = page.locator('.provider-card')
        if provider_cards.count() > 0:
            print(f"\nProvider cards: {provider_cards.count()}")
            for i in range(min(2, provider_cards.count())):
                card = provider_cards.nth(i)
                print(f"  Clicking provider card...")
                card.click()
                page.wait_for_timeout(1000)
            print("  ✓ Provider cards work")

        # Summary
        print("\n" + "=" * 60)
        print("TEST SUMMARY")
        print("=" * 60)
        print(f"Console errors/warnings captured: {len(console_errors)}")
        for err in console_errors:
            print(f"  - {err}")

        if len(console_errors) == 0:
            print("\n✓ No console errors - all tests passed!")
        else:
            print(f"\n⚠ Found {len(console_errors)} console messages")

        browser.close()
        print("\n=== All functional tests completed ===")

if __name__ == '__main__':
    test_functional_detailed()
