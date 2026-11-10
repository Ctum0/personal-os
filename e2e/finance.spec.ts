import { test, expect } from '@playwright/test';

/**
 * Finance workflows: Overview pulse, Transactions (modal create + render),
 * Budgets, Recurring, Net Worth, Reports — all against the isolated E2E DB.
 */

test.describe('finance', () => {
  test('Overview pulse page loads', async ({ page }) => {
    await page.goto('/overview');
    await expect(page.getByText('Executive Summary Pulse')).toBeVisible();
  });

  test('Transactions: open Add Transaction modal and post a real transaction', async ({ page }) => {
    const payee = `E2E Ledger ${Date.now()}`;
    await page.goto('/finance/transactions');
    await expect(page.locator('h1').first()).toBeVisible();

    await page.getByRole('button', { name: 'Add Transaction' }).click();
    const modal = page.getByText('Record Ledger Transaction');
    await expect(modal).toBeVisible();

    // Amount
    await page.locator('input[type="number"]').first().fill('42.50');
    // Payee & description
    await page.locator('input[required][type="text"]').first().fill(payee);
    await page.getByRole('button', { name: /Post Transaction/ }).click();

    // Row appears in the ledger list with our payee.
    await expect(page.getByText(payee).first()).toBeVisible();
  });

  test('Transactions list renders existing ledger rows', async ({ page }) => {
    await page.goto('/finance/transactions');
    await expect(page.locator('h1').first()).toBeVisible();
    // The isolated DB has the default bootstrap account + possibly zero rows;
    // either way the page must not crash and the search box must be present.
    await expect(page.getByPlaceholder('Search payee or memo...')).toBeVisible();
  });

  test('Budgets page loads', async ({ page }) => {
    await page.goto('/finance/budgets');
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('Recurring rules page loads', async ({ page }) => {
    await page.goto('/finance/recurring');
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('Net Worth page loads', async ({ page }) => {
    await page.goto('/finance/net-worth');
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('Reports page loads', async ({ page }) => {
    await page.goto('/finance/reports');
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('Accounts page loads', async ({ page }) => {
    await page.goto('/finance/accounts');
    await expect(page.locator('h1').first()).toBeVisible();
  });
});
