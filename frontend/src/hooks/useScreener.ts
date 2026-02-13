/**
 * useScreener hook
 *
 * Orchestrates data fetching, filtering, sorting, and trending score
 * computation. Provides a stable token list that only changes on
 * refresh ticks (not on incremental enrichment).
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useScreenerStore } from '@/stores/screenerStore';
import {
  fetchMarketTokens,
  filterTokens,
  sortTokens,
  computeTrendingScores,
} from '@/services/screener';
import type { ScreenerToken, ScreenerChainId } from '@/services/screener/types';
import { DEFAULT_FILTERS } from '@/services/screener/types';

const REFRESH_INTERVAL = 60_000; // 60 seconds

export function useScreener() {
  const {
    mode,
    chainId,
    sortField,
    sortDir,
    isLoading,
    error,
    fromCache,
    rateLimited,
    lastUpdated,
    expandedTokenId,
    setMode,
    setChainId,
    setSort,
    setFilters,
    resetFilters,
    setLoading,
    setError,
    setFetchMeta,
    setLastUpdated,
    setExpandedTokenId,
  } = useScreenerStore();

  const filters = useScreenerStore((s) => s.filtersByChain[s.chainId] ?? DEFAULT_FILTERS);

  // Raw tokens from CoinGecko (stable reference - only updates on fetch)
  const [rawTokens, setRawTokens] = useState<ScreenerToken[]>([]);

  // AbortController for fetch cancellation
  const abortRef = useRef<AbortController | null>(null);

  // Countdown to next refresh
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000);

  // Fetch market data
  const fetchData = useCallback(
    async (chain: ScreenerChainId) => {
      // Cancel previous in-flight request
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      setLoading(true);
      setError(null);

      try {
        const perPage = mode === 'advanced' ? 100 : 50;
        const result = await fetchMarketTokens(chain, perPage, ac.signal);

        if (ac.signal.aborted) return;

        // Compute trending scores
        const scored = computeTrendingScores(result.tokens);
        setRawTokens(scored);
        setFetchMeta({
          fromCache: result.fromCache,
          rateLimited: result.rateLimited,
        });
        setLastUpdated(Date.now());
        setCountdown(REFRESH_INTERVAL / 1000);
      } catch (err) {
        if (ac.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Failed to load tokens');
      } finally {
        if (!ac.signal.aborted) {
          setLoading(false);
        }
      }
    },
    [mode, setLoading, setError, setFetchMeta, setLastUpdated],
  );

  // Fetch on mount and on chain change
  useEffect(() => {
    fetchData(chainId);
    const interval = setInterval(() => fetchData(chainId), REFRESH_INTERVAL);
    return () => {
      clearInterval(interval);
      abortRef.current?.abort();
    };
  }, [chainId, fetchData]);

  // Countdown timer
  useEffect(() => {
    const tick = setInterval(() => {
      setCountdown((c) => (c <= 1 ? REFRESH_INTERVAL / 1000 : c - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, []);

  // Apply filters + sort (memoized, only changes on rawTokens/filters/sort changes)
  const displayTokens = useMemo(() => {
    const filtered =
      mode === 'advanced' ? filterTokens(rawTokens, filters) : rawTokens;
    return sortTokens(filtered, sortField, sortDir);
  }, [rawTokens, filters, sortField, sortDir, mode]);

  const refresh = useCallback(() => fetchData(chainId), [chainId, fetchData]);

  return {
    // Data
    tokens: displayTokens,
    rawCount: rawTokens.length,
    // State
    mode,
    chainId,
    sortField,
    sortDir,
    filters,
    isLoading,
    error,
    fromCache,
    rateLimited,
    lastUpdated,
    countdown,
    expandedTokenId,
    // Actions
    setMode,
    setChainId,
    setSort,
    setFilters,
    resetFilters,
    setExpandedTokenId,
    refresh,
  };
}

export default useScreener;
