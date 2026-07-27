import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import { execSync } from 'child_process'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf-8'))

// Short commit hash: Vercel exposes it as an env var (shallow clones make git
// unreliable there); locally fall back to git, then to 'dev'.
function commitSha(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf-8' }).trim()
  } catch {
    return 'dev'
  }
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
    __COMMIT_SHA__: JSON.stringify(commitSha()),
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'inline',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'LifeFlow',
        short_name: 'LifeFlow',
        description: 'Personal planner — goals, streaks, calendar, and coaching',
        theme_color: '#FAF9F5',
        background_color: '#FAF9F5',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // App shell + assets are precached; Supabase/Anthropic API calls always hit the network
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
        // The marketing page at /landing is a separate 1.9MB static document —
        // keep it out of the app's precache and out of the SPA navigation
        // fallback (otherwise the SW serves the app shell at /landing).
        globIgnores: ['landing/**'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/landing/],
        // Web Push + notification-click handlers live outside the generated SW
        importScripts: ['push-sw.js'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
