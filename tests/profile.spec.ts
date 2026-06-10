import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Profile & Settings', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.click('.nav-item[data-page="profile"]');
    await page.waitForSelector('#page-profile', { timeout: 10000 });
  });

  test('profile page loads with user info', async ({ page }) => {
    await page.waitForTimeout(1500);
    const avatar = page.locator('#page-profile .profile-avatar');
    await expect(avatar).toBeVisible({ timeout: 5000 });
  });

  test('dark mode toggle works', async ({ page }) => {
    await page.waitForTimeout(1000);
    const toggle = page.locator('#darkModeToggle');
    if (await toggle.isVisible()) {
      const wasDark = await page.evaluate(() =>
        document.documentElement.getAttribute('data-theme') === 'dark'
      );
      await toggle.click();
      await page.waitForTimeout(500);
      const isDark = await page.evaluate(() =>
        document.documentElement.getAttribute('data-theme') === 'dark'
      );
      expect(isDark).toBe(!wasDark);
    }
  });

  test('AI config modal opens', async ({ page }) => {
    await page.waitForTimeout(1500);
    // Click AI config button
    const aiBtn = page.locator('button:has-text("AI 配置"), .ai-config-btn');
    if (await aiBtn.isVisible()) {
      await aiBtn.click();
      await page.waitForTimeout(500);
      const modal = page.locator('#aiConfigModal, .modal-overlay.active');
      await expect(modal).toBeVisible({ timeout: 3000 });
    }
  });

  test('language switch button exists', async ({ page }) => {
    await page.waitForTimeout(1500);
    const langBtn = page.locator('#langSwitch, .lang-btn, button:has-text("English"), button:has-text("中文")');
    await expect(langBtn).toBeVisible({ timeout: 3000 });
  });
});
