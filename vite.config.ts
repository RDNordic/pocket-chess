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
      // Phase 0/1 scaffold: no engine or puzzle assets exist yet, so the
      // runtime cache list stays minimal until Phase 6 (PWA hardening).
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg}'],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['node_modules', 'tests/e2e'],
  },
});
