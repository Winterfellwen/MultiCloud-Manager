import { test } from '@playwright/test';
import { login } from './helpers';

test('debug: capture console errors across all pages', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') {
      errors.push(`[CONSOLE ERROR] ${msg.text()}`);
    }
  });
  page.on('pageerror', err => {
    errors.push(`[PAGE ERROR] ${err.message}`);
  });

  await login(page);
  await page.waitForTimeout(500);

  const pages = [
    { name: 'dashboard', selector: '.nav-item[data-page="dashboard"]' },
    { name: 'resources', selector: '.nav-item[data-page="resources"]' },
    { name: 'accounts', selector: '.nav-item[data-page="accounts"]' },
    { name: 'chat', selector: '.nav-item[data-page="chat"]' },
    { name: 'team', selector: '.nav-item[data-page="team"]' },
    { name: 'profile', selector: '.nav-item[data-page="profile"]' },
  ];

  for (const p of pages) {
    if (p.selector) {
      try {
        await page.click(p.selector);
        await page.waitForTimeout(2000);
      } catch (e: any) {
        errors.push(`[NAV ERROR: ${p.name}] ${e.message}`);
      }
    }
  }

  if (errors.length > 0) {
    console.log('\n=== ERRORS FOUND ===');
    errors.forEach(e => console.log(e));
    console.log(`Total errors: ${errors.length}`);
  } else {
    console.log('\nNo errors found across all pages');
  }
});
