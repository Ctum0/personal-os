import { defineConfig } from '@playwright/test';

/**
 * Local-first E2E suite. Runs the dev server on a dedicated port against an
 * isolated temp database (PERSONAL_OS_DB_PATH) so the operator's live data is
 * never touched. CI reuses the same contract.
 */
const PORT = Number(process.env.E2E_PORT || 3457);

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false, // single-user app semantics: ordered, deterministic
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'list' : [['list'], ['html', { open: 'never', outputFolder: '.artifacts/final-audit/e2e-html' }]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    launchOptions: {
      executablePath: process.env.E2E_CHROMIUM_PATH || undefined,
    },
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npx next dev --port ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      // isolated profile so E2E never touches data/personal_os.db, and an
      // isolated dist dir so the dev server on :3000 keeps its own .next lock
      E2E_DIST_DIR: '.next-e2e',
      PERSONAL_OS_DB_PATH: process.env.E2E_DB_PATH || '/tmp/opencode/personal-os-e2e/profile.db',
    },
  },
});
