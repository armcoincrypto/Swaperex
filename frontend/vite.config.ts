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
 *
 * buffer / @noble/* are shared by @solana/web3.js and the Reown/WC graph. Assign them to
 * vendor-crypto-shared *before* vendor-reown-walletconnect so Portfolio/Solana paths do not
 * statically import the wallet vendor chunk.
 *
 * Only hoist top-level installs (e.g. node_modules/@noble/hashes). Nested copies under
 * @walletconnect/* / @reown/* / viem must stay in vendor-reown-walletconnect to avoid a
 * crypto-shared ↔ reown circular chunk and accidental Portfolio→wallet coupling.
 */
function isTopLevelNodeModuleDep(normalized: string, packageSegment: string): boolean {
  const marker = `/node_modules/${packageSegment}/`;
  if (!normalized.includes(marker)) return false;
  if (normalized.includes('/node_modules/@reown/')) return false;
  if (normalized.includes('/node_modules/@walletconnect/')) return false;
  if (normalized.includes('/node_modules/viem/node_modules/')) return false;
  // e.g. node_modules/foo/node_modules/@noble/hashes (nested duplicate, not project-root dep)
  if (/\/node_modules\/[^/]+\/node_modules\//.test(normalized)) return false;
  return true;
}

function vendorManualChunks(id: string): string | undefined {
  // Vite injects `\0vite/preload-helper.js` for wrapped dynamic imports. If it lands in the same
  // Rollup chunk as @reown, the entry file imports vendor-reown-walletconnect only for __vitePreload.
  if (id === '\0vite/preload-helper.js' || id.includes('vite/preload-helper')) return 'vendor-react';
  const normalized = id.split(path.sep).join('/');
  // Read-only portfolio types: shared by PortfolioPage and lazy solanaBalanceService (avoids circular chunk).
  if (normalized.includes('/src/services/portfolioTypes')) return 'portfolio-shared';
  if (!id.includes('node_modules')) return undefined;
  if (isTopLevelNodeModuleDep(normalized, 'buffer')) return 'vendor-crypto-shared';
  if (isTopLevelNodeModuleDep(normalized, '@noble/curves')) return 'vendor-crypto-shared';
  if (isTopLevelNodeModuleDep(normalized, '@noble/hashes')) return 'vendor-crypto-shared';
  // @solana/web3.js → rpc-websockets; hoist only the project-root copy (WC has its own JSON-RPC stack).
  if (isTopLevelNodeModuleDep(normalized, 'rpc-websockets')) return 'vendor-crypto-shared';
  if (isTopLevelNodeModuleDep(normalized, 'eventemitter3')) return 'vendor-crypto-shared';
  if (isTopLevelNodeModuleDep(normalized, 'encode-utf8')) return 'vendor-crypto-shared';
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
