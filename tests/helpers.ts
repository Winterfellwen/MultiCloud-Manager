import { Page, expect } from '@playwright/test';

export const TEST_USER = process.env.TEST_USER || 'admin';
export const TEST_PASS = process.env.TEST_PASS || 'test123';

export async function login(page: Page, url?: string) {
  await page.goto(url || '/login.html');
  await page.waitForSelector('#username', { timeout: 15000 });
  await page.fill('#username', TEST_USER);
  await page.fill('#password', TEST_PASS);
  await page.click('button:has-text("登 录")');
  await page.waitForURL(/\/(index\.html)?$/, { timeout: 20000 });
  await page.waitForSelector('#page-dashboard', { timeout: 15000 });
}

export async function navigate(page: Page, pageName: string) {
  await page.click(`.nav-item[data-page="${pageName}"]`);
  await page.waitForSelector(`#page-${pageName}`, { timeout: 10000 });
}

export async function waitForPageReady(page: Page, pageName: string) {
  await page.waitForSelector(`#page-${pageName}`, { timeout: 10000 });
  await page.waitForTimeout(500);
}

export async function assertVisible(page: Page, selector: string) {
  await expect(page.locator(selector)).toBeVisible({ timeout: 5000 });
}
