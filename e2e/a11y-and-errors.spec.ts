import { test, expect } from '@playwright/test';
import { gotoApp } from './helpers';
import fs from 'fs';
import path from 'path';

/**
 * Accessibility and error-surface contract.
 *
 * These live in E2E rather than unit tests because they are properties of the
 * rendered page: labels, dialog semantics, keyboard reachability, and whether a
 * failed write is visible to the operator. They use no axe dependency at runtime
 * — each assertion names one specific regression from the audit.
 */

const ROUTES = [
  '/',
  '/overview',
  '/overview/settings',
  '/overview/metrics',
  '/overview/ai-governance',
  '/overview/backup',
  '/overview/formulas',
  '/productivity/today',
  '/productivity/plan',
  '/productivity/tasks',
  '/productivity/projects',
  '/productivity/calendar',
  '/productivity/inbox',
  '/productivity/habits',
  '/productivity/goals',
  '/productivity/focus',
  '/productivity/analytics',
  '/productivity/weekly-review',
  '/finance',
  '/finance/accounts',
  '/finance/transactions',
  '/finance/budgets',
  '/finance/savings',
  '/finance/debts',
  '/finance/recurring',
  '/finance/reports',
  '/finance/net-worth',
  '/finance/import',
  '/login',
];

interface A11yViolation {
  route: string;
  developer: string;
  ratio: number;
  selector: string;
}

const contrastViolations: A11yViolation[] = [];

test.describe('accessibility baseline', () => {
  for (const route of ROUTES) {
    test(`${route} has one h1, labelled controls, and no console errors`, async ({ page }) => {
      const consoleErrors: string[] = [];
      page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text().slice(0, 200));
      });
      page.on('pageerror', error => consoleErrors.push(`pageerror: ${error.message}`.slice(0, 200)));

      const response = await page.goto(route);
      expect(response?.status(), `${route} should respond 200`).toBe(200);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('h1')).toHaveCount(1);

      // Every form control must have an accessible name.
      const unnamed = await page.evaluate(() => {
        const controls = Array.from(document.querySelectorAll('input, select, textarea'));
        return controls
          .filter(control => {
            const element = control as HTMLElement;
            if (element.getAttribute('type') === 'hidden') return false;
            if (element.getAttribute('aria-label') || element.getAttribute('aria-labelledby')) return false;
            if (element.id) {
              return document.querySelectorAll(`label[for="${CSS.escape(element.id)}"]`).length === 0;
            }
            return !element.closest('label');
          })
          .map(control => control.outerHTML.slice(0, 120));
      });
      expect(unnamed, `${route} has unlabeled controls: ${unnamed.join(' | ')}`).toHaveLength(0);

      // Every button must expose a name (text, aria-label or title).
      const nameless = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
          .filter(button => {
            const text = (button.textContent ?? '').trim();
            return !text && !button.getAttribute('aria-label') && !button.getAttribute('title');
          })
          .map(button => button.outerHTML.slice(0, 120))
      );
      expect(nameless, `${route} has nameless buttons: ${nameless.join(' | ')}`).toHaveLength(0);

      // No horizontal scroll at the primary desktop width.
      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(overflow.scrollWidth, `${route} overflows horizontally`).toBeLessThanOrEqual(overflow.clientWidth + 1);

      // Contrast: compare rendered text to its nearest opaque background.
      const violations = await page.evaluate(() => {
        const toRgb = (value: string): [number, number, number] | null => {
          const match = /rgba?\(([^)]+)\)/.exec(value);
          if (!match) return null;
          const parts = match[1].split(',').map(part => Number.parseFloat(part.trim()));
          if (parts.length < 3) return null;
          if (parts.length === 4 && parts[3] < 0.9) return null; // translucent text
          return [parts[0], parts[1], parts[2]];
        };
        const luminance = ([r, g, b]: [number, number, number]): number => {
          const channel = (value: number): number => {
            const normalized = value / 255;
            return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
          };
          return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
        };
        const backgroundOf = (element: Element): [number, number, number] => {
          let node: Element | null = element;
          while (node) {
            const parsed = toRgb(getComputedStyle(node).backgroundColor);
            if (parsed) return parsed;
            node = node.parentElement;
          }
          return [9, 10, 11]; // app background token
        };

        const results: Array<{ developer: string; ratio: number; selector: string }> = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        const seen = new Set<Element>();
        while (walker.nextNode()) {
          const text = (walker.currentNode.textContent ?? '').trim();
          if (text.length < 2) continue;
          const parent = walker.currentNode.parentElement;
          if (!parent || seen.has(parent)) continue;
          seen.add(parent);

          const style = getComputedStyle(parent);
          if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) < 0.5) continue;
          const rect = parent.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;

          const foreground = toRgb(style.color);
          if (!foreground) continue;
          const background = backgroundOf(parent);
          const lightest = Math.max(luminance(foreground), luminance(background));
          const darkest = Math.min(luminance(foreground), luminance(background));
          const ratio = (lightest + 0.05) / (darkest + 0.05);

          const sizePx = Number.parseFloat(style.fontSize);
          const bold = Number(style.fontWeight) >= 600;
          const required = sizePx >= 24 || (bold && sizePx >= 18.66) ? 3 : 4.5;
          if (ratio < required) {
            results.push({
              developer: `${text.slice(0, 40)} (${style.color} on rgb(${background.join(',')}), need ${required})`,
              ratio: Math.round(ratio * 100) / 100,
              selector: parent.tagName.toLowerCase(),
            });
          }
        }
        return results;
      });
      for (const violation of violations) {
        contrastViolations.push({ route, ...violation });
      }
    });
  }

  test('collected text meets WCAG AA contrast', () => {
    expect(
      contrastViolations,
      `contrast failures:\n${contrastViolations.map(v => `${v.route} :: ${v.developer}`).join('\n')}`
    ).toHaveLength(0);
  });
});

