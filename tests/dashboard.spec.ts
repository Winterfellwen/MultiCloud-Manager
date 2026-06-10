import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.waitForSelector('#page-dashboard', { timeout: 10000 });
  });

  test('shows stat cards', async ({ page }) => {
    await page.waitForTimeout(2000);
    const cards = page.locator('.stat-card');
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });

  test('navigates to resources from quick card', async ({ page }) => {
    await page.waitForTimeout(1500);
    const quickCard = page.locator('.quick-card').first();
    await expect(quickCard).toBeVisible({ timeout: 5000 });
    await quickCard.click();
    await page.waitForSelector('#page-resources', { timeout: 10000 });
    await expect(page.locator('#page-resources')).toBeVisible();
  });

  test('dashboard title shows correctly', async ({ page }) => {
    await page.waitForTimeout(1000);
    const title = page.locator('#topbarTitle');
    await expect(title).toBeVisible();
    const text = await title.textContent();
    expect(text?.trim()).toBeTruthy();
  });
});
