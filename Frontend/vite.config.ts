import { defineConfig } from 'vite'
import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// https://vite.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
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
    sourcemap: false,
  },
  server: {
    host: '0.0.0.0',
    port: 5174,
    strictPort: false,
    allowedHosts: [
      'articlecreation.v2retail.net',
      'localhost',
      '192.168.148.235',
    ],
    // Proxy /api requests to the production backend so the Vite dev server
    // forwards them server-side — no browser CORS issue regardless of which
    // host/IP the frontend is accessed from on the local network.
    proxy: {
      '/api': {
        target: 'https://articlecreation-api.v2retail.net',
        changeOrigin: true,
        secure: true,
      }
    }
  }
})
