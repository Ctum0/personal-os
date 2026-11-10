import { test, expect } from '@playwright/test';

/**
 * Productivity workflows: Today, Tasks (create + complete + search), Inbox
 * capture, Habits toggle, Focus timer, Calendar views, Plan page.
 */

const QUICK_CAPTURE = '+ Quick capture task (press Enter to save)...';
const CAPTURE_INBOX = 'Capture an idea, thought, or unorganized to-do and press Enter...';

test.describe('productivity', () => {
  test('root dashboard shows Plan My Day link and Priority Tasks section', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Plan My Day', exact: true })).toBeVisible();
    await expect(page.getByText(/Priority Tasks/)).toBeVisible();
  });

  test('Today page loads', async ({ page }) => {
    await page.goto('/productivity/today');
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('Tasks: quick capture creates a task and it renders', async ({ page }) => {
    const stamp = `e2e ${Date.now()}`;
    await page.goto('/productivity/tasks');
    const input = page.getByPlaceholder(QUICK_CAPTURE);
    await input.fill(stamp);
    await input.press('Enter');
    await expect(page.getByText(stamp)).toBeVisible();
  });

  test('Tasks: complete action flips a task status', async ({ page }) => {
    const stamp = `complete-me ${Date.now()}`;
    await page.goto('/productivity/tasks');
    const input = page.getByPlaceholder(QUICK_CAPTURE);
    await input.fill(stamp);
    await input.press('Enter');
    await expect(page.getByText(stamp)).toBeVisible();
    // Click the toggle, then verify status flipped through the API (the row
    // may move sections or be filtered after completion, so UI text is not a
    // stable assertion).
    await page.locator(`button[aria-label="Toggle task ${stamp}"]`).click();
    const verify = await page.request.get('/api/tasks?search=' + encodeURIComponent(stamp));
    const data = await verify.json();
    const match = (data.tasks || []).find((t: { title: string; status: string }) => t.title === stamp);
    expect(match).toBeTruthy();
    expect(match.status).toBe('completed');
  });

  test('Tasks: search filters the visible list', async ({ page }) => {
    const marker = `searchable-${Date.now()}`;
    await page.goto('/productivity/tasks');
    const input = page.getByPlaceholder(QUICK_CAPTURE);
    await input.fill(marker);
    await input.press('Enter');
    await expect(page.getByText(marker)).toBeVisible();
    const search = page.getByPlaceholder('Search tasks...');
    await search.fill('zzz-no-such-task');
    await expect(page.getByText(marker)).toBeHidden();
    await search.fill(marker);
    await expect(page.getByText(marker)).toBeVisible();
  });

  test('Inbox: capturing an item shows it in the list', async ({ page }) => {
    const stamp = `idea ${Date.now()}`;
    await page.goto('/productivity/inbox');
    const input = page.getByPlaceholder(CAPTURE_INBOX);
    await input.fill(stamp);
    await input.press('Enter');
    await expect(page.getByText(stamp)).toBeVisible();
  });

  test('Habits: create a habit via API, then toggle its completion state', async ({ page }) => {
    const title = `E2E Habit ${Date.now()}`;
    await page.goto('/productivity/habits');
    // Seed deterministically over the API so the toggle target always exists.
    const create = await page.request.post('/api/habits', {
      data: { title, trackingType: 'boolean', targetValue: 1 },
    });
    expect([200, 201]).toContain(create.status());
    await page.reload();
    const toggle = page.locator(`button[aria-label="Toggle habit ${title}"]`);
    await expect(toggle).toBeVisible();
    // Before toggling the icon is an open circle; click marks completed today.
    await toggle.click();
    await expect(toggle).toBeVisible();
    await expect(page.getByText(title)).toBeVisible();
  });

  test('Focus: start then pause the timer, interruption counter increments', async ({ page }) => {
    await page.goto('/productivity/focus');
    await expect(page.getByText('Focus Session')).toBeVisible();
    await page.getByRole('button', { name: 'Start Focus Block' }).click();
    await expect(page.getByRole('button', { name: 'Pause Timer' })).toBeVisible();
    await page.getByRole('button', { name: 'Pause Timer' }).click();
    await expect(page.getByRole('button', { name: 'Start Focus Block' })).toBeVisible();
    const before = await page.getByText(/Interruptions: \d+/).textContent();
    const n = Number(before?.match(/Interruptions: (\d+)/)?.[1] ?? 0);
    await page.getByText(/Interruptions:/).click();
    await expect(page.getByText(`Interruptions: ${n + 1}`)).toBeVisible();
    await page.getByTitle('Reset Timer').click();
    await expect(page.getByRole('button', { name: 'Start Focus Block' })).toBeVisible();
  });

  test('Calendar: day / week / agenda views all render', async ({ page }) => {
    await page.goto('/productivity/calendar');
    await expect(page.locator('h1').first()).toBeVisible();
    await page.locator('[data-view="day"]').click();
    await expect(page.locator('h1').first()).toBeVisible();
    await page.locator('[data-view="agenda"]').click();
    await expect(page.locator('h1').first()).toBeVisible();
    await page.locator('[data-view="week"]').click();
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('Plan: conversation page loads with message input', async ({ page }) => {
    await page.goto('/productivity/plan');
    await expect(page.locator('h1').first()).toBeVisible();
    await expect(page.locator('[aria-label="Send message"]')).toBeVisible();
  });

  test('Weekly Review page loads', async ({ page }) => {
    await page.goto('/productivity/weekly-review');
    await expect(page.locator('h1').first()).toBeVisible();
  });
});
