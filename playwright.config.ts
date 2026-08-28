import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
  },
  webServer: {
    // Calls Vite's own local Node entry point directly, not `npm run
    // preview`. `npm run <script>` on Windows spawns its own `cmd.exe`
    // wrapper around a further `npm-cli.js` process before it ever reaches
    // `vite.js` itself - going straight to `node .../vite/bin/vite.js`
    // removes that whole intermediate npm/cmd layer, leaving only the one
    // process Playwright actually needs to track and kill. (The build
    // still runs as its own step in the `test:e2e` npm script, not chained
    // here with `&&` - see git history for why that chaining orphaned a
    // process on Windows.)
    command: 'node ./node_modules/vite/bin/vite.js preview --port 4173',
    url: 'http://localhost:4173',
    // Always start a fresh preview server, even locally. `test:e2e` always
    // runs `npm run build` immediately beforehand, producing new
    // content-hashed asset filenames - if a leftover server from a prior
    // run (e.g. one whose teardown was still in flight, or one left behind
    // by an interrupted run) is still bound to the port,
    // `reuseExistingServer: true` would silently attach to it and serve
    // the *previous* build instead of failing loudly. Reproduced this
    // exact failure mode locally: back-to-back `npm run test:e2e` runs
    // occasionally reused a not-yet-torn-down server from the previous
    // run, and every spec then timed out waiting for a button that never
    // rendered (a stale/mismatched bundle, not a real app or test bug).
    // `false` makes Playwright always own the server for this run - if the
    // port is still occupied it fails fast with a clear "already in use"
    // error instead of silently testing the wrong build.
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
