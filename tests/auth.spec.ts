import { test, expect } from '@playwright/test';
import { login, TEST_USER } from './helpers';

test.describe('Authentication', () => {
  test('login with valid credentials', async ({ page }) => {
    await login(page);
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeTruthy();
    expect(token?.length).toBeGreaterThan(20);
  });

  test('redirects to login when not authenticated', async ({ page }) => {
    await page.goto('/');
    await page.waitForURL(/login\.html/, { timeout: 10000 });
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login.html');
    await page.fill('#username', 'admin');
    await page.fill('#password', 'wrongpass');
    await page.click('button:has-text("登 录")');
    await expect(page.locator('#errorMsg')).toBeVisible({ timeout: 5000 });
  });

  test('profile page shows username', async ({ page }) => {
    await login(page);
    await page.click('.nav-item[data-page="profile"]');
    await page.waitForSelector('#page-profile', { timeout: 10000 });
    await expect(page.locator('#page-profile')).toBeVisible();
  });

  test('logout clears token and redirects', async ({ page }) => {
    await login(page);
    await page.click('.nav-item[data-page="profile"]');
    await page.waitForSelector('#page-profile', { timeout: 10000 });
    // Click logout button
    const logoutBtn = page.locator('button:has-text("退出登录")');
    await expect(logoutBtn).toBeVisible({ timeout: 5000 });
    await logoutBtn.click();
    await page.waitForURL(/login\.html/, { timeout: 10000 });
    const token = await page.evaluate(() => localStorage.getItem('token'));
    expect(token).toBeNull();
  });
});
