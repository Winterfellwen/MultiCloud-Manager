from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.goto('http://localhost:8099')
    page.wait_for_load_state('networkidle')
    page.screenshot(path='/tmp/mcm_main.png', full_page=True)
    print('Screenshot saved to /tmp/mcm_main.png')
    
    # Get page content for analysis
    content = page.content()
    print('Page loaded successfully')
    
    browser.close()