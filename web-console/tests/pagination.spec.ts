import { test, expect } from '@playwright/test';

test.describe('Table Pagination', () => {
  test('Resources page shows pagination controls', async ({ page }) => {
    await page.goto('/resources');
    await page.waitForSelector('table');
    
    // Check pagination controls exist
    const prevButton = page.locator('button').filter({ hasText: /chevron-left/i });
    const nextButton = page.locator('button').filter({ hasText: /chevron-right/i });
    
    await expect(prevButton).toBeVisible();
    await expect(nextButton).toBeVisible();
    
    // Click next page
    await nextButton.click();
    
    // Verify page indicator updates
    await expect(page.locator('text=/2 \\/ \\d+/')).toBeVisible();
  });
});
