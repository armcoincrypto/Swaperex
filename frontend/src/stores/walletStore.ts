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
import { SUPPORTED_CHAIN_IDS } from '@/utils/constants';

interface WalletState {
  // Connection state
  isConnected: boolean;
  isConnecting: boolean;
  isWrongChain: boolean;
  isReadOnly: boolean;
  address: string | null;
  chainId: number;
  walletType: WalletType | null;
  session: WalletSession | null;

  // Error state
  connectionError: string | null;

  // Available chains
  supportedChains: ChainInfo[];
  supportedChainIds: number[];

  // Actions
  connect: (address: string, chainId: number, walletType: WalletType) => Promise<void>;
  disconnect: () => Promise<void>;
  switchChain: (chainId: number) => Promise<void>;
  updateChainId: (chainId: number) => void;
  setSupportedChains: (chains: ChainInfo[]) => void;
  setConnecting: (connecting: boolean) => void;
  setReadOnlyAddress: (address: string) => void;
  setConnectionError: (error: string | null) => void;
  clearError: () => void;
}

/**
 * Check if chain ID is supported
 */
function isChainSupported(chainId: number, supportedIds: number[]): boolean {
  return supportedIds.includes(chainId);
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      // Initial state
      isConnected: false,
      isConnecting: false,
      isWrongChain: false,
      isReadOnly: false,
      address: null,
      chainId: 1,
      walletType: null,
      session: null,
      connectionError: null,
      supportedChains: [],
      supportedChainIds: SUPPORTED_CHAIN_IDS,

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
            const { supportedChainIds } = get();
            const wrongChain = !isChainSupported(chainId, supportedChainIds);

            set({
              isConnected: true,
              isConnecting: false,
              isWrongChain: wrongChain,
              isReadOnly: false,
              address,
              chainId,
              walletType,
              session: response.session,
              connectionError: null,
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
          isWrongChain: false,
          isReadOnly: false,
          address: null,
          chainId: 1,
          walletType: null,
          session: null,
          connectionError: null,
        });
      },

      // Switch chain (request to wallet + notify backend)
      switchChain: async (chainId: number) => {
        const { address, supportedChainIds } = get();

        if (!address) {
          throw new Error('Not connected');
        }

        try {
          await walletApi.switchChain(address, chainId);
          const wrongChain = !isChainSupported(chainId, supportedChainIds);
          set({ chainId, isWrongChain: wrongChain });
        } catch (error) {
          console.error('Chain switch failed:', error);
          throw error;
        }
      },

      // Update chain ID (called when wallet emits chainChanged event)
      updateChainId: (chainId: number) => {
        const { supportedChainIds } = get();
        const wrongChain = !isChainSupported(chainId, supportedChainIds);
        set({ chainId, isWrongChain: wrongChain });
      },

      // Set supported chains
      setSupportedChains: (chains: ChainInfo[]) => {
        const chainIds = chains.map((c) => c.chain_id);
        const { chainId, isConnected } = get();
        const wrongChain = isConnected && !chainIds.includes(chainId);

        set({
          supportedChains: chains,
          supportedChainIds: chainIds,
          isWrongChain: wrongChain,
        });
      },

      // Set connecting state
      setConnecting: (connecting: boolean) => {
        set({ isConnecting: connecting });
      },

      // Set read-only address (view-only mode)
      setReadOnlyAddress: (address: string) => {
        set({
          isConnected: true,
          isConnecting: false,
          isWrongChain: false,
          isReadOnly: true,
          address,
          chainId: 1,
          walletType: 'readonly' as WalletType,
          session: null,
          connectionError: null,
        });
      },

      // Set connection error
      setConnectionError: (error: string | null) => {
        set({ connectionError: error, isConnecting: false });
      },

      // Clear error
      clearError: () => {
        set({ connectionError: null });
      },
    }),
    {
      name: 'swaperex-wallet',
      partialize: (state) => ({
        // Only persist these fields (public data only)
        address: state.address,
        chainId: state.chainId,
        walletType: state.walletType,
        isReadOnly: state.isReadOnly,
      }),
    }
  )
);

export default useWalletStore;
