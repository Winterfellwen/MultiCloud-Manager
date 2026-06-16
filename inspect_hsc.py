from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page()
    page.on('console', lambda msg: print(f'[CONSOLE] {msg.text}'))
    
    page.goto('http://localhost:8000/login.html')
    page.fill('input[name="username"]', 'admin')
    page.fill('input[name="password"]', '123456')
    page.click('button[type="submit"]')
    time.sleep(1)
    
    page.goto('http://localhost:8000/')
    page.wait_for_selector('#chatMessages', timeout=10000)
    time.sleep(0.5)
    
    # Print the first 5000 chars of handleStateChangeEvent
    source = page.evaluate("""() => {
        if (typeof handleStateChangeEvent !== 'function') return 'NOT A FUNCTION: ' + typeof handleStateChangeEvent;
        var s = handleStateChangeEvent.toString();
        return s.substring(0, 5000);
    }""")
    
    print("=== handleStateChangeEvent source ===")
    print(source)
    print("=== END ===")
    
    browser.close()
