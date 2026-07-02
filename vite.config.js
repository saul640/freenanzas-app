import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
const enablePwa = process.env.VITE_DISABLE_PWA !== 'true'

export default defineConfig(({ command }) => ({
  publicDir: command === 'build' ? false : 'public',
  plugins: [
      react(),
      enablePwa && VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        manifest: {
          name: 'Freenanzas',
          short_name: 'Freenanzas',
          description: 'PWA de finanzas personales basada en la regla 50/30/20.',
          theme_color: '#0df259',
          background_color: '#f5f8f6',
          display: 'standalone',
          orientation: 'portrait',
          icons: [
            {
              src: '/logo-192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/logo-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any maskable',
            },
          ],
        },
        workbox: {
          cleanupOutdatedCaches: true,
          clientsClaim: true,
          skipWaiting: true,
          navigateFallback: '/index.html',
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        },
      }),
    ].filter(Boolean),
}))
