/**
 * When true, the lazy WalletBootstrap chunk (Reown AppKit + bridge) is mounted once at app root.
 *
 * P4.4.2: Initial `needed` is always false on the client. `DexMain` defers `request()` when
 * `hasWalletConnectStorageHint()` is true so the wallet vendor chunk does not compete with
 * first paint. Explicit user flows call `request()` immediately (unchanged).
 */

import { create } from 'zustand';

export const useWalletBootstrapStore = create<{
  needed: boolean;
  request: () => void;
}>((set) => ({
  needed: false,
  request: () => set({ needed: true }),
}));
