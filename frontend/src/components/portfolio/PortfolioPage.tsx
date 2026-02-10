/**
 * Portfolio Page
 *
 * Main portfolio view. Activates usePortfolio hook for multi-chain fetching,
 * syncs to portfolioStore, renders PortfolioHeader + PortfolioTokenTable + ActivityPanel.
 * Supports snapshot hydration for instant load.
 */

import { useEffect, useCallback } from 'react';
import { useWalletStore } from '@/stores/walletStore';
import { usePortfolioStore, isSnapshotValid } from '@/stores/portfolioStore';
import { usePortfolio } from '@/hooks/usePortfolio';
import { PortfolioHeader } from './PortfolioHeader';
import { PortfolioTokenTable } from './PortfolioTokenTable';
import { ActivityPanel } from './ActivityPanel';
import type { SwapRecord } from '@/stores/swapHistoryStore';
import type { PortfolioChain } from '@/services/portfolioTypes';

interface PortfolioPageProps {
  onSwapToken?: (symbol: string, chainId: number) => void;
  onRepeatSwap?: (record: SwapRecord) => void;
}

/** Auto-refresh interval: 30 seconds */
const REFRESH_INTERVAL = 30_000;

export function PortfolioPage({ onSwapToken, onRepeatSwap }: PortfolioPageProps) {
  const { address, isConnected } = useWalletStore();
  const store = usePortfolioStore();

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

  // Sync hook state → store
  useEffect(() => {
    if (portfolio) {
      store.setPortfolio(portfolio);
      store.clearErrors();

      // Set per-chain errors if any
      for (const [chain, balance] of Object.entries(portfolio.chains)) {
        if (balance?.error) {
          store.setChainError(chain as PortfolioChain, balance.error);
        }
      }
    }
  }, [portfolio]);

  useEffect(() => {
    store.setLoading(isLoading);
  }, [isLoading]);

  useEffect(() => {
    if (error && errorDetails) {
      // Global error — mark all chains
      if (errorDetails.category === 'network') {
        store.setChainError('ethereum', error);
      }
    }
  }, [error, errorDetails]);

  // Hydrate from snapshot on first mount (instant UI)
  useEffect(() => {
    if (!store.portfolio && store.snapshot && isSnapshotValid(store.snapshotAt)) {
      store.setPortfolio(store.snapshot);
    }
  }, []);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!isConnected || !address) return;

    const interval = setInterval(() => {
      fetchPortfolio();
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [isConnected, address, fetchPortfolio]);

  // Clear store on disconnect
  useEffect(() => {
    if (!isConnected) {
      store.clear();
    }
  }, [isConnected]);

  const handleRefresh = useCallback(() => {
    fetchPortfolio();
  }, [fetchPortfolio]);

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

      {/* Footer */}
      <div className="text-center text-[11px] text-dark-500 pb-4">
        <p>Balances auto-refresh every 30s. Prices from CoinGecko.</p>
        <p className="mt-1">All data is read-only. Your keys never leave your wallet.</p>
      </div>
    </div>
  );
}

export default PortfolioPage;
