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

  test('sign-in page renders and open mode reports openMode:true', async ({ page }) => {
    // Open mode: the page must render and the endpoint must report that no
    // credential is configured, without setting a session cookie.
    await page.goto('/login');
    await expect(page.getByLabel('Username')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    const res = await page.request.post('/api/auth/session', {
      data: { username: 'anything', password: 'anything' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.openMode).toBe(true);
    expect(res.headers()['set-cookie']).toBeUndefined();
  });

  test('system API health contract: key list endpoints respond 200', async ({ request }) => {
    for (const path of ['/api/tasks', '/api/habits', '/api/projects', '/api/goals']) {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
    }
  });
});
