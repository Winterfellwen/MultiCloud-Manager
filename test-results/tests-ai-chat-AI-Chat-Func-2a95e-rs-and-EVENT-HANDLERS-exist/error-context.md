# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: tests/ai-chat.spec.ts >> AI Chat Functionality >> tool handlers and EVENT_HANDLERS exist
- Location: tests/ai-chat.spec.ts:66:7

# Error details

```
Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
Call log:
  - navigating to "/", waiting until "load"

```

# Test source

```ts
  1   | import { test, expect } from '@playwright/test';
  2   | 
  3   | async function loginAndNavigateToChat(page: import('@playwright/test').Page) {
> 4   |   await page.goto('/');
      |              ^ Error: page.goto: Protocol error (Page.navigate): Cannot navigate to invalid URL
  5   |   await page.waitForLoadState('networkidle');
  6   | 
  7   |   const loginInput = page.locator('#password');
  8   |   if (await loginInput.isVisible({ timeout: 3000 }).catch(() => false)) {
  9   |     await page.locator('#username').fill('admin');
  10  |     await loginInput.fill('Admin123!');
  11  |     await page.locator('button[type="submit"], .login-btn, .btn-primary').click();
  12  |     await page.waitForLoadState('networkidle');
  13  |     await page.waitForTimeout(2000);
  14  |   }
  15  | 
  16  |   const aiLink = page.locator('text=AI 云助手').or(page.locator('text=AI Assistant'));
  17  |   if (await aiLink.isVisible({ timeout: 3000 }).catch(() => false)) {
  18  |     await aiLink.click();
  19  |     await page.waitForLoadState('networkidle');
  20  |     await page.waitForTimeout(1000);
  21  |   }
  22  | }
  23  | 
  24  | test.describe('AI Chat Functionality', () => {
  25  |   test('getCurrentMessageEl defined in source and on window', async ({ page }) => {
  26  |     await loginAndNavigateToChat(page);
  27  | 
  28  |     const sourceHasFunc = await page.evaluate(async () => {
  29  |       const resp = await fetch('/');
  30  |       const text = await resp.text();
  31  |       return text.includes('function getCurrentMessageEl');
  32  |     });
  33  |     expect(sourceHasFunc).toBeTruthy();
  34  | 
  35  |     const isDefined = await page.evaluate(() => {
  36  |       return typeof (window as any).getCurrentMessageEl === 'function';
  37  |     });
  38  |     expect(isDefined).toBeTruthy();
  39  |   });
  40  | 
  41  |   test('handleTokenEvent renders into .ai-text span', async ({ page }) => {
  42  |     await loginAndNavigateToChat(page);
  43  | 
  44  |     const hasHandleToken = await page.evaluate(() => {
  45  |       return typeof (window as any).handleTokenEvent === 'function';
  46  |     });
  47  |     expect(hasHandleToken).toBeTruthy();
  48  | 
  49  |     const hasEnhanceBlocks = await page.evaluate(() => {
  50  |       return typeof (window as any).enhanceToolBlocks === 'function';
  51  |     });
  52  |     expect(hasEnhanceBlocks).toBeTruthy();
  53  |   });
  54  | 
  55  |   test('streaming cursor removed on state_change done', async ({ page }) => {
  56  |     await loginAndNavigateToChat(page);
  57  | 
  58  |     const noCursorOnDone = await page.evaluate(() => {
  59  |       const fn = (window as any).handleStateChangeEvent;
  60  |       if (!fn) return false;
  61  |       return typeof fn === 'function';
  62  |     });
  63  |     expect(noCursorOnDone).toBeTruthy();
  64  |   });
  65  | 
  66  |   test('tool handlers and EVENT_HANDLERS exist', async ({ page }) => {
  67  |     await loginAndNavigateToChat(page);
  68  | 
  69  |     const debug = await page.evaluate(() => {
  70  |       const w = window as any;
  71  |       return {
  72  |         handleToolStartEvent: typeof w.handleToolStartEvent,
  73  |         handleToolResultEvent: typeof w.handleToolResultEvent,
  74  |         handleToolOutputEvent: typeof w.handleToolOutputEvent,
  75  |         handleTokenEvent: typeof w.handleTokenEvent,
  76  |         EVENT_HANDLERS: typeof w.EVENT_HANDLERS,
  77  |         EVENT_HANDLERS_keys: w.EVENT_HANDLERS ? Object.keys(w.EVENT_HANDLERS) : null,
  78  |       };
  79  |     });
  80  |     console.log('Debug:', JSON.stringify(debug, null, 2));
  81  | 
  82  |     expect(debug.handleToolStartEvent).toBe('function');
  83  |     expect(debug.handleToolResultEvent).toBe('function');
  84  |     expect(debug.handleToolOutputEvent).toBe('function');
  85  |   });
  86  | 
  87  |   test('can send message and observe streaming response', async ({ page }) => {
  88  |     await loginAndNavigateToChat(page);
  89  |     await page.screenshot({ path: 'test-results/chat-page.png', fullPage: true });
  90  | 
  91  |     const chatInput = page.locator('#chatInput, textarea[name="message"], .chat-input textarea');
  92  |     const inputVisible = await chatInput.isVisible({ timeout: 5000 }).catch(() => false);
  93  | 
  94  |     if (!inputVisible) {
  95  |       console.log('Chat input not found - skipping message test');
  96  |       return;
  97  |     }
  98  | 
  99  |     await chatInput.fill('Hello');
  100 | 
  101 |     const sendBtn = page.locator('#chatSendBtn, button:has-text("Send"), .send-btn, button:has-text("发送")');
  102 |     const btnVisible = await sendBtn.isVisible({ timeout: 3000 }).catch(() => false);
  103 |     if (btnVisible) {
  104 |       await sendBtn.click();
```