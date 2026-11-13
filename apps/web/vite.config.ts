import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const API_TARGET = process.env.AXLEBOOK_API ?? 'http://localhost:8080';

export default defineConfig(({ command }) => ({
  // The build is relative, so one image serves the root or any subpath: the server writes the
  // mount path into the page as a <base> tag.
  base: command === 'build' ? './' : '/',
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['favicon.svg', 'favicon.ico', 'apple-touch-icon-180.png'],
      manifest: {
        name: 'Axlebook',
        short_name: 'Axlebook',
        description: 'Self-hosted vehicle maintenance logbook',
        // Relative to the manifest, so the app installs from wherever it's mounted.
        start_url: '.',
        scope: '.',
        display: 'standalone',
        // Brand kit: surface (light) and graphite.
        background_color: '#f4f5f6',
        theme_color: '#1c1f22',
        icons: [
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'pwa-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: 'index.html',
        // The API and the calendar feed are the server's, never the app page.
        navigateFallbackDenylist: [/\/api\//, /\/calendar\//],
        // Brand fonts are cached the first time they load.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        // Store/desktop icon sources in public/ aren't needed offline.
        globIgnores: ['**/ios-*.png', '**/macos-*.png', '**/avatar-*.png', '**/favicon-*.png'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.includes('/brand/fonts/'),
            handler: 'CacheFirst',
            options: { cacheName: 'fonts', expiration: { maxEntries: 30 } },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    // changeOrigin stays false so the CSRF Origin check sees localhost:5173 on both sides.
    proxy: { '/api': { target: API_TARGET, changeOrigin: false } },
  },
  build: { sourcemap: true, chunkSizeWarningLimit: 600 },
}));
