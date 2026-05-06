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

import { useEffect, useCallback, useRef, useMemo, useState } from 'react';
import { useWalletStore } from '@/stores/walletStore';
import { usePortfolioStore } from '@/stores/portfolioStore';
import { usePortfolio } from '@/hooks/usePortfolio';
import { PortfolioHeader } from './PortfolioHeader';
import { PortfolioTokenTable } from './PortfolioTokenTable';
import { ActivityPanel } from './ActivityPanel';
import { RevenuePanel } from './RevenuePanel';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import type { SwapRecord } from '@/stores/swapHistoryStore';
import { isDebugMode } from '@/utils/chainHealth';

interface PortfolioPageProps {
  onSwapToken?: (symbol: string, chainId: number) => void;
  onRepeatSwap?: (record: SwapRecord) => void;
}

/** Auto-refresh interval: 30 seconds */
const REFRESH_INTERVAL = 30_000;

/** Stable chain list — avoids new array reference on every render */
const PORTFOLIO_EVM_CHAINS: ['ethereum', 'bsc', 'polygon'] = ['ethereum', 'bsc', 'polygon'];

type PortfolioSubTab = 'activity' | 'revenue';

export function PortfolioPage({ onSwapToken, onRepeatSwap }: PortfolioPageProps) {
  const [portfolioSubTab, setPortfolioSubTab] = useState<PortfolioSubTab>('activity');
  // Individual selectors — only re-render when address/connection changes, NOT chainId
  const address = useWalletStore((s) => s.address);
  const isConnected = useWalletStore((s) => s.isConnected);

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
    evmChains: PORTFOLIO_EVM_CHAINS,
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

      {/* Activity vs Revenue (local / commission estimates) */}
      <div
        className="grid grid-cols-2 gap-2 w-full rounded-2xl border border-white/[0.08] bg-dark-900/70 p-1.5"
        role="tablist"
        aria-label="Portfolio sections"
      >
        {(['activity', 'revenue'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={portfolioSubTab === t}
            onClick={() => setPortfolioSubTab(t)}
            className={`min-w-0 rounded-xl px-3 py-2.5 text-left transition-all duration-200 ${
              portfolioSubTab === t
                ? 'bg-electro-panel text-white shadow-md ring-1 ring-white/[0.12]'
                : 'text-dark-400 hover:text-dark-200 hover:bg-dark-800/50'
            }`}
          >
            <span className="block text-sm font-semibold leading-tight">
              {t === 'activity' ? 'Activity' : 'Revenue'}
            </span>
            <span
              className={`mt-0.5 block text-[11px] font-normal leading-snug ${
                portfolioSubTab === t ? 'text-dark-200/90' : 'text-dark-500'
              }`}
            >
              {t === 'activity' ? 'Swaps & transfers' : 'Commission estimates'}
            </span>
          </button>
        ))}
      </div>

      {portfolioSubTab === 'activity' ? (
        <ActivityPanel onRepeatSwap={onRepeatSwap} />
      ) : (
        <RevenuePanel />
      )}

      {/* Diagnostics (debug mode only: ?debug=1) */}
      {debugMode && <DiagnosticsPanel />}

      {/* Footer */}
      <div className="text-center text-[11px] text-dark-500 pb-4 leading-relaxed max-w-md mx-auto">
        Balances refresh about every 30s (CoinGecko prices). Read-only — keys stay in your wallet.
      </div>
    </div>
  );
}

export default PortfolioPage;
