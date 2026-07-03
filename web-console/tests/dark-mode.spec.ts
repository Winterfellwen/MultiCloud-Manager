import { test, expect } from '@playwright/test';

test.describe('Dark Mode', () => {
  test('toggles dark mode class on html element', async ({ page }) => {
    await page.goto('/');
    
    // Find and click dark mode toggle
    const toggle = page.locator('button').filter({ hasText: /moon|sun|dark|theme/i });
    
    // Check initial state
    const html = page.locator('html');
    
    // Click toggle
    await toggle.click();
    
    // Verify dark class is toggled
    const htmlClass = await html.getAttribute('class');
    expect(htmlClass).toContain('dark');
    
    // Click again to toggle back
    await toggle.click();
    const htmlClassAfter = await html.getAttribute('class');
    expect(htmlClassAfter).not.toContain('dark');
  });
});
