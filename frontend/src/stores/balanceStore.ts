/**
 * Balance State Store
 *
 * Caches wallet balances fetched from blockchain.
 */

import { create } from 'zustand';
import type { TokenBalance, WalletBalanceResponse } from '@/types/api';
import { balancesApi } from '@/api';

interface BalanceState {
  // Balances by chain
  balances: Record<string, WalletBalanceResponse>;

  // Loading state
  isLoading: boolean;
  lastUpdated: number | null;

  // Total portfolio value
  totalUsdValue: string | null;

  // Actions
  fetchBalances: (address: string, chains: string[]) => Promise<void>;
  fetchChainBalance: (address: string, chain: string) => Promise<void>;
  clearBalances: () => void;
  getTokenBalance: (chain: string, symbol: string) => TokenBalance | null;
}

export const useBalanceStore = create<BalanceState>((set, get) => ({
  // Initial state
  balances: {},
  isLoading: false,
  lastUpdated: null,
  totalUsdValue: null,

  // Fetch balances for multiple chains
  fetchBalances: async (address: string, chains: string[]) => {
    set({ isLoading: true });

    try {
      const response = await balancesApi.getMultiChainBalance({
        address,
        chains,
        include_tokens: true,
      });

      const balanceMap: Record<string, WalletBalanceResponse> = {};
      for (const chainBalance of response.chain_balances) {
        balanceMap[chainBalance.chain] = chainBalance;
      }

      set({
        balances: balanceMap,
        isLoading: false,
        lastUpdated: Date.now(),
        totalUsdValue: response.total_usd_value || null,
      });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  // Fetch balance for single chain
  fetchChainBalance: async (address: string, chain: string) => {
    set({ isLoading: true });

    try {
      const response = await balancesApi.getWalletBalance({
        address,
        chain,
        include_tokens: true,
      });

      set((state) => ({
        balances: {
          ...state.balances,
          [chain]: response,
        },
        isLoading: false,
        lastUpdated: Date.now(),
      }));
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  // Clear all balances
  clearBalances: () => {
    set({
      balances: {},
      lastUpdated: null,
      totalUsdValue: null,
    });
  },

  // Get specific token balance
  getTokenBalance: (chain: string, symbol: string) => {
    const { balances } = get();
    const chainBalances = balances[chain];

    if (!chainBalances) return null;

    // Check native balance
    if (chainBalances.native_balance.symbol === symbol) {
      return chainBalances.native_balance;
    }

    // Check token balances
    return chainBalances.token_balances.find((t) => t.symbol === symbol) || null;
  },
}));

export default useBalanceStore;