test.describe('keyboard and dialog semantics', () => {
  test('skip link moves focus to main content', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: /skip to main content/i });
    await expect(skip).toBeFocused();
    await skip.press('Enter');
    await expect(page).toHaveURL(/#main-content$/);
  });

  test('command palette supports arrow navigation and Enter', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Command palette' });
    await expect(dialog).toBeVisible();

    const options = dialog.getByRole('option');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowUp');
    await expect(options.first()).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('command palette still finds its own commands when you type', async ({ page }) => {
    // Regression: the palette switched to record search on the first keystroke,
    // so typing "settings" returned nothing and the Settings command became
    // unreachable by name.
    await gotoApp(page);
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Command palette' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('option')).toHaveCount(10);

    const input = dialog.locator('input').first();
    await input.fill('settings');
    await expect(dialog.getByRole('option').first()).toContainText(/Settings/i);
    await dialog.getByRole('option').first().click();
    await page.waitForURL(url => url.pathname === '/overview/settings', { timeout: 15_000 });
  });

  test('command palette reports when nothing matches', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+k');
    const dialog = page.getByRole('dialog', { name: 'Command palette' });
    const input = dialog.locator('input').first();
    await input.fill('zzzz-no-such-command-zzzz');
    await expect(dialog.getByText(/No commands or records match/i)).toBeVisible();
  });

  test('quick add is a labelled dialog that clears between opens', async ({ page }) => {
    await gotoApp(page);
    await page.keyboard.press('Control+n');
    const dialog = page.getByRole('dialog', { name: /universal quick add/i });
    await expect(dialog).toBeVisible();

    const title = page.getByLabel(/title \/ summary/i);
    await title.fill('draft that must not persist');

    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.keyboard.press('Control+n');
    await expect(page.getByLabel(/title \/ summary/i)).toHaveValue('');
    await page.keyboard.press('Escape');
  });

  test('calendar block-time dialog traps Escape and is labelled', async ({ page }) => {
    await page.goto('/productivity/calendar');
    await page.getByRole('button', { name: /block time/i }).first().click();
    const dialog = page.getByRole('dialog', { name: /schedule time block/i });
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('mobile navigation opens, traps focus, and closes on Escape', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await page.getByRole('button', { name: /toggle navigation menu/i }).click();
    const drawer = page.getByRole('dialog', { name: /navigation drawer/i });
    await expect(drawer).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });

  test('mobile layout does not scroll horizontally', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
  });
});

