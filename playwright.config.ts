import { defineConfig } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

/**
 * Local-first E2E suite.
 *
 * Two projects run the same specs against two servers:
 *  - `open`   (port 3457): no credentials configured — the local workstation
 *                          experience, which is what `pnpm dev` gives you.
 *  - `authed` (port 3458): operator credentials configured, so the sign-in gate
 *                          specs actually run against a protected instance.
 *
 * Both use isolated profile databases and their own dist dirs, so neither the
 * operator's live database nor a stray dev server is ever involved. The gate
 * specs run in the `authed` project only, selected by file name so a stray
 * environment variable can never silently skip authentication coverage.
 */
const OPEN_PORT = Number(process.env.E2E_PORT || 3457);
const PIN_PORT = Number(process.env.E2E_PIN_PORT || 3458);
const E2E_USERNAME = process.env.E2E_USERNAME || 'e2e-operator';
const E2E_PASSWORD = process.env.E2E_PASSWORD || 'e2e-fixture-password';
// Deterministic test-only digest for E2E_PASSWORD — never used by a deployment.
const E2E_PASSWORD_SALT = process.env.E2E_PASSWORD_SALT || 'e2e-salt-fixed-value';
const E2E_PASSWORD_HASH =
  process.env.E2E_PASSWORD_HASH || 'dbc9f1b53b22dca0d62d2dfabc2ae442cd6c5996cd5a9e7a38c199136d7c6167';
const E2E_SESSION_SECRET = process.env.E2E_SESSION_SECRET || 'e2e-session-secret-fixed-value';
const IS_CI = Boolean(process.env.CI);

const openDb = process.env.E2E_DB_PATH || path.join(os.tmpdir(), 'personal-os-e2e', 'profile.db');
const pinDb = process.env.E2E_PIN_DB_PATH || path.join(os.tmpdir(), 'personal-os-e2e', 'profile-pin.db');

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  // Single-operator app semantics: every spec mutates the same isolated profile,
  // so parallel workers would race each other. One worker keeps it deterministic.
  workers: 1,
  retries: IS_CI ? 1 : 0,
  // Always produce the HTML report: CI uploads it as an artifact, and it is the
  // only human-readable record of a failure.
  reporter: [['list'], ['html', { open: 'never', outputFolder: '.artifacts/e2e-html' }]],
  use: {
    launchOptions: {
      executablePath: process.env.E2E_CHROMIUM_PATH || undefined,
    },
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'open',
      testIgnore: /auth-gate\.spec\.ts$/,
      use: { baseURL: `http://localhost:${OPEN_PORT}` },
    },
    {
      name: 'authed',
      // The PIN gate is the app's only authentication surface; its specs must
      // run in every CI pass, not be skipped behind an unset variable.
      testMatch: /auth-gate\.spec\.ts$/,
      use: { baseURL: `http://localhost:${PIN_PORT}` },
    },
  ],
  webServer: [
    {
      command: `npx next dev --port ${OPEN_PORT}`,
      url: `http://localhost:${OPEN_PORT}`,
      // Always boot our own server: reusing a stray dev server silently runs the
      // suite against whatever database that server happens to have open.
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        E2E_DIST_DIR: '.next-e2e',
        PERSONAL_OS_DB_PATH: openDb,
        // Playwright merges this object over the parent process env, so any
        // credential exported in the developer's shell would silently put the
        // "open" project behind a login. Blanking them keeps open mode real.
        PERSONAL_OS_USERNAME: '',
        PERSONAL_OS_PASSWORD_SALT: '',
        PERSONAL_OS_PASSWORD_HASH: '',
        PERSONAL_OS_PASSWORD_ITERATIONS: '',
        PERSONAL_OS_SESSION_SECRET: '',
      },
    },
    {
      command: `npx next dev --port ${PIN_PORT}`,
      url: `http://localhost:${PIN_PORT}`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: {
        E2E_DIST_DIR: '.next-e2e-pin',
        PERSONAL_OS_DB_PATH: pinDb,
        PERSONAL_OS_USERNAME: E2E_USERNAME,
        PERSONAL_OS_PASSWORD_SALT: E2E_PASSWORD_SALT,
        PERSONAL_OS_PASSWORD_HASH: E2E_PASSWORD_HASH,
        PERSONAL_OS_SESSION_SECRET: E2E_SESSION_SECRET,
      },
    },
  ],
});
