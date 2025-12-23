/**
 * Balances Hook
 *
 * Provides balance fetching and caching functionality.
 */

import { useCallback, useEffect } from 'react';
import { useWalletStore } from '@/stores/walletStore';
import { useBalanceStore } from '@/stores/balanceStore';

const DEFAULT_CHAINS = ['ethereum', 'bsc', 'polygon'];
const REFRESH_INTERVAL = 30000; // 30 seconds

export function useBalances(autoRefresh: boolean = true) {
  const { address, isConnected, chainId } = useWalletStore();
  const {
    balances,
    isLoading,
    lastUpdated,
    totalUsdValue,
    hideZeroBalances,
    fetchBalances,
    fetchChainBalance,
    clearBalances,
    getTokenBalance,
    setHideZeroBalances,
    getVisibleTokens,
  } = useBalanceStore();

  // Refresh balances
  const refresh = useCallback(async () => {
    if (!address) return;
    await fetchBalances(address, DEFAULT_CHAINS);
  }, [address, fetchBalances]);

  // Refresh single chain
  const refreshChain = useCallback(
    async (chain: string) => {
      if (!address) return;
      await fetchChainBalance(address, chain);
    },
    [address, fetchChainBalance]
  );

  // Get current chain balances
  const currentChainBalances = useCallback(() => {
    const chainName = getChainName(chainId);
    return balances[chainName] || null;
  }, [balances, chainId]);

  // Auto-refresh on mount and interval
  useEffect(() => {
    if (!isConnected || !address) {
      clearBalances();
      return;
    }

    // Initial fetch
    refresh();

    // Set up interval if autoRefresh is enabled
    if (autoRefresh) {
      const interval = setInterval(refresh, REFRESH_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [isConnected, address, autoRefresh, refresh, clearBalances]);

  return {
    balances,
    isLoading,
    lastUpdated,
    totalUsdValue,
    hideZeroBalances,
    currentChainBalances: currentChainBalances(),
    refresh,
    refreshChain,
    getTokenBalance,
    setHideZeroBalances,
    getVisibleTokens,
  };
}

// Helper to get chain name from chain ID
function getChainName(chainId: number): string {
  const chainMap: Record<number, string> = {
    1: 'ethereum',
    56: 'bsc',
    137: 'polygon',
    42161: 'arbitrum',
    10: 'optimism',
    43114: 'avalanche',
  };
  return chainMap[chainId] || 'ethereum';
}

export default useBalances;
