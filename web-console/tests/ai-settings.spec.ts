import { test, expect } from '@playwright/test';

test.describe('AI Settings - Provider Test', () => {
  test('NVIDIA provider test shows result', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'Admin123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('**/dashboard');
    await page.goto('/ai-settings');

    await page.waitForSelector('text=NVIDIA NIM', { timeout: 15000 });

    const zapButton = page.locator('button:has(svg.lucide-zap)').first();
    await zapButton.click();

    const resultMsg = page.locator('text=/✓|✗/');
    await expect(resultMsg.first()).toBeVisible({ timeout: 25000 });
  });
});
