import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Resources', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.click('.nav-item[data-page="resources"]');
    await page.waitForSelector('#page-resources', { timeout: 10000 });
  });

  test('resources page loads', async ({ page }) => {
    await expect(page.locator('#page-resources')).toBeVisible();
  });

  test('shows resource cards after loading', async ({ page }) => {
    await page.waitForTimeout(3000);
    const cards = page.locator('.resource-card');
    const count = await cards.count();
    // May be 0 if no resources, but page should show something
    const emptyState = page.locator('.empty-state, .no-data, :has-text("暂无")');
    if (count === 0) {
      await expect(emptyState.first()).toBeVisible({ timeout: 3000 });
    } else {
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });

  test('status dots render correctly', async ({ page }) => {
    await page.waitForTimeout(3000);
    const cards = page.locator('.resource-card');
    const count = await cards.count();
    if (count > 0) {
      const dots = page.locator('.status-dot');
      const dotCount = await dots.count();
      expect(dotCount).toBeGreaterThanOrEqual(1);
    }
  });

  test('cloud filter dropdown exists', async ({ page }) => {
    await page.waitForTimeout(1500);
    const filter = page.locator('#resCloudFilter');
    await expect(filter).toBeVisible({ timeout: 3000 });
    const statusFilter = page.locator('#resStatusFilter');
    await expect(statusFilter).toBeVisible({ timeout: 3000 });
  });
});
