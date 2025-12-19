/**
 * Quote Hook
 *
 * Provides quote fetching with debouncing and polling.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useWalletStore } from '@/stores/walletStore';
import { useSwapStore } from '@/stores/swapStore';

const DEBOUNCE_MS = 500;
const POLL_INTERVAL = 15000; // 15 seconds

export function useQuote(enablePolling: boolean = true) {
  const { address } = useWalletStore();
  const {
    fromAsset,
    toAsset,
    fromAmount,
    quote,
    isQuoting,
    quoteError,
    fetchQuote,
    clearQuote,
  } = useSwapStore();

  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced quote fetch
  const debouncedFetch = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      if (address && fromAsset && toAsset && fromAmount) {
        fetchQuote(address);
      }
    }, DEBOUNCE_MS);
  }, [address, fromAsset, toAsset, fromAmount, fetchQuote]);

  // Trigger quote fetch when inputs change
  useEffect(() => {
    if (!fromAsset || !toAsset || !fromAmount || parseFloat(fromAmount) <= 0) {
      clearQuote();
      return;
    }

    debouncedFetch();

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [fromAsset, toAsset, fromAmount, debouncedFetch, clearQuote]);

  // Quote polling
  useEffect(() => {
    if (!enablePolling || !quote || !address) {
      return;
    }

    pollRef.current = setInterval(() => {
      fetchQuote(address);
    }, POLL_INTERVAL);

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [enablePolling, quote, address, fetchQuote]);

  // Manual refresh
  const refresh = useCallback(() => {
    if (address) {
      fetchQuote(address);
    }
  }, [address, fetchQuote]);

  return {
    quote,
    isQuoting,
    quoteError,
    refresh,
  };
}

export default useQuote;
