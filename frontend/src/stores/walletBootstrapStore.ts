/**
 * When true, the lazy WalletBootstrap chunk (Reown AppKit + bridge) is mounted once at app root.
 */

import { create } from 'zustand';
import { hasWalletConnectStorageHint } from '@/services/wallet/appKitActionsRegistry';

export const useWalletBootstrapStore = create<{
  needed: boolean;
  request: () => void;
}>((set) => ({
  needed: typeof window !== 'undefined' && hasWalletConnectStorageHint(),
  request: () => set({ needed: true }),
}));
