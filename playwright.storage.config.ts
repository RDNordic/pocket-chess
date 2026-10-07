import { defineConfig } from '@playwright/test';

// scripts/test-storage.mjs owns the in-process Vite server, avoiding Windows
// npm/Vite child-tree teardown. Uses the installed Playwright-managed Chromium.
export default defineConfig({
  testDir: './tests/storage-integration', fullyParallel: false, workers: 1,
  reporter: 'list', timeout: 30_000,
  use: { baseURL: 'http://127.0.0.1:4186' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
