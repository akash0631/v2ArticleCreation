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
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        // Split ONLY React-free heavy libs into their own chunks (these are
        // large and lazy-loaded for the export features). Everything that
        // depends on React — including react/react-dom itself, Radix, router,
        // react-query, recharts, motion, icons — MUST stay in ONE chunk.
        //
        // Why: isolating `react` into its own chunk while leaving React-consuming
        // libraries in the catch-all `vendor` chunk caused a hard production
        // crash — "Cannot read properties of undefined (reading 'createContext')"
        // — because the vendor chunk evaluated `React.createContext` before its
        // cross-chunk React reference had resolved. Co-locating React with its
        // consumers makes that impossible.
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;
          // React-free, large, lazy-loaded → safe to isolate.
          if (id.includes('/exceljs/')) return 'vendor-exceljs';
          if (id.includes('/xlsx/')) return 'vendor-xlsx';
          // React + every React-dependent library live together here.
          return 'vendor';
        },
      },
    },
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
