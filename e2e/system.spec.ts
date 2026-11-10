import { test, expect } from '@playwright/test';

/**
 * System workflows: backup export, weekly review via API contract,
 * unlock surface in open mode (no PERSONAL_OS_PIN in the E2E environment).
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

  test('unlock page renders and open-mode session reports openMode:true', async ({ page }) => {
    // Open mode: /api/auth/session must not set cookies, but the page must render.
    await page.goto('/unlock');
    await expect(page.getByText(/Personal OS is locked/i)).toBeVisible();
    const res = await page.request.post('/api/auth/session', {
      data: { pin: 'anything' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.openMode).toBe(true);
  });

  test('system API health contract: key list endpoints respond 200', async ({ request }) => {
    for (const path of ['/api/tasks', '/api/habits', '/api/projects', '/api/goals']) {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
    }
  });
});
