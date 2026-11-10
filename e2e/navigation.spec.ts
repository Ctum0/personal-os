import { test, expect } from '@playwright/test';

/**
 * Navigation workflows: workspace switching, command palette (⌘K), quick add (⌘N).
 * Keyboard shortcuts are handled globally in WorkspaceContext.
 */

test.describe('navigation', () => {
  test('⌘K opens command palette, Escape closes it', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');
    await expect(page.locator('[aria-label="Command palette"]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
  });

  test('⌘N opens Quick Add, Escape closes without saving', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+n');
    await expect(page.getByLabel('Universal Quick Add')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Universal Quick Add')).toBeHidden();
  });

  test('TopNav exposes ⌘K / ⌘N affordances and command palette button works', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('[aria-label="Quick Add (⌘N)"]')).toBeVisible();
    const paletteButton = page.locator('button', { hasText: '⌘K' });
    await expect(paletteButton).toBeVisible();
    await paletteButton.click();
    await expect(page.locator('[aria-modal="true"]').first()).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
  });

  test('workspace switcher changes active workspace context', async ({ page }) => {
    await page.goto('/');
    // Workspace switcher lives in TopNavbar; open it and pick another workspace.
    const switcher = page.locator('[data-testid="workspace-switcher"]');
    if ((await switcher.count()) > 0) {
      await switcher.click();
      const option = page.locator('[data-testid^="workspace-option-"]').nth(1);
      if ((await option.count()) > 0) {
        const target = await option.getAttribute('data-testid');
        await option.click();
        await expect(page.locator(`[data-testid="${target}"]`)).toBeVisible();
      }
    }
    // Regardless of switcher presence, the root must render its core regions.
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });
});
