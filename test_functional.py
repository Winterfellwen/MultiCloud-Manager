from playwright.sync_api import sync_playwright
import time

def test_functional():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()
        
        # Capture all console messages
        console_messages = []
        page.on('console', lambda msg: console_messages.append(f"[{msg.type}] {msg.text}"))
        
        # Capture network errors
        network_errors = []
        page.on('requestfailed', lambda req: network_errors.append(f"Failed: {req.url} - {req.failure}"))
        
        # Login
        page.goto('http://localhost:8099/login.html')
        page.wait_for_load_state('networkidle')
        
        page.fill('#username', 'admin')
        page.fill('#password', 'Admin123!')
        page.click('.login-btn')
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(1500)
        
        # Check login status
        token = page.evaluate('() => localStorage.getItem("token")')
        print(f"Token exists: {bool(token)}")
        
        # === Test 1: Accounts Page ===
        print("\n=== Test 1: Accounts Page Functionality ===")
        page.click('.nav-item[data-page="accounts"]')
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(1000)
        
        # Check if accounts list is loaded
        table_body = page.locator('.accounts-table tbody')
        if table_body.count() > 0:
            rows = table_body.locator('tr').count()
            print(f"  Table rows found: {rows}")
        else:
            print("  Table body not found!")
        
        # Test Refresh button
        print("\n  Testing Refresh button:")
        refresh_btn = page.locator('.accounts-refresh-btn')
        if refresh_btn.count() > 0:
            # Capture API response
            api_calls = []
            page.on('request', lambda req: api_calls.append(f"REQ: {req.method} {req.url}"))
            page.on('response', lambda resp: api_calls.append(f"RES: {resp.status} {resp.url}"))
            
            refresh_btn.first.click()
            page.wait_for_timeout(1500)
            
            # Check for /accounts API call
            account_calls = [c for c in api_calls if '/accounts' in c]
            print(f"    API calls: {len(account_calls)}")
            for c in account_calls:
                print(f"    - {c}")
            
            # Check for error messages
            toast_err = page.locator('.toast.toast-error.show')
            if toast_err.count() > 0:
                print(f"    Error toast: {toast_err.first.inner_text()}")
        else:
            print("    Refresh button not found!")
        
        # Test Add button
        print("\n  Testing Add button:")
        add_btn = page.locator('.accounts-add-btn')
        if add_btn.count() > 0:
            api_calls = []
            page.on('request', lambda req: api_calls.append(f"REQ: {req.method} {req.url}"))
            page.on('response', lambda resp: api_calls.append(f"RES: {resp.status} {resp.url}"))
            
            add_btn.first.click()
            page.wait_for_timeout(1000)
            
            toast = page.locator('.toast.show')
            if toast.count() > 0:
                print(f"    Toast message: {toast.first.inner_text()}")
            else:
                print("    No toast visible!")
        else:
            print("    Add button not found!")
        
        # Check console messages
        acc_errors = [m for m in console_messages if 'error' in m.lower() or 'Error' in m or 'ERR' in m]
        if acc_errors:
            print(f"\n  Console errors in accounts: {len(acc_errors)}")
            for e in acc_errors:
                print(f"    - {e}")
        console_messages.clear()
        
        # === Test 2: Resources Page ===
        print("\n=== Test 2: Resources Page Functionality ===")
        page.click('.nav-item[data-page="resources"]')
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(1500)
        
        # Check resource buttons
        res_refresh = page.locator('.resources-refresh-btn')
        res_sync = page.locator('.resources-sync-btn')
        
        print(f"  Refresh button: {'Found' if res_refresh.count() > 0 else 'NOT FOUND'}")
        print(f"  Sync button: {'Found' if res_sync.count() > 0 else 'NOT FOUND'}")
        
        if res_refresh.count() > 0:
            api_calls = []
            page.on('request', lambda req: api_calls.append(f"REQ: {req.method} {req.url}"))
            page.on('response', lambda resp: api_calls.append(f"RES: {resp.status} {resp.url}"))
            
            res_refresh.first.click()
            page.wait_for_timeout(1500)
            
            res_calls = [c for c in api_calls if '/resources' in c]
            print(f"  API calls after refresh: {len(res_calls)}")
            for c in res_calls:
                print(f"    - {c}")
        
        # Check for filter buttons
        filter_btns = page.locator('.filter-btn')
        if filter_btns.count() > 0:
            print(f"  Filter buttons: {filter_btns.count()}")
            # Test clicking a filter
            first_filter = filter_btns.nth(1) if filter_btns.count() > 1 else filter_btns.first
            first_filter.click()
            page.wait_for_timeout(500)
            active_filter = page.locator('.filter-btn.active')
            print(f"  Active filter after click: {active_filter.count()}")
        
        # Check console errors
        res_errors = [m for m in console_messages if 'error' in m.lower() or 'Error' in m or 'ERR' in m]
        if res_errors:
            print(f"\n  Console errors in resources: {len(res_errors)}")
            for e in res_errors:
                print(f"    - {e}")
        console_messages.clear()
        
        # === Test 3: Chat Page ===
        print("\n=== Test 3: Chat Page Functionality ===")
        page.click('.nav-item[data-page="chat"]')
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(1500)
        
        new_chat_btn = page.locator('.new-chat-btn')
        if new_chat_btn.count() > 0:
            print("  Testing New Chat button:")
            api_calls = []
            page.on('request', lambda req: api_calls.append(f"REQ: {req.method} {req.url}"))
            page.on('response', lambda resp: api_calls.append(f"RES: {resp.status} {resp.url}"))
            
            new_chat_btn.first.click()
            page.wait_for_timeout(1500)
            
            session_calls = [c for c in api_calls if '/sessions' in c]
            print(f"    API calls: {len(session_calls)}")
            for c in session_calls:
                print(f"    - {c}")
        else:
            print("  New Chat button not found!")
        
        # Test chat input
        chat_input = page.locator('#chatInput')
        if chat_input.count() > 0:
            print("  Testing chat input:")
            chat_input.first.fill('test message')
            send_btn = page.locator('button:has(svg use[href*="send"])')
            if send_btn.count() > 0:
                print("    Send button found")
            else:
                send_btn = page.locator('button').filter(has=page.locator('svg'))
                print(f"    Generic send buttons found: {send_btn.count()}")
        else:
            print("  Chat input not found!")
        
        # Check console errors
        chat_errors = [m for m in console_messages if 'error' in m.lower() or 'Error' in m or 'ERR' in m]
        if chat_errors:
            print(f"\n  Console errors in chat: {len(chat_errors)}")
            for e in chat_errors:
                print(f"    - {e}")
        console_messages.clear()
        
        # === Test 4: Cost Page ===
        print("\n=== Test 4: Cost Page Functionality ===")
        page.click('.nav-item[data-page="cost"]')
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(2000)
        
        period_btns = page.locator('.period-btn')
        if period_btns.count() > 0:
            print(f"  Period buttons: {period_btns.count()}")
            # Test period button click
            api_calls = []
            page.on('request', lambda req: api_calls.append(f"REQ: {req.method} {req.url}"))
            page.on('response', lambda resp: api_calls.append(f"RES: {resp.status} {resp.url}"))
            
            if period_btns.count() > 1:
                period_btns.nth(1).click()
            else:
                period_btns.first.click()
            page.wait_for_timeout(1500)
            
            cost_calls = [c for c in api_calls if '/cost' in c]
            print(f"  API calls after period change: {len(cost_calls)}")
            for c in cost_calls:
                print(f"    - {c}")
        
        cost_refresh = page.locator('.cost-refresh-btn')
        if cost_refresh.count() > 0:
            print("  Testing cost refresh button")
            cost_refresh.first.click()
            page.wait_for_timeout(1500)
        
        # Check console errors
        cost_errors = [m for m in console_messages if 'error' in m.lower() or 'Error' in m or 'ERR' in m]
        if cost_errors:
            print(f"\n  Console errors in cost: {len(cost_errors)}")
            for e in cost_errors:
                print(f"    - {e}")
        console_messages.clear()
        
        # === Test 5: Skills Page ===
        print("\n=== Test 5: Skills Page Functionality ===")
        page.click('.nav-item[data-page="skills"]')
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(1500)
        
        skill_cards = page.locator('.skill-card')
        print(f"  Skill cards: {skill_cards.count()}")
        
        if skill_cards.count() > 0:
            # Test toggle button
            toggle_btn = page.locator('.skill-toggle').first
            if toggle_btn.count() > 0:
                print("  Testing skill toggle button")
                toggle_btn.click()
                page.wait_for_timeout(1500)
                
                toast = page.locator('.toast.show')
                if toast.count() > 0:
                    print(f"    Toast: {toast.first.inner_text()}")
                else:
                    print("    No toast after toggle")
        
        # Check console errors
        skills_errors = [m for m in console_messages if 'error' in m.lower() or 'Error' in m or 'ERR' in m]
        if skills_errors:
            print(f"\n  Console errors in skills: {len(skills_errors)}")
            for e in skills_errors:
                print(f"    - {e}")
        console_messages.clear()
        
        # === Test 6: Terraform Page ===
        print("\n=== Test 6: Terraform Page Functionality ===")
        page.click('.nav-item[data-page="terraform"]')
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(1500)
        
        tf_create = page.locator('.tf-create-btn')
        if tf_create.count() > 0:
            print("  Testing Terraform create button")
            tf_create.first.click()
            page.wait_for_timeout(1000)
            
            toast = page.locator('.toast.show')
            if toast.count() > 0:
                print(f"    Toast: {toast.first.inner_text()}")
            else:
                print("    No toast visible")
        
        # Check for template cards
        tf_cards = page.locator('.tf-template-card')
        print(f"  Template cards: {tf_cards.count()}")
        
        # Check console errors
        tf_errors = [m for m in console_messages if 'error' in m.lower() or 'Error' in m or 'ERR' in m]
        if tf_errors:
            print(f"\n  Console errors in terraform: {len(tf_errors)}")
            for e in tf_errors:
                print(f"    - {e}")
        console_messages.clear()
        
        # === Test 7: Model Hub Page ===
        print("\n=== Test 7: Model Hub Page Functionality ===")
        page.click('.nav-item[data-page="model_hub"]')
        page.wait_for_load_state('networkidle')
        page.wait_for_timeout(1500)
        
        provider_cards = page.locator('.provider-card')
        print(f"  Provider cards: {provider_cards.count()}")
        
        if provider_cards.count() > 0:
            select_btn = page.locator('.provider-select-btn').first
            if select_btn.count() > 0:
                print("  Testing provider select button")
                select_btn.click()
                page.wait_for_timeout(1500)
                
                config_panel = page.locator('.config-panel')
                print(f"  Config panel visible: {config_panel.count() > 0 and config_panel.first.is_visible()}")
        
        # Check console errors
        hub_errors = [m for m in console_messages if 'error' in m.lower() or 'Error' in m or 'ERR' in m]
        if hub_errors:
            print(f"\n  Console errors in model_hub: {len(hub_errors)}")
            for e in hub_errors:
                print(f"    - {e}")
        console_messages.clear()
        
        # === Summary ===
        print("\n=== Final Console Error Summary ===")
        all_errors = [m for m in console_messages if 'error' in m.lower() or 'Error' in m or 'ERR' in m]
        print(f"Total console errors: {len(all_errors)}")
        for e in all_errors:
            print(f"  - {e}")
        
        print(f"\nTotal network errors: {len(network_errors)}")
        for ne in network_errors:
            print(f"  - {ne}")
        
        browser.close()
        print("\n=== All functional tests completed ===")

if __name__ == '__main__':
    test_functional()
