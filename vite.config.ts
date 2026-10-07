/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Single source of truth for the deployment base path. Vite's own `base`
// and the PWA manifest's `start_url`/`scope` must agree, or the app will
// mis-resolve routes/assets under a sub-path host (e.g. GitHub Pages:
// https://<account>.github.io/pocket-chess/). Set at build time with:
//   VITE_BASE_PATH=/pocket-chess/ npm run build
// Passing Vite's own `--base` CLI flag alone is not sufficient here,
// because it would not also reach the PWA manifest values below.
const basePath = process.env.VITE_BASE_PATH ?? '/';

export default defineConfig({
  base: basePath,
  build: {
    // Disables Vite's default behaviour of inlining small imported assets
    // (anything under 4KB) as base64 `data:` URIs directly in the JS
    // bundle. Added for the local chess-piece SVG artwork
    // (src/components/board/pieces/*.svg, all well under that threshold) -
    // a `data:` URI would be blocked by the production CSP's
    // `img-src 'self'` (no `data:`), and this project does not weaken the
    // CSP to add it. `0` forces every such asset to instead be emitted as
    // a real, separately-served, same-origin file - not a service-worker/
    // precache behaviour change (those still-separate files still match
    // `workbox.globPatterns`'s existing `svg` pattern below, same as any
    // other built SVG). No other asset in this project currently relies on
    // inlining.
    assetsInlineLimit: 0,
  },
  plugins: [
    react(),
    VitePWA({
      // 'prompt' (not 'autoUpdate') is the deliberate choice here: with
      // 'autoUpdate', vite-plugin-pwa compiles self.skipWaiting() +
      // clientsClaim() into the generated service worker, which lets a
      // newly deployed version seize every open tab immediately - including
      // one with a chess game in progress. 'prompt' leaves those unset, so
      // a new service worker installs and waits (standard Workbox
      // behaviour) until the page is next fully reloaded, and never
      // interrupts an active session. This intentionally does not add a
      // "new version available" prompt UI yet - that belongs to Phase 6
      // (PWA/offline hardening) per the build spec - it only fixes the
      // unsafe activation policy with the smallest possible change.
      registerType: 'prompt',
      // No `includeAssets` here, and `includeManifestIcons` turned off:
      // `workbox.globPatterns` below already matches `icons/icon.svg` in the
      // built output, so vite-plugin-pwa separately re-adding the same path
      // from `manifest.icons` (its default behaviour) produced a duplicate
      // precache entry for that one file in the generated service worker.
      includeManifestIcons: false,
      manifest: {
        name: 'Pocket Chess',
        short_name: 'Chess',
        description: 'Offline-first personal chess trainer',
        display: 'standalone',
        start_url: basePath,
        scope: basePath,
        background_color: '#1b1b1f',
        theme_color: '#1b1b1f',
        icons: [
          {
            src: 'icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      // `wasm` added in Phase 2A so the vendored Stockfish engine
      // (public/engine/stockfish-18-lite-single.{js,wasm}) precaches for
      // offline "Play computer" use once that's wired up, matching this
      // app's offline-first requirement - `js` alone already matched the
      // engine's small bootstrap script, but not its ~7MB .wasm binary.
      // `maximumFileSizeToCacheInBytes` also has to be raised: Workbox's
      // own default is 2 MiB (workbox-build's GetManifestOptions), and the
      // vendored .wasm is ~7MB - past that default it would be silently
      // *skipped* from the precache manifest (a build warning, not an
      // error) even after being added to globPatterns above. 8 MiB gives
      // the current ~7MB file some headroom; re-check this if the vendored
      // engine build is ever upgraded to something meaningfully larger.
      // Full puzzle-dataset caching is still Phase 5/6 work, not this one.
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,wasm}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['node_modules', 'tests/e2e', 'tests/engine-integration', 'tests/storage-integration'],
  },
});
