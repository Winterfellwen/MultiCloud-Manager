import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('i18n', () => {
  test('after login, page shows in Chinese by default', async ({ page }) => {
    await login(page);
    const dashboardTitle = page.locator('#topbarTitle');
    await expect(dashboardTitle).toBeVisible({ timeout: 5000 });
    const text = await dashboardTitle.textContent();
    expect(text).toContain('仪表盘');
  });

  test('lang attribute set correctly', async ({ page }) => {
    await page.goto('/login.html');
    const lang = await page.evaluate(() => document.documentElement.lang);
    expect(lang).toBe('zh-CN');
  });
});
