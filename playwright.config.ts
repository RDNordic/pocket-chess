import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
  },
  webServer: {
    // Deliberately a single simple command, not `npm run build && npm run
    // preview` chained together. On Windows, npm/cmd chaining with `&&`
    // spawns preview as a grandchild of the shell that ran the build, and
    // Playwright's process-tree teardown does not reliably reach that far,
    // leaving an orphaned `vite preview` process after the test run
    // reports success (`npm run test:e2e` would hang until interrupted).
    // The build now runs as its own step in the `test:e2e` npm script
    // instead, so this only ever starts/stops one process.
    command: 'npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
