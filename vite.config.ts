import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Secara eksplisit menyertakan aset untuk memastikan ada di build
      includeAssets: ['logo_192x192.png', 'logo_512x512.png'],
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,jpg}'],
        navigateFallback: '/index.html',
        // Membersihkan cache lama, ini praktik yang baik
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: 'Aplikasi Keuangan Saya',
        short_name: 'KeuanganKu',
        description: 'Aplikasi untuk melacak budget dan transaksi keuangan.',
        theme_color: '#a1884f',
        background_color: '#ffffff',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            // Menggunakan path relatif karena 'includeAssets' akan menempatkannya di root
            src: 'logo_192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable'
          },
          {
            src: 'logo_512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
})
