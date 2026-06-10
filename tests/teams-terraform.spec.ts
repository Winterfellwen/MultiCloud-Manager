import { test, expect } from '@playwright/test';
import { login, navigate } from './helpers';

test.describe('Teams API', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('GET /api/teams returns team data', async ({ page }) => {
    const response = await page.evaluate(async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/teams', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      return res.json();
    });

    expect(response).toHaveProperty('teams');
    expect(response).toHaveProperty('members');
    expect(response.teams).toBeInstanceOf(Array);
    expect(response.members).toBeInstanceOf(Array);
    expect(response.teams.length).toBeGreaterThan(0);
    expect(response.members.length).toBeGreaterThan(0);
  });

  test('Team page loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await navigate(page, 'team');
    await page.waitForTimeout(2000);

    // Check that no API errors occurred
    const apiErrors = errors.filter(e => e.includes('/api/'));
    expect(apiErrors).toHaveLength(0);
  });

  test('Remove team member returns success for self', async ({ page }) => {
    const response = await page.evaluate(async () => {
      const token = localStorage.getItem('token');
      // First get team data to find teamId and member ID
      const teamsRes = await fetch('/api/teams', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const teamsData = await teamsRes.json();
      
      if (teamsData.members && teamsData.members.length > 0) {
        const teamId = teamsData.teams[0].id;
        const memberId = teamsData.members[0].id;
        
        // Try to remove self
        const removeRes = await fetch(`/api/teams/${teamId}/members/${memberId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        });
        return removeRes.json();
      }
      return null;
    });

    if (response) {
      expect(response).toHaveProperty('message');
      expect(response.message).toContain('成员已移除');
    }
  });
});

test.describe('Terraform Templates API', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test('GET /api/terraform/templates returns template list', async ({ page }) => {
    const response = await page.evaluate(async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/terraform/templates', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      return res.json();
    });

    expect(response).toHaveProperty('templates');
    expect(response.templates).toBeInstanceOf(Array);
    expect(response.templates.length).toBeGreaterThan(0);
    
    // Check template structure
    const template = response.templates[0];
    expect(template).toHaveProperty('id');
    expect(template).toHaveProperty('name');
    expect(template).toHaveProperty('version');
  });

  test('Terraform page loads without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await navigate(page, 'terraform');
    await page.waitForTimeout(2000);

    // Check that no API errors occurred
    const apiErrors = errors.filter(e => e.includes('/api/'));
    expect(apiErrors).toHaveLength(0);
  });

  test('GET specific terraform template', async ({ page }) => {
    const response = await page.evaluate(async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/terraform/templates/aws-web-app', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      return res.json();
    });

    expect(response).toHaveProperty('id', 'aws-web-app');
    expect(response).toHaveProperty('name');
    expect(response).toHaveProperty('version');
    expect(response).toHaveProperty('content');
  });

  test('Apply terraform template returns success', async ({ page }) => {
    const response = await page.evaluate(async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/terraform/templates/aws-web-app/apply', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      return res.json();
    });

    expect(response).toHaveProperty('message');
    expect(response).toHaveProperty('status', 'applied');
  });

  test('Destroy terraform template returns success', async ({ page }) => {
    const response = await page.evaluate(async () => {
      const token = localStorage.getItem('token');
      const res = await fetch('/api/terraform/templates/aws-web-app/destroy', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      return res.json();
    });

    expect(response).toHaveProperty('message');
    expect(response).toHaveProperty('status', 'destroyed');
  });
});