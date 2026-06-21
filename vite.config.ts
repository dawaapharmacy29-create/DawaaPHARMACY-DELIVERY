import { defineConfig } from 'vite'
// ⚠️ IMPORTANT: This project uses @vitejs/plugin-react-swc (NOT @vitejs/plugin-react)
// Do NOT change this import — @vitejs/plugin-react is not installed in this project.
// @vitejs/plugin-react-swc is the Rust-based SWC compiler and is the only available plugin.
import react from '@vitejs/plugin-react-swc'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': '/src' },
  },
  build: {
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Vendor chunks — only loaded when needed
          if (id.includes('node_modules/react') || id.includes('node_modules/react-dom') || id.includes('node_modules/react-router-dom')) {
            return 'react-vendor'
          }
          if (id.includes('node_modules/@supabase')) {
            return 'supabase'
          }
          // xlsx is heavy (325KB) — put in its own chunk, loaded lazily
          if (id.includes('node_modules/xlsx')) {
            return 'xlsx'
          }
          if (id.includes('node_modules/lucide-react') || id.includes('node_modules/sonner')) {
            return 'ui'
          }
          // Admin pages together — riders don't need them
          if (id.includes('src/pages/admin/')) {
            return 'admin-pages'
          }
        },
      },
    },
  },
})
