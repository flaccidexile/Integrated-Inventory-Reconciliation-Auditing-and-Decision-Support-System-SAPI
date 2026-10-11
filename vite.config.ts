import { defineConfig } from 'vite'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [
    // The React and Tailwind plugins are both required for Make, even if
    // Tailwind is not being actively used – do not remove them
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/app'),
    },
  },
  optimizeDeps: {
    // `recharts` is reachable only through `React.lazy(() => import(...))` in
    // DashboardPage and AnalyticsPage. When the dependency scanner misses it,
    // Vite does not pre-bundle it, and the first dynamic import at runtime
    // triggers an on-demand optimize that the browser sees as a 504 on
    // `/node_modules/.vite/deps/recharts.js`. The lazy page then fails with
    // "Failed to fetch dynamically imported module" and, before the error
    // boundary existed, blanked the whole application.
    //
    // Listing it explicitly keeps it in the pre-bundled set so the chart routes
    // load from a warm cache on first paint.
    include: ['recharts'],
  },
  server: {
    // The Express API in ./server listens on 4000. Proxying keeps the browser
    // same-origin, so there is no CORS preflight in development and the client
    // can simply call "/api/...".
    proxy: {
      '/api': {
        target: process.env.API_PROXY_TARGET || 'http://127.0.0.1:4000',
        changeOrigin: true,
      },
    },
  },
})
