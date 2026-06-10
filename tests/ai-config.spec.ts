import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('AI Config', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.click('.nav-item[data-page="chat"]');
    await page.waitForSelector('#page-chat', { timeout: 10000 });
  });

  test('AI config modal opens from chat settings button', async ({ page }) => {
    await page.waitForTimeout(1000);
    const settingsBtn = page.locator('.chat-settings-btn');
    await expect(settingsBtn).toBeVisible({ timeout: 5000 });
    await settingsBtn.click();
    await page.waitForTimeout(500);
    const modal = page.locator('#aiConfigModal');
    await expect(modal).toBeVisible({ timeout: 3000 });
    await expect(modal.locator('#aiApiEndpoint')).toBeVisible();
  });

  test('AI config test button works in modal', async ({ page }) => {
    await page.waitForTimeout(1000);
    await page.locator('.chat-settings-btn').click();
    await page.waitForTimeout(500);
    // The test button has onclick="testAIConfig()" - i18n key config.test may show literally
    const testBtn = page.locator('#aiConfigModal button[onclick="testAIConfig()"]');
    await expect(testBtn).toBeVisible({ timeout: 3000 });
    await testBtn.click();
    await page.waitForTimeout(3000);
    const result = page.locator('#aiTestResult');
    await expect(result).toBeVisible({ timeout: 5000 });
    const text = await result.textContent();
    expect(text?.trim()).toBeTruthy();
  });

  test('AI config can be saved', async ({ page }) => {
    // Handle browser alert dialog
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });
    await page.waitForTimeout(1000);
    await page.locator('.chat-settings-btn').click();
    await page.waitForTimeout(500);
    const saveBtn = page.locator('#aiConfigModal button:has-text("保存")');
    await expect(saveBtn).toBeVisible({ timeout: 3000 });
    await saveBtn.click();
    await page.waitForTimeout(1500);
    const modal = page.locator('#aiConfigModal');
    await expect(modal).not.toBeVisible({ timeout: 3000 });
  });

  test('AI config modal can be cancelled', async ({ page }) => {
    await page.waitForTimeout(1000);
    await page.locator('.chat-settings-btn').click();
    await page.waitForTimeout(500);
    const cancelBtn = page.locator('#aiConfigModal button:has-text("取消")');
    await expect(cancelBtn).toBeVisible({ timeout: 3000 });
    await cancelBtn.click();
    await page.waitForTimeout(500);
    const modal = page.locator('#aiConfigModal');
    await expect(modal).not.toBeVisible({ timeout: 3000 });
  });
});
