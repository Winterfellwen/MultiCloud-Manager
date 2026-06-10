import { test, expect } from '@playwright/test';
import { login } from './helpers';

test.describe('API Endpoints via UI Session', () => {
  test.beforeEach(async ({ page }) => {
    // 用UI登录获取token
    await login(page);
  });

  test('GET /api/teams should return 200 with teams and members', async ({ page }) => {
    const response = await page.evaluate(async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/teams', {
        headers: { Authorization: `Bearer ${token}` }
      });
      return { status: res.status, data: await res.json() };
    });
    
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('teams');
    expect(response.data).toHaveProperty('members');
    expect(Array.isArray(response.data.teams)).toBe(true);
    expect(response.data.teams.length).toBeGreaterThan(0);
  });

  test('GET /api/terraform/templates should return templates', async ({ page }) => {
    const response = await page.evaluate(async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/terraform/templates', {
        headers: { Authorization: `Bearer ${token}` }
      });
      return { status: res.status, data: await res.json() };
    });
    
    expect(response.status).toBe(200);
    expect(response.data).toHaveProperty('templates');
    expect(Array.isArray(response.data.templates)).toBe(true);
    expect(response.data.templates.length).toBeGreaterThan(0);
  });

  test('Team page navigation triggers /api/teams call without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.click('.nav-item[data-page="team"]');
    await page.waitForSelector('#page-team', { timeout: 10000 });
    await page.waitForTimeout(2000);

    // 没有API相关的console错误
    const apiErrors = errors.filter(e => e.includes('/api/') || e.includes('Failed to'));
    expect(apiErrors).toHaveLength(0);
  });

  test('Terraform page navigation triggers /api/terraform/templates without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.click('.nav-item[data-page="terraform"]');
    await page.waitForSelector('#page-terraform', { timeout: 10000 });
    await page.waitForTimeout(2000);

    const apiErrors = errors.filter(e => e.includes('/api/') || e.includes('Failed to'));
    expect(apiErrors).toHaveLength(0);
  });
});