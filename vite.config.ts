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
      // Auto-activates a new service worker on the next load instead of
      // prompting, so this scaffold makes no promise of update UX that
      // does not exist yet. Full update-prompt UX is Phase 6 (PWA
      // hardening) per the build spec, not this stabilisation pass.
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.svg'],
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
