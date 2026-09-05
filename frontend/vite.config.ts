import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // Force a single React copy — echarts-for-react declares ^18 peer dep,
      // but the app uses React 19.  Multiple copies cause React #310
      // ("hooks dispatcher not found").
      'react': path.resolve(__dirname, './node_modules/react'),
      'react-dom': path.resolve(__dirname, './node_modules/react-dom'),
      'react/jsx-runtime': path.resolve(__dirname, './node_modules/react'),
    },
    // Also resolve within nested node_modules (e.g. deep dependencies).
    dedupe: ['react', 'react-dom'],
  },
  optimizeDeps: {
    include: ['react', 'react/jsx-runtime', 'react-dom'],
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    testTimeout: 10000,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8090',
        changeOrigin: true,
      },
      '/metrics': {
        target: 'http://localhost:8090',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:8090',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Route ALL node_modules into a single vendor chunk so React
        // (hooks dispatcher) is present in exactly one place.
        // Previously only 'react' was isolated in 'react-vendor' but
        // Vite still bundled a second React copy into index.js — that
        // second copy has its own dispatcher which lazy-loaded pages
        // (PipelinesPage etc.) end up calling, producing React #310.
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            return 'vendor';
          }
        },
      },
    },
  },
})
