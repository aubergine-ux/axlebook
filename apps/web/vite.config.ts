import tailwindcss from '@tailwindcss/vite';
import { tanstackRouter } from '@tanstack/router-plugin/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const API_TARGET = process.env.AXLEBOOK_API ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [
    tanstackRouter({ target: 'react', autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: false,
      includeAssets: ['brand/favicon.svg', 'brand/favicon.ico', 'brand/apple-touch-icon.png'],
      manifest: {
        name: 'Axlebook',
        short_name: 'Axlebook',
        description: 'Self-hosted vehicle maintenance logbook',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#F7F5F0',
        theme_color: '#1A212B',
        icons: [
          { src: '/brand/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/brand/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/brand/maskable-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/brand/maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        // Fonts ship many unicode-range subsets; cache the ones actually used on demand.
        globPatterns: ['**/*.{js,css,html,svg,png,ico}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) =>
              url.pathname.startsWith('/assets/') && /\.woff2?$/.test(url.pathname),
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
});
