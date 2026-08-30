import { defineConfig } from '@playwright/test';

// Separate from playwright.config.ts on purpose. The regular e2e suite runs
// against the production build (`vite preview` serving dist/) because it
// tests the shipped application. This one test instead needs the Vite dev
// server (on-the-fly TS transpilation) so it can load engine-harness.ts,
// which imports the real src/engine/StockfishAdapter.ts directly - that
// harness page is not a build entry and is never part of dist/ (see the
// comment in tests/engine-integration/engine-harness.html), so it cannot be
// exercised via the preview server the main e2e config uses.
//
// This also isolates the one genuinely slow/real-WASM test (launching an
// actual Stockfish Worker) from the fast, deterministic UI e2e suite -
// `npm run test:engine` runs it independently of `npm run test:e2e`.
export default defineConfig({
  testDir: './tests/engine-integration',
  fullyParallel: false,
  reporter: 'list',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4184',
  },
  webServer: {
    // Vite's dev server, not `preview` - see the file comment above. No
    // production build is required first.
    command: 'node ./node_modules/vite/bin/vite.js --port 4184 --strictPort',
    url: 'http://localhost:4184',
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