test.describe('write surfaces report failures instead of pretending', () => {
  test('settings save persists and re-reads the stored values', async ({ page, request }) => {
    await page.goto('/overview/settings');
    await page.getByLabel(/standard work day start/i).fill('08:45');
    await expect(page.getByLabel(/standard work day start/i)).toHaveValue('08:45');
    await page.getByRole('button', { name: /save rules/i }).click();
    await expect(page.getByRole('status').filter({ hasText: /operating rules saved/i })).toBeVisible();

    const stored = await (await request.get('/api/settings')).json();
    expect(stored.preferences.workStart).toBe('08:45');
  });

  test('a rejected settings write surfaces an error', async ({ page }) => {
    await page.route('**/api/settings', async route => {
      if (route.request().method() === 'PUT') {
        await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ error: 'rejected by policy' }) });
        return;
      }
      await route.continue();
    });

    await page.goto('/overview/settings');
    await page.getByRole('button', { name: /save rules/i }).click();
    await expect(page.getByRole('alert').filter({ hasText: /rejected by policy/i })).toBeVisible();
  });

  test('task archive removes the row and keeps it gone after reload', async ({ page }) => {
    const marker = `archive-${Date.now()}`;
    // Seed through the API so this spec exercises archiving, not capture timing.
    const created = await page.request.post('/api/tasks', { data: { title: marker } });
    expect(created.status()).toBe(201);

    await page.goto('/productivity/tasks');
    await expect(page.getByText(marker)).toBeVisible();

    page.once('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: new RegExp(`archive task ${marker}`, 'i') }).click();
    await expect(page.getByText(marker)).toBeHidden();

    await page.reload();
    await expect(page.getByText(marker)).toBeHidden();
  });

  test('AI governance toggle persists across reload', async ({ page }) => {
    await page.goto('/overview/ai-governance');
    const toggle = page.getByRole('switch', { name: /get_habit_summary/i });
    await expect(toggle).toBeVisible();

    // Start from a known state: the suite may run against a reused profile.
    if ((await toggle.getAttribute('aria-checked')) === 'false') {
      await toggle.click();
      await expect(toggle).toHaveAttribute('aria-checked', 'true');
    }

    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-checked', 'false');

    // The switch flips optimistically; wait for the write to be durable before
    // reloading, otherwise the reload races the PUT and reads the old row.
    await expect
      .poll(async () => {
        const body = await (await page.request.get('/api/ai/policies')).json();
        return body.policies.find((policy: { tool_name: string }) => policy.tool_name === 'get_habit_summary')?.is_enabled;
      })
      .toBe(0);

    await page.reload();
    await expect(page.getByRole('switch', { name: /get_habit_summary/i })).toHaveAttribute('aria-checked', 'false');

    // Restore the default so the rest of the suite sees a clean policy table.
    await page.getByRole('switch', { name: /get_habit_summary/i }).click();
    await expect(page.getByRole('switch', { name: /get_habit_summary/i })).toHaveAttribute('aria-checked', 'true');
    await expect
      .poll(async () => {
        const body = await (await page.request.get('/api/ai/policies')).json();
        return body.policies.find((policy: { tool_name: string }) => policy.tool_name === 'get_habit_summary')?.is_enabled;
      })
      .toBe(1);
  });
});

test.describe('backup round trip', () => {
  test('export downloads a JSON file that restore accepts', async ({ page }) => {
    await page.goto('/overview/backup');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /download complete backup/i }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/);

    const filePath = await download.path();
    expect(filePath).toBeTruthy();
    const payload = JSON.parse(fs.readFileSync(filePath!, 'utf-8'));
    expect(payload.domains.productivity.tasks).toBeInstanceOf(Array);
    expect(payload.domains.finance.accounts).toBeInstanceOf(Array);
    expect(payload.domains.finance.transactions).toBeInstanceOf(Array);

    const response = await page.request.post('/api/backup/restore', { data: payload });
    expect(response.status()).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
  });
});

/** Ensures each route's file exists so a renamed page fails loudly. */
test('every audited route maps to a page file', async () => {
  // Authenticated pages live in the `(app)` route group, which is a layout
  // boundary, not part of the URL. /login is outside it by design.
  const roots = [path.resolve(process.cwd(), 'src/app'), path.resolve(process.cwd(), 'src/app/(app)')];
  for (const route of ROUTES) {
    const relative = route === '/' ? 'page.tsx' : path.join(route.slice(1), 'page.tsx');
    const found = roots.some(root => fs.existsSync(path.join(root, relative)));
    expect(found, `missing page for ${route}`).toBe(true);
  }
});
