from playwright.sync_api import sync_playwright
import time
import json
import subprocess

BASE = 'http://localhost:8099'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(viewport={'width': 1280, 'height': 800})
    page = ctx.new_page()

    # Login first
    r = subprocess.run(['curl', '-s', '-X', 'POST', BASE + '/api/auth/login',
        '-H', 'Content-Type: application/json',
        '-d', '{"username":"admin","password":"Admin123!"}'],
        capture_output=True, text=True)
    token = json.loads(r.stdout)['token']
    
    page.goto(BASE + '/login.html')
    page.wait_for_load_state('networkidle')
    page.evaluate("localStorage.setItem('token', '" + token + "')")
    page.goto(BASE + '/')
    page.wait_for_load_state('networkidle')
    time.sleep(2)
    page.evaluate("showPage('chat')")
    time.sleep(1)

    # Check: print handleStateChangeEvent's source code first 2000 chars
    src = page.evaluate("handleStateChangeEvent.toString()")
    print("=== handleStateChangeEvent source (first 2000) ===")
    print(src[:2000])
    print("=== END ===")
    print(f"\nTotal length: {len(src)}")

    # Now check if the done handler contains our new logic
    has_shouldSave = 'shouldSave' in src
    has_filter = "m._run_id !== runId" in src
    has_final = "streaming !== true" in src
    print(f"\nHas shouldSave: {has_shouldSave}")
    print(f"Has filter m._run_id !== runId: {has_filter}")
    print(f"Has streaming !== true: {has_final}")

    browser.close()

