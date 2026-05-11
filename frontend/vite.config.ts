/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Vendor chunks for cache + parallel load. @reown/* and @walletconnect/* share one chunk to match
 * their coupled dependency graph (avoids Rollup circular chunk warnings when split separately).
 *
 * React / scheduler / use-sync-external-store must NOT share a chunk with Reown/WC — otherwise
 * Rollup hoists React bindings into vendor-reown-walletconnect and the entry bundle statically
 * imports the ~4MB wallet vendor on cold load.
 */
function vendorManualChunks(id: string): string | undefined {
  // Vite injects `\0vite/preload-helper.js` for wrapped dynamic imports. If it lands in the same
  // Rollup chunk as @reown, the entry file imports vendor-reown-walletconnect only for __vitePreload.
  if (id === '\0vite/preload-helper.js' || id.includes('vite/preload-helper')) return 'vendor-react';
  if (!id.includes('node_modules')) return undefined;
  const normalized = id.split(path.sep).join('/');
  if (normalized.includes('/node_modules/ethers/')) return 'vendor-ethers';
  if (normalized.includes('/node_modules/react-dom/')) return 'vendor-react';
  if (normalized.includes('/node_modules/react/')) return 'vendor-react';
  if (normalized.includes('/node_modules/scheduler/')) return 'vendor-react';
  if (normalized.includes('/node_modules/use-sync-external-store/')) return 'vendor-react';
  if (normalized.includes('/node_modules/@reown/')) return 'vendor-reown-walletconnect';
  if (normalized.includes('/node_modules/@walletconnect/')) return 'vendor-reown-walletconnect';
  return undefined;
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Intentionally no `dedupe: ['ox']` — Vite fails resolving nested `ox` (missing "./erc8010" export).
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@api': path.resolve(__dirname, './src/api'),
      '@components': path.resolve(__dirname, './src/components'),
      '@hooks': path.resolve(__dirname, './src/hooks'),
      '@stores': path.resolve(__dirname, './src/stores'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@types': path.resolve(__dirname, './src/types'),
    },
  },
  server: {
    port: 3000,
    proxy: {
      '/api/v1/admin': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: vendorManualChunks,
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
});
