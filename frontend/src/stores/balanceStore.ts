/**
 * Balance State Store
 *
 * Fetches wallet balances directly from blockchain RPCs.
 * No backend required - fully non-custodial.
 */

import { create } from 'zustand';
import { JsonRpcProvider, formatEther } from 'ethers';

// Chain RPC endpoints
const RPC_URLS: Record<string, string> = {
  ethereum: 'https://eth.llamarpc.com',
  bsc: 'https://bsc-dataseed.binance.org',
  polygon: 'https://polygon-rpc.com',
};

// Chain native token info
const NATIVE_TOKENS: Record<string, { symbol: string; decimals: number }> = {
  ethereum: { symbol: 'ETH', decimals: 18 },
  bsc: { symbol: 'BNB', decimals: 18 },
  polygon: { symbol: 'MATIC', decimals: 18 },
};

interface TokenBalance {
  symbol: string;
  balance: string;
  decimals: number;
}

interface ChainBalance {
  chain: string;
  native_balance: TokenBalance;
  token_balances: TokenBalance[];
}

interface BalanceState {
  // Balances by chain
  balances: Record<string, ChainBalance>;

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
      const balanceMap: Record<string, ChainBalance> = {};

      // Fetch all chains in parallel
      await Promise.all(
        chains.map(async (chain) => {
          try {
            const rpcUrl = RPC_URLS[chain];
            const nativeToken = NATIVE_TOKENS[chain];

            if (!rpcUrl || !nativeToken) {
              console.warn(`[Balance] Unknown chain: ${chain}`);
              return;
            }

            const provider = new JsonRpcProvider(rpcUrl);
            const balanceWei = await provider.getBalance(address);
            const balance = formatEther(balanceWei);

            balanceMap[chain] = {
              chain,
              native_balance: {
                symbol: nativeToken.symbol,
                balance,
                decimals: nativeToken.decimals,
              },
              token_balances: [], // TODO: Add ERC20 token fetching
            };
          } catch (err) {
            console.warn(`[Balance] Failed to fetch ${chain} balance:`, err);
          }
        })
      );

      set({
        balances: balanceMap,
        isLoading: false,
        lastUpdated: Date.now(),
      });
    } catch (error) {
      set({ isLoading: false });
      console.error('[Balance] Failed to fetch balances:', error);
    }
  },

  // Fetch balance for single chain
  fetchChainBalance: async (address: string, chain: string) => {
    set({ isLoading: true });

    try {
      const rpcUrl = RPC_URLS[chain];
      const nativeToken = NATIVE_TOKENS[chain];

      if (!rpcUrl || !nativeToken) {
        console.warn(`[Balance] Unknown chain: ${chain}`);
        set({ isLoading: false });
        return;
      }

      const provider = new JsonRpcProvider(rpcUrl);
      const balanceWei = await provider.getBalance(address);
      const balance = formatEther(balanceWei);

      set((state) => ({
        balances: {
          ...state.balances,
          [chain]: {
            chain,
            native_balance: {
              symbol: nativeToken.symbol,
              balance,
              decimals: nativeToken.decimals,
            },
            token_balances: [],
          },
        },
        isLoading: false,
        lastUpdated: Date.now(),
      }));
    } catch (error) {
      set({ isLoading: false });
      console.error(`[Balance] Failed to fetch ${chain} balance:`, error);
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
