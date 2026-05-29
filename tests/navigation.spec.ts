import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  const pages = [
    { dataPage: 'dashboard', pageId: 'page-dashboard', name: 'dashboard' },
    { dataPage: 'chat', pageId: 'page-chat', name: 'AI chat' },
    { dataPage: 'accounts', pageId: 'page-accounts', name: 'accounts' },
    { dataPage: 'team', pageId: 'page-team', name: 'team' },
    { dataPage: 'profile', pageId: 'page-profile', name: 'profile' },
  ];

  for (const p of pages) {
    test(`navigates to ${p.name} page`, async ({ page }) => {
      await page.click(`.nav-item[data-page="${p.dataPage}"]`);
      await page.waitForSelector(`#${p.pageId}`, { timeout: 10000 });
      await expect(page.locator(`#${p.pageId}`)).toBeVisible();
    });
  }

  test('sidebar nav items highlight correctly', async ({ page }) => {
    await page.click('.nav-item[data-page="resources"]');
    await page.waitForTimeout(300);
    const activeItem = page.locator('.nav-item.active');
    await expect(activeItem).toBeVisible();
    await expect(activeItem).toHaveAttribute('data-page', 'resources');
  });

  test('mobile bottom tabs visible on small viewport', async ({ page }) => {
    await page.setViewportSize({ width: 480, height: 800 });
    await page.waitForTimeout(300);
    const mobileTabs = page.locator('.mobile-tabs');
    await expect(mobileTabs).toBeVisible();
  });
});
