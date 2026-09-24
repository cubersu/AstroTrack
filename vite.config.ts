/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// The app is a static PWA. `base: './'` keeps every asset path relative so the
// production build can be served from any sub-path (GitHub Pages, a local
// folder served by any static server, etc.) without configuration.
export default defineConfig({
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/*.svg', 'icons/*.png'],
      manifest: {
        name: 'AstroTrack — Astrophotography Planner',
        short_name: 'AstroTrack',
        description:
          'Offline-first astrophotography planning: targets, visibility, framing, exposure and sessions — all computed locally.',
        lang: 'en',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0b1020',
        theme_color: '#0b1020',
        categories: ['utilities', 'education', 'photo'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Core astronomical datasets (catalogue, core stars) are precached so the
        // app works offline right after installation. Optional packs live under
        // data/packs/ and are downloaded on demand into IndexedDB instead.
        globPatterns: [
          '**/*.{js,css,html,svg,png,ico,webmanifest,woff2}',
          'data/packs.json',
          'data/core/**/*',
        ],
        globIgnores: ['data/packs/**/*'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024,
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        // Never let the service worker cache third-party API responses. Weather
        // and survey previews are stored explicitly in IndexedDB by the app.
        runtimeCaching: [],
      },
      devOptions: { enabled: false },
    }),
  ],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1200,
  },
  test: {
    environment: 'node',
    globals: false,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**'],
    testTimeout: 20000,
  },
});
