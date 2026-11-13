import { test, expect } from '@playwright/test';

/**
 * Sign-in gate contract.
 *
 * The gate lives in `src/proxy.ts` and matches `/api/:path*`, so pages render a
 * shell and every data call fails with 401. The shell must send the operator to
 * /login rather than showing an empty dashboard — "protecting the app" that looks
 * identical to "there is no data" is the regression this spec pins.
 *
 * The `authed` project boots its own server on its own port with operator
 * credentials configured, so these specs always run; a skip would report
 * authentication coverage that does not exist.
 */
const USERNAME = process.env.E2E_USERNAME || 'e2e-operator';
const PASSWORD = process.env.E2E_PASSWORD || 'e2e-fixture-password';

async function signIn(page: import('@playwright/test').Page) {
  await page.getByLabel('Username').fill(USERNAME);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: /Sign in/i }).click();
}

test.describe('sign-in gate', () => {
  test('the gate is engaged (fails loudly if the server booted open)', async ({ request }) => {
    const res = await request.get('/api/tasks');
    expect(res.status(), 'the authed project must boot with credentials set').toBe(401);
    expect(res.headers()['www-authenticate']).toContain('PersonalOS-Session');
  });

  test('wrong credentials are rejected, correct ones mint a session', async ({ request }) => {
    const wrong = await request.post('/api/auth/session', {
      data: { username: USERNAME, password: 'definitely-wrong' },
    });
    expect(wrong.status()).toBe(401);

    const right = await request.post('/api/auth/session', {
      data: { username: USERNAME, password: PASSWORD },
    });
    expect(right.status()).toBe(200);
    expect((await right.json()).openMode).toBe(false);

    // The cookie from that response now satisfies the gate.
    const authorized = await request.get('/api/tasks');
    expect(authorized.status()).toBe(200);
  });

  test('pages are gated, not just the API', async ({ page }) => {
    // The regression this pins: the shell used to render while signed out, so a
    // visitor could browse the navbar and see empty containers.
    await page.goto('/finance/transactions');
    await page.waitForURL(url => url.pathname.startsWith('/login'), { timeout: 20_000 });
    expect(new URL(page.url()).searchParams.get('next')).toBe('/finance/transactions');

    // No application chrome on the sign-in page.
    await expect(page.getByRole('navigation')).toHaveCount(0);
    await expect(page.getByLabel('Username')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
  });

  test('an api path is never treated as a static asset', async ({ request }) => {
    // The asset-extension check runs before the /api/ branch; a JSON-ish suffix
    // must not become an authentication bypass.
    // Assert the gate's own status, not merely "not 200": with no route at all a
    // bypass returns 404 and a loose assertion would still pass.
    const res = await request.get('/api/tasks.json', { maxRedirects: 0 });
    expect(res.status(), 'api paths must be gated, not treated as assets').toBe(401);
  });

  test('static assets referenced by the manifest stay public', async ({ request }) => {
    // A signed-out browser still fetches the PWA icons; redirecting them to
    // /login silently breaks installability.
    for (const asset of ['/icon.png', '/icon-512.png', '/icon.svg', '/manifest.json']) {
      const res = await request.get(asset, { maxRedirects: 0 });
      expect(res.status(), `${asset} must not be gated`).toBe(200);
    }
  });

  test('the sign-in form reaches the dashboard', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByLabel('Username')).toBeVisible();
    await signIn(page);
    await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 15_000 });
    await expect(page.locator('h1').first()).toBeVisible();
  });

  test('a wrong password shows an error and does not navigate', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Username').fill(USERNAME);
    await page.getByLabel('Password').fill('wrong-password');
    await page.getByRole('button', { name: /Sign in/i }).click();
    // Scoped to the form: Next's route announcer is also role="alert".
    await expect(page.locator('form [role="alert"]')).toContainText(/Invalid credentials/i);
    expect(new URL(page.url()).pathname).toBe('/login');
  });

  test('signing out ends the session, not just the page', async ({ page }) => {
    await page.goto('/login');
    await signIn(page);
    await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 20_000 });

    // The API works while signed in.
    expect((await page.request.get('/api/tasks')).status()).toBe(200);

    await page.getByRole('button', { name: /account menu/i }).click();
    await page.getByRole('menuitem', { name: /sign out/i }).click();

    await page.waitForURL(url => url.pathname.startsWith('/login'), { timeout: 20_000 });
    // The cookie must be gone server-side: a reload of a deep link cannot restore it.
    expect((await page.request.get('/api/tasks')).status()).toBe(401);
    await page.goto('/finance/transactions');
    await page.waitForURL(url => url.pathname.startsWith('/login'), { timeout: 20_000 });
  });

  test('the account menu is keyboard reachable and Escape closes it', async ({ page }) => {
    await page.goto('/login');
    await signIn(page);
    await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 20_000 });

    const trigger = page.getByRole('button', { name: /account menu/i });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menu', { name: 'Account' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menu', { name: 'Account' })).toBeHidden();
  });

  test('a deep link survives the sign-in round trip', async ({ page }) => {
    // The API 401 sends the operator to /login?next=…; after signing in they must
    // land on the page they asked for, not on Today.
    await page.goto('/finance/transactions');
    await page.waitForURL(url => url.pathname.startsWith('/login'), { timeout: 20_000 });
    await signIn(page);
    await page.waitForURL(url => url.pathname === '/finance/transactions', { timeout: 20_000 });
    await expect(page.locator('h1').first()).toBeVisible();
  });
});
