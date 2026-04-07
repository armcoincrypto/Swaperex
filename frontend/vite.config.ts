/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Conservative vendor chunks for cache + parallel load. Does not change module graph or execution order.
 * Paths normalized for Windows + POSIX Rollup `id` values.
 */
function vendorManualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined;
  const normalized = id.split(path.sep).join('/');
  if (normalized.includes('/node_modules/ethers/')) return 'vendor-ethers';
  if (normalized.includes('/node_modules/@reown/')) return 'vendor-reown';
  if (normalized.includes('/node_modules/@walletconnect/')) return 'vendor-walletconnect';
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
