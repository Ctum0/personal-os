import { test, expect } from '@playwright/test';

/**
 * System workflows: backup export, weekly review via API contract, and the
 * sign-in surface in open mode (no operator credentials in the E2E environment).
 */

test.describe('system', () => {
  test('Backup page loads and full JSON export succeeds', async ({ page }) => {
    await page.goto('/overview/backup');
    await expect(page.getByText('Data Backup & Portable Export')).toBeVisible();
    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    await page.getByRole('button', { name: /Download Complete Backup/ }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/);
  });

  test('open mode reports openMode:true and never sets a cookie', async ({ page }) => {
    // With no credentials configured there is nothing to sign in to, so /login
    // correctly forwards straight into the workspace. What must hold is that the
    // endpoint reports open mode and issues no session cookie.
    const res = await page.request.post('/api/auth/session', {
      data: { username: 'anything', password: 'anything' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.openMode).toBe(true);
    expect(res.headers()['set-cookie']).toBeUndefined();

    const login = await page.goto('/login');
    expect(login?.status()).toBe(200);
    await expect(page.locator('html[data-app-ready="true"]')).toBeAttached({ timeout: 30_000 });
    expect(new URL(page.url()).pathname).toBe('/');
  });

  test('system API health contract: key list endpoints respond 200', async ({ request }) => {
    for (const path of ['/api/tasks', '/api/habits', '/api/projects', '/api/goals']) {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
    }
  });
});
