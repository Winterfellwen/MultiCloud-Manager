import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Cloud Accounts', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.click('.nav-item[data-page="accounts"]');
    await page.waitForSelector('#page-accounts', { timeout: 10000 });
  });

  test('accounts page loads', async ({ page }) => {
    await expect(page.locator('#page-accounts')).toBeVisible();
  });

  test('shows account cards after loading', async ({ page }) => {
    await page.waitForTimeout(3000);
    const cards = page.locator('.account-card');
    const count = await cards.count();
    if (count > 0) {
      const text = await cards.first().textContent();
      expect(text?.trim()).toBeTruthy();
    } else {
      const empty = page.locator('.empty-state, .no-data, :has-text("暂无")');
      await expect(empty.first()).toBeVisible({ timeout: 3000 });
    }
  });

  test('can open add account form', async ({ page }) => {
    await page.waitForTimeout(1500);
    const addBtn = page.locator('button:has-text("添加"), button:has-text("新增")');
    if (await addBtn.isVisible()) {
      await addBtn.click();
      await page.waitForTimeout(500);
      const form = page.locator('#accountForm, .account-form');
      await expect(form).toBeVisible({ timeout: 3000 });
    }
  });
});
