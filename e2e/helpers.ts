import { expect, type Page } from '@playwright/test';

/**
 * Waits until the application shell has hydrated.
 *
 * Key handlers and click handlers exist only after React attaches them, but the
 * server HTML looks finished long before that. Every spec that drives the shell
 * with the keyboard or a click starts here, so failures are real defects rather
 * than a race with hydration.
 */
export async function gotoApp(page: Page, path = '/'): Promise<void> {
  await page.goto(path);
  await expect(page.locator('html[data-app-ready="true"]')).toBeAttached({ timeout: 30_000 });
}
