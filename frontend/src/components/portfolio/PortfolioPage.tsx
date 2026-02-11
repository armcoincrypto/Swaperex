/**
 * Portfolio Page
 *
 * Main portfolio view. Activates usePortfolio hook for multi-chain fetching,
 * syncs to portfolioStore, renders PortfolioHeader + PortfolioTokenTable + ActivityPanel.
 * Supports snapshot hydration for instant load.
 *
 * AUDIT FIX-1: Uses individual store selectors (no full-store subscription).
 * AUDIT FIX-3: Uses hydrateFromSnapshot (doesn't re-stamp snapshotAt).
 * AUDIT FIX-5: Guards against concurrent refresh calls.
 */

import { useEffect, useCallback, useRef, useMemo } from 'react';
import { useWalletStore } from '@/stores/walletStore';
import { usePortfolioStore } from '@/stores/portfolioStore';
import { usePortfolio } from '@/hooks/usePortfolio';
import { PortfolioHeader } from './PortfolioHeader';
import { PortfolioTokenTable } from './PortfolioTokenTable';
import { ActivityPanel } from './ActivityPanel';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import type { SwapRecord } from '@/stores/swapHistoryStore';
import { isDebugMode } from '@/utils/chainHealth';

interface PortfolioPageProps {
  onSwapToken?: (symbol: string, chainId: number) => void;
  onRepeatSwap?: (record: SwapRecord) => void;
}

/** Auto-refresh interval: 30 seconds */
const REFRESH_INTERVAL = 30_000;

export function PortfolioPage({ onSwapToken, onRepeatSwap }: PortfolioPageProps) {
  const { address, isConnected } = useWalletStore();

  // Debug mode check (cached for session)
  const debugMode = useMemo(() => isDebugMode(), []);

  // Individual selectors — only re-render when specific values change (FIX-1)
  const setPortfolio = usePortfolioStore((s) => s.setPortfolio);
  const setLoading = usePortfolioStore((s) => s.setLoading);
  const setChainError = usePortfolioStore((s) => s.setChainError);
  const hydrateFromSnapshot = usePortfolioStore((s) => s.hydrateFromSnapshot);
  const clear = usePortfolioStore((s) => s.clear);

  // Refresh guard — prevent concurrent fetches (FIX-5)
  const refreshingRef = useRef(false);
  // Track manual vs auto refresh — only manual shows spinner (prevents 30s flicker)
  const manualRefreshRef = useRef(false);

  // Activate the multi-chain portfolio hook (ETH + BSC + Polygon, no Solana)
  const {
    portfolio,
    isLoading,
    error,
    errorDetails,
    fetchPortfolio,
  } = usePortfolio(address, {
    autoFetch: true,
    includeSolana: false,
    evmChains: ['ethereum', 'bsc', 'polygon'],
    includeUsdPrices: true,
  });

  // Track loading state for refresh guard
  useEffect(() => {
    refreshingRef.current = isLoading;
    if (!isLoading) manualRefreshRef.current = false;
  }, [isLoading]);

  // Sync hook state → store (batched: setPortfolio already sets loading=false)
  useEffect(() => {
    if (portfolio) {
      setPortfolio(portfolio);
    }
  }, [portfolio, setPortfolio]);

  // Only show loading spinner for manual refreshes + initial load (not background auto-refresh)
  useEffect(() => {
    if (isLoading && manualRefreshRef.current) {
      setLoading(true);
    }
  }, [isLoading, setLoading]);

  useEffect(() => {
    if (error && errorDetails) {
      // Global error — mark all chains
      if (errorDetails.category === 'network') {
        setChainError('ethereum', error);
      }
    }
  }, [error, errorDetails, setChainError]);

  // Hydrate from snapshot on first mount — doesn't re-stamp snapshotAt (FIX-3)
  useEffect(() => {
    hydrateFromSnapshot();
  }, [hydrateFromSnapshot]);

  // Auto-refresh every 30s with concurrent guard (FIX-5)
  useEffect(() => {
    if (!isConnected || !address) return;

    const interval = setInterval(() => {
      if (!refreshingRef.current) {
        fetchPortfolio();
      }
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [isConnected, address, fetchPortfolio]);

  // Clear store on disconnect
  useEffect(() => {
    if (!isConnected) {
      clear();
    }
  }, [isConnected, clear]);

  const handleRefresh = useCallback(() => {
    if (!refreshingRef.current) {
      manualRefreshRef.current = true;
      setLoading(true);
      fetchPortfolio();
    }
  }, [fetchPortfolio, setLoading]);

  // Not connected
  if (!isConnected) {
    return (
      <div className="text-center py-16">
        <svg className="w-16 h-16 mx-auto text-dark-500 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
        <h2 className="text-2xl font-bold mb-3">Connect Your Wallet</h2>
        <p className="text-dark-400 text-sm max-w-sm mx-auto">
          Connect your wallet to view your multi-chain portfolio, token balances, and transaction history.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Portfolio Header (total value, chain chips, refresh, privacy) */}
      <PortfolioHeader onRefresh={handleRefresh} />

      {/* Token Table (multi-chain, search, sort) */}
      <PortfolioTokenTable onSwapToken={onSwapToken} />

      {/* Activity (merged local + explorer, tabs, export) */}
      <ActivityPanel onRepeatSwap={onRepeatSwap} />

      {/* Diagnostics (debug mode only: ?debug=1) */}
      {debugMode && <DiagnosticsPanel />}

      {/* Footer */}
      <div className="text-center text-[11px] text-dark-500 pb-4">
        <p>Balances auto-refresh every 30s. Prices from CoinGecko.</p>
        <p className="mt-1">All data is read-only. Your keys never leave your wallet.</p>
      </div>
    </div>
  );
}

export default PortfolioPage;
