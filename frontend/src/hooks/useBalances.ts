/**
 * Balances Hook
 *
 * Provides balance fetching and caching functionality.
 */

import { useCallback, useEffect } from 'react';
import { useWalletStore } from '@/stores/walletStore';
import { useBalanceStore } from '@/stores/balanceStore';

/** Default chains for sidebar / swap balance refresh (Polygon only when connected on Polygon). */
const DEFAULT_CHAINS = ['ethereum', 'bsc'];
const REFRESH_INTERVAL = 30000; // 30 seconds

const POLYGON_CHAIN_ID = 137;

/**
 * Initial `fetchBalances` list after connect: Ethereum + BSC only, plus Polygon when wallet is on Polygon.
 */
export function getWalletBootstrapBalanceChains(chainId: number | null | undefined): string[] {
  const chains = [...DEFAULT_CHAINS];
  if (chainId === POLYGON_CHAIN_ID) chains.push('polygon');
  return chains;
}

/** Map wallet chainId → balanceStore chain key (must match balanceStore RPC keys). */
export function getBalanceChainName(chainId: number): string | null {
  const chainMap: Record<number, string> = {
    1: 'ethereum',
    56: 'bsc',
    137: 'polygon',
    42161: 'arbitrum',
    10: 'optimism',
    43114: 'avalanche',
    100: 'gnosis',
    250: 'fantom',
    8453: 'base',
  };
  return chainMap[chainId] ?? null;
}

export function useBalances(autoRefresh: boolean = true) {
  const { address, isConnected, chainId } = useWalletStore();
  const {
    balances,
    chainStatus,
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

  const chainsToFetch = useCallback(() => {
    const current = getBalanceChainName(chainId);
    const set = new Set<string>(DEFAULT_CHAINS);
    if (current) set.add(current);
    return [...set];
  }, [chainId]);

  // Refresh balances
  const refresh = useCallback(async () => {
    if (!address) return;
    const list = chainsToFetch();
    const cur = getBalanceChainName(chainId);
    const needSpinner = !!(cur && !useBalanceStore.getState().balances[cur]);
    await fetchBalances(address, list, { loading: needSpinner ? 'always' : 'auto' });
  }, [address, chainId, fetchBalances, chainsToFetch]);

  // Refresh single chain
  const refreshChain = useCallback(
    async (chain: string) => {
      if (!address) return;
      await fetchChainBalance(address, chain);
    },
    [address, fetchChainBalance]
  );

  // Get current chain balances
  const currentChainKey = getBalanceChainName(chainId);
  const currentChainBalances = currentChainKey ? balances[currentChainKey] ?? null : null;

  const currentChainFetchStatus = currentChainKey ? chainStatus[currentChainKey] ?? 'idle' : 'idle';

  /**
   * True while this chain has no settled fetch yet: first paint before `fetchBalances`,
   * or an in-flight refresh (`loading`). Do not infer from global `isLoading` alone.
   */
  const balancesPendingForCurrentChain =
    isConnected &&
    !!address &&
    !!currentChainKey &&
    (currentChainFetchStatus === 'loading' ||
      (currentChainFetchStatus === 'idle' && !balances[currentChainKey]));

  /** Connected on a chain we don't map to RPC balance fetch (e.g. unsupported testnet). */
  const currentChainUnsupported = isConnected && !!address && currentChainKey === null;

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
  }, [isConnected, address, chainId, autoRefresh, refresh, clearBalances]);

  return {
    balances,
    chainStatus,
    currentChainFetchStatus,
    isLoading,
    lastUpdated,
    totalUsdValue,
    hideZeroBalances,
    currentChainBalances,
    balancesPendingForCurrentChain,
    currentChainUnsupported,
    currentChainKey,
    refresh,
    refreshChain,
    getTokenBalance,
    setHideZeroBalances,
    getVisibleTokens,
  };
}

export default useBalances;
