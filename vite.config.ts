/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Base path left as "/" for local dev; override with --base when deploying
// under a sub-path (e.g. GitHub Pages: /pocket-chess/).
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icons/*.svg'],
      manifest: {
        name: 'Pocket Chess',
        short_name: 'Chess',
        description: 'Offline-first personal chess trainer',
        display: 'standalone',
        start_url: '/',
        scope: '/',
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
