import { test, expect } from '@playwright/test';

/**
 * Interactive-state gates: dialogs and narrow viewports.
 *
 * These live in their own file on purpose. `axe-sweep.spec.ts` configures
 * `mode: 'serial'` at file scope because its 28 route audits share one seeded
 * profile — and serial mode is file-scoped, so any earlier failure would skip
 * every test after it. A gate that reports "did not run" exactly when a
 * regression appears is not a gate, so these run independently.
 */

/**
 * Open-state accessibility and responsive gates.
 *
 * The route sweep audits pages as they load. Every dialog in the product
 * is reachable only through interaction, so a palette that shipped three AA
 * violations passed a "zero violations" gate that never opened it. These tests
 * close that gap, and the calendar test pins the 390px clipping defect.
 */
interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ target: string; html: string }>;
}

test.describe('interactive states', () => {
  test('command palette has no WCAG A/AA violations while open', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html[data-app-ready="true"]')).toBeAttached({ timeout: 30_000 });

    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();

    await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as {
        axe: { run: (context: Document, options: unknown) => Promise<{ violations: AxeViolation[] }> };
      }).axe;
      const result = await axe.run(document, {
        runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
      });
      return result.violations.map(violation => ({
        id: violation.id,
        help: violation.help,
        nodes: violation.nodes.map((node: { target: string; html: string }) => ({ target: node.target, html: node.html.slice(0, 200) })),
      }));
    });

    expect(violations, violations.map(v => `${v.id} (${v.help})`).join('; ')).toHaveLength(0);
  });

  test('quick add has no WCAG A/AA violations while open', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('html[data-app-ready="true"]')).toBeAttached({ timeout: 30_000 });

    await page.keyboard.press('Control+n');
    await expect(page.getByRole('dialog', { name: /universal quick add/i })).toBeVisible();

    await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as {
        axe: { run: (context: Document, options: unknown) => Promise<{ violations: AxeViolation[] }> };
      }).axe;
      const result = await axe.run(document, {
        runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
      });
      return result.violations.map(violation => ({ id: violation.id, help: violation.help }));
    });

    expect(violations, violations.map(v => `${v.id} (${v.help})`).join('; ')).toHaveLength(0);
  });

  test('calendar week grid stays reachable at 390px', async ({ page }) => {
    // Regression: the last day column was clipped outright — no ancestor had a
    // scroller — so Sunday could not be reached on a phone.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/productivity/calendar', { waitUntil: 'networkidle' });
    await expect(page.locator('html[data-app-ready="true"]')).toBeAttached({ timeout: 30_000 });

    const geometry = await page.evaluate(() => {
      const doc = document.documentElement;
      const scroller = [...document.querySelectorAll('main *')].find(element => {
        const style = getComputedStyle(element);
        return (style.overflowX === 'auto' || style.overflowX === 'scroll')
          && element.scrollWidth > element.clientWidth + 4;
      });
      const headers = [...document.querySelectorAll('main div')]
        .filter(element => /^(Sun|Mon|Tue|Wed|Thu|Fri|Sat)\s*\d+$/.test((element.textContent ?? '').trim()));

      let sundayFullyVisible = false;
      if (scroller) {
        scroller.scrollLeft = scroller.scrollWidth;
        const last = headers[headers.length - 1];
        sundayFullyVisible = Boolean(last)
          && last.getBoundingClientRect().right <= scroller.getBoundingClientRect().right + 1;
      }

      return {
        documentOverflow: doc.scrollWidth > doc.clientWidth,
        scrolled: Boolean(scroller),
        columns: headers.length,
        narrowestColumn: headers.length
          ? Math.min(...headers.map(h => Math.round(h.getBoundingClientRect().width)))
          : 0,
        sundayFullyVisible,
      };
    });

    // No page-level sideways scroll...
    expect(geometry.documentOverflow, 'document must not scroll horizontally').toBe(false);
    // ...seven day columns exist, each wide enough to read...
    expect(geometry.columns).toBe(7);
    expect(geometry.narrowestColumn, 'columns must not be squeezed').toBeGreaterThanOrEqual(90);
    // ...and the overflow is reachable rather than clipped.
    expect(geometry.scrolled, 'the week grid needs a horizontal scroller at 390px').toBe(true);
    expect(geometry.sundayFullyVisible, 'Sunday must be reachable after scrolling').toBe(true);
  });
});
