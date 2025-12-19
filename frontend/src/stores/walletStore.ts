/**
 * Wallet State Store
 *
 * Manages connected wallet state using Zustand.
 * NEVER stores private keys - only public address.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { WalletSession, WalletType, ChainInfo } from '@/types/api';
import { walletApi } from '@/api';

interface WalletState {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  address: string | null;
  chainId: number;
  walletType: WalletType | null;
  session: WalletSession | null;

  // Available chains
  supportedChains: ChainInfo[];

  // Actions
  connect: (address: string, chainId: number, walletType: WalletType) => Promise<void>;
  disconnect: () => Promise<void>;
  switchChain: (chainId: number) => Promise<void>;
  setSupportedChains: (chains: ChainInfo[]) => void;
  setConnecting: (connecting: boolean) => void;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      // Initial state
      isConnected: false,
      isConnecting: false,
      address: null,
      chainId: 1,
      walletType: null,
      session: null,
      supportedChains: [],

      // Connect wallet
      connect: async (address: string, chainId: number, walletType: WalletType) => {
        set({ isConnecting: true });

        try {
          // Register with backend
          const response = await walletApi.connectWallet({
            address,
            chain_id: chainId,
            wallet_type: walletType,
          });

          if (response.success && response.session) {
            set({
              isConnected: true,
              isConnecting: false,
              address,
              chainId,
              walletType,
              session: response.session,
            });
          } else {
            throw new Error(response.error || 'Failed to connect');
          }
        } catch (error) {
          set({ isConnecting: false });
          throw error;
        }
      },

      // Disconnect wallet
      disconnect: async () => {
        const { address } = get();

        if (address) {
          try {
            await walletApi.disconnectWallet(address);
          } catch (error) {
            console.warn('Backend disconnect failed:', error);
          }
        }

        set({
          isConnected: false,
          address: null,
          chainId: 1,
          walletType: null,
          session: null,
        });
      },

      // Switch chain
      switchChain: async (chainId: number) => {
        const { address } = get();

        if (!address) {
          throw new Error('Not connected');
        }

        try {
          await walletApi.switchChain(address, chainId);
          set({ chainId });
        } catch (error) {
          console.error('Chain switch failed:', error);
          throw error;
        }
      },

      // Set supported chains
      setSupportedChains: (chains: ChainInfo[]) => {
        set({ supportedChains: chains });
      },

      // Set connecting state
      setConnecting: (connecting: boolean) => {
        set({ isConnecting: connecting });
      },
    }),
    {
      name: 'swaperex-wallet',
      partialize: (state) => ({
        // Only persist these fields
        address: state.address,
        chainId: state.chainId,
        walletType: state.walletType,
      }),
    }
  )
);

export default useWalletStore;
