import { test, expect, type Page } from '@playwright/test';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

/**
 * Whole-app axe sweep, committed as a permanent regression gate.
 *
 * Several axe rules only fire when content actually overflows or renders, so an
 * empty profile makes them invisible: `scrollable-region-focusable` needs a
 * scrollable list with content, `color-contrast` needs real colors, and
 * `label-content-name-mismatch` needs visible text inside a labelled control.
 * The seed below therefore fills every list the app renders, and is **idempotent**
 * so repeated runs (local, retried, or CI re-runs) audit exactly the same DOM.
 */

const ROUTES = [
  '/', '/overview', '/overview/metrics', '/overview/settings', '/overview/ai-governance',
  '/overview/backup', '/overview/formulas',
  '/productivity/today', '/productivity/plan', '/productivity/tasks', '/productivity/projects',
  '/productivity/calendar', '/productivity/inbox', '/productivity/habits', '/productivity/goals',
  '/productivity/focus', '/productivity/analytics', '/productivity/weekly-review',
  '/finance', '/finance/accounts', '/finance/transactions', '/finance/budgets',
  '/finance/savings', '/finance/debts', '/finance/recurring', '/finance/reports',
  '/finance/net-worth', '/finance/import', '/login',
];

interface AxeViolation {
  id: string;
  impact: string | null;
  help: string;
  nodes: Array<{ target: string; html: string }>;
}

const SEED_ROWS = 12;

/**
 * Removes every sweep row so a re-run produces exactly the same DOM.
 *
 * Tasks and calendar events soft-delete (which is correct for the product), so
 * cleanup goes through SQLite directly: leaving archived copies behind would
 * accumulate overlapping blocks across runs and change what axe sees.
 */
function clearSeed(): void {
  const db = openProfileDb();
  if (!db) return;
  try {
    db.prepare("DELETE FROM tasks WHERE title LIKE 'sweep %'").run();
    db.prepare("DELETE FROM calendar_events WHERE title LIKE 'sweep %'").run();
    db.prepare("DELETE FROM weekly_reviews WHERE summary LIKE 'sweep review %'").run();
    db.prepare("DELETE FROM import_batches WHERE file_name LIKE 'sweep%'").run();
  } finally {
    db.close();
  }
}

/**
 * Opens the E2E profile database the server is using (isolated, never live).
 * Returns null when the server has not created the file yet — cleanup then simply
 * has nothing to do, which is the correct outcome for a first run.
 */
function openProfileDb(): Database.Database | null {
  const profilePath = process.env.E2E_DB_PATH || path.join(os.tmpdir(), 'personal-os-e2e', 'profile.db');
  if (!fs.existsSync(profilePath)) return null;
  const db = new Database(profilePath);
  db.pragma('foreign_keys = ON');
  return db;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async ({ request }) => {
  clearSeed();

  for (let i = 0; i < SEED_ROWS; i++) {
    await request.post('/api/tasks', {
      data: { title: `sweep task ${i}`, priority: 'normal', dueDate: '2026-11-20' },
    });
  }
  for (let i = 0; i < SEED_ROWS; i++) {
    await request.post('/api/habits', {
      data: { title: `sweep habit ${i}`, trackingType: 'boolean', targetValue: 1 },
    });
  }
  // Mixed hues on purpose: operator colors are arbitrary, so the avatar scoring
  // must hold for a mid-tone (fails AA against both inks) and a pale one.
  const PROJECT_COLORS = ['#6366f1', '#fbbf24', '#10b981', '#ef4444'];
  for (let i = 0; i < 4; i++) {
    await request.post('/api/projects', {
      data: { name: `sweep project ${i}`, color: PROJECT_COLORS[i] },
    });
  }
  // One block per day, no collisions: dense-cluster badges (which have their own
  // label contract) are covered by the a11y spec instead of being created here.
  for (let day = 1; day <= SEED_ROWS; day++) {
    const date = `2026-11-${String(day).padStart(2, '0')}`;
    await request.post('/api/calendar', {
      data: {
        title: `sweep block ${day}`,
        startTime: `${date}T09:00:00`,
        endTime: `${date}T10:00:00`,
        eventType: 'time_block',
      },
    });
  }
  // Weekly reviews render the archive list only when at least one exists, so
  // without these the guarded archive container never enters the DOM.
  for (let week = 0; week < SEED_ROWS; week++) {
    const weekStart = `2026-${String(9 + Math.floor(week / 4)).padStart(2, '0')}-${String(7 + (week % 4) * 7).padStart(2, '0')}`;
    await request.post('/api/weekly-review', {
      data: {
        weekStart,
        summary: `sweep review ${week}`,
        payload: { reflectionNotes: `sweep review ${week}`, completedCount: week },
      },
    });
  }
});

test.afterAll(() => {
  clearSeed();
});

/**
 * Drives the real import UI so the preview table actually renders.
 *
 * Posting `action:'preview'` to the API mutates no page state — the table is
 * React state that only the file-input flow sets — so an API-only seed would
 * leave the guarded scroll container absent from the DOM and the audit blind.
 */
async function openCsvPreview(page: Page): Promise<void> {
  const rows = Array.from(
    { length: 20 },
    (_, i) => `2026-11-${String((i % 28) + 1).padStart(2, '0')},-${(i + 1).toFixed(2)},sweep row ${i}`
  ).join('\n');

  await page.getByLabel('CSV Statement File').setInputFiles({
    name: 'sweep.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(`Date,Amount,Description\n${rows}`),
  });
  await page.getByRole('button', { name: /Preview & Detect Duplicates/i }).click();
  // The table only exists once the preview response lands.
  await expect(page.getByText(/2\. Preview Results/)).toBeVisible({ timeout: 15_000 });
}

for (const route of ROUTES) {
  test(`${route} has no WCAG A/AA violations`, async ({ page }) => {
    await page.goto(route, { waitUntil: 'networkidle' });

    if (route === '/finance/import') {
      // Render the preview table in place (a reload would drop the state) so its
      // scroll container is audited.
      await openCsvPreview(page);
    }

    await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
    const violations = await page.evaluate(async () => {
      const axe = (window as unknown as {
        axe: { run: (context: Document, options: unknown) => Promise<{ violations: AxeViolation[] }> };
      }).axe;
      const result = await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] });
      return result.violations.map(violation => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        nodes: violation.nodes.map(node => ({
          target: node.target,
          html: node.html.slice(0, 240),
        })),
      }));
    });
    expect(
      violations,
      `${route}: ${violations.map(v => `${v.id} (${v.help}) :: ${v.nodes.map(n => `${n.target} ${n.html}`).join(' | ')}`).join('; ')}`
    ).toHaveLength(0);
  });
}

/**
 * Open-state accessibility and responsive gates.
 *
 * The route sweep above audits pages as they load. Every dialog in the product
 * is reachable only through interaction, so a palette that shipped three AA
 * violations passed a "zero violations" gate that never opened it. These tests
 * close that gap, and the calendar test pins the 390px clipping defect.
 */
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
        nodes: violation.nodes.map(node => ({ target: node.target, html: node.html.slice(0, 200) })),
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
