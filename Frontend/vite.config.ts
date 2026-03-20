import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Sentry plugin for source maps (only in production builds)
    process.env.NODE_ENV === 'production' && sentryVitePlugin({
      org: process.env.VITE_SENTRY_ORG,
      project: process.env.VITE_SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: {
        assets: './dist/**',
      },
      telemetry: false,
    }),
  ].filter(Boolean),
  worker: {
    format: 'es'
  },
  define: {
    'import.meta.env.VITE_WORKER_SUPPORT': JSON.stringify(true)
  },
  build: {
    sourcemap: true, // Enable source maps for Sentry
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: [
      'articlecreation.v2retail.net',
      'www.articlecreation.v2retail.net',
      'localhost',
      '127.0.0.1',
      '192.168.151.46',
      '.trycloudflare.com' // Allow all Cloudflare tunnel URLs
    ]
  }
})
