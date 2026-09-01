import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const DJANGO = 'http://127.0.0.1:8000'

export default defineConfig(({ command }) => ({
  // Django serves the built bundles through staticfiles, which lives under
  // /static/. The dev server has no such prefix, so only the build takes it.
  base: command === 'build' ? '/static/' : '/',
  plugins: [react()],
  server: {
    port: 5173,
    // Same-origin in the browser's eyes, which is what the session and CSRF
    // cookies need: no CORS, no tokens, nothing to configure in Django.
    proxy: {
      '/api': { target: DJANGO, changeOrigin: false },
      '/admin': { target: DJANGO, changeOrigin: false },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
}))
