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
import { PortfolioIntelligenceCenter } from './intelligence/PortfolioIntelligenceCenter';
import { PortfolioTokenTable } from './PortfolioTokenTable';
import { ActivityPanel } from './ActivityPanel';
import { RevenuePanel } from './RevenuePanel';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { LifecycleObservabilityPanel } from '@/components/admin/LifecycleObservabilityPanel';
import { OperationalHealthPanel } from '@/components/admin/OperationalHealthPanel';
import type { SwapRecord } from '@/stores/swapHistoryStore';
import { isDebugMode } from '@/utils/chainHealth';
import { resolveAdminApiToken } from '@/utils/adminApi';
import { ShellEmptyState, ShellAutoUpdateFooter } from '@/components/ui/ShellPrimitives';

interface PortfolioPageProps {
  onSwapToken?: (symbol: string, chainId: number) => void;
  onRepeatSwap?: (record: SwapRecord) => void;
}

/** Auto-refresh interval: 30 seconds */
const REFRESH_INTERVAL = 30_000;

/** Stable chain list — avoids new array reference on every render */
const PORTFOLIO_EVM_CHAINS: ['ethereum', 'bsc', 'polygon'] = ['ethereum', 'bsc', 'polygon'];

type PortfolioSubTab = 'activity' | 'revenue' | 'lifecycle' | 'system';

export function PortfolioPage({ onSwapToken, onRepeatSwap }: PortfolioPageProps) {
  const [portfolioSubTab, setPortfolioSubTab] = useState<PortfolioSubTab>('activity');
  // Individual selectors — only re-render when address/connection changes, NOT chainId
  const address = useWalletStore((s) => s.address);
  const isConnected = useWalletStore((s) => s.isConnected);

  // Debug mode check (cached for session)
  const debugMode = useMemo(() => isDebugMode(), []);

  const showAdminLifecycle = useMemo(() => {
    try {
      return (
        new URLSearchParams(window.location.search).get('adminLifecycle') === '1' ||
        import.meta.env.VITE_ADMIN_LIFECYCLE_UI === 'true'
      );
    } catch {
      return false;
    }
  }, []);

  const showAdminSystem = useMemo(() => {
    try {
      return (
        new URLSearchParams(window.location.search).get('adminSystem') === '1' ||
        import.meta.env.VITE_ADMIN_SYSTEM_UI === 'true'
      );
    } catch {
      return false;
    }
  }, []);

  const showAnyAdminPortal = showAdminLifecycle || showAdminSystem;

  useEffect(() => {
    if (!showAdminLifecycle && portfolioSubTab === 'lifecycle') {
      setPortfolioSubTab('activity');
    }
  }, [showAdminLifecycle, portfolioSubTab]);

  useEffect(() => {
    if (!showAdminSystem && portfolioSubTab === 'system') {
      setPortfolioSubTab('activity');
    }
  }, [showAdminSystem, portfolioSubTab]);

  const adminTabs = useMemo((): Array<'lifecycle' | 'system'> => {
    const a: Array<'lifecycle' | 'system'> = [];
    if (showAdminLifecycle) a.push('lifecycle');
    if (showAdminSystem) a.push('system');
    return a;
  }, [showAdminLifecycle, showAdminSystem]);

  const portfolioTabCount = 2 + adminTabs.length;
  const portfolioGridCols =
    portfolioTabCount >= 4 ? 'grid-cols-4' : portfolioTabCount === 3 ? 'grid-cols-3' : 'grid-cols-2';

  const portfolioTabs = useMemo(() => ['activity', 'revenue', ...adminTabs] as const, [adminTabs]);

  const bridgeAdminToken = useMemo(() => {
    if (!isConnected && showAdminLifecycle && showAdminSystem) return true;
    return adminTabs.length >= 2;
  }, [isConnected, showAdminLifecycle, showAdminSystem, adminTabs.length]);

  const [adminSharedToken, setAdminSharedToken] = useState(() => resolveAdminApiToken());
  const updatedAt = usePortfolioStore((s) => s.updatedAt);

  // Individual selectors — only re-render when specific values change (FIX-1)
  const setPortfolio = usePortfolioStore((s) => s.setPortfolio);
  const setLoading = usePortfolioStore((s) => s.setLoading);
  const setChainError = usePortfolioStore((s) => s.setChainError);
  const hydrateFromSnapshot = usePortfolioStore((s) => s.hydrateFromSnapshot);
  const clear = usePortfolioStore((s) => s.clear);

  useEffect(() => {
    const onSection = (event: Event) => {
      const detail = (event as CustomEvent<{ page?: string; section?: string }>).detail;
      if (detail?.page !== 'portfolio' || !detail.section) return;
      if (detail.section === 'activity') {
        setPortfolioSubTab('activity');
        return;
      }
      const id =
        detail.section === 'allocation' ? 'portfolio-allocation' : 'portfolio-holdings';
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    window.addEventListener('swaperex:section', onSection as EventListener);
    return () => window.removeEventListener('swaperex:section', onSection as EventListener);
  }, []);

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

  // Not connected — allow read-only admin panels when explicitly enabled via URL / env
  if (!isConnected && !showAnyAdminPortal) {
    return (
      <ShellEmptyState
        className="max-w-md mx-auto"
        icon={
          <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
          </svg>
        }
        title="Connect Your Wallet"
        description="Connect your wallet to view portfolio intelligence — total value, allocation, chain exposure, and wallet health."
      />
    );
  }

  if (!isConnected && showAnyAdminPortal) {
    return (
      <div className="max-w-2xl mx-auto space-y-8 py-4">
        {showAdminLifecycle && (
          <LifecycleObservabilityPanel
            adminToken={bridgeAdminToken ? adminSharedToken : undefined}
            onAdminTokenChange={bridgeAdminToken ? setAdminSharedToken : undefined}
          />
        )}
        {showAdminSystem && (
          <OperationalHealthPanel
            adminToken={bridgeAdminToken ? adminSharedToken : undefined}
            onAdminTokenChange={bridgeAdminToken ? setAdminSharedToken : undefined}
          />
        )}
        <div className="text-center text-[11px] text-dark-500 pb-4 leading-relaxed">
          Read-only admin views. Use <code className="text-dark-400">?adminLifecycle=1</code> and/or{' '}
          <code className="text-dark-400">?adminSystem=1</code> without connecting a wallet.
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      <div id="portfolio-allocation">
        <PortfolioIntelligenceCenter onRefresh={handleRefresh} />
      </div>

      <div id="portfolio-holdings">
        <div className="flex items-baseline justify-between gap-2 mb-2 px-0.5">
          <p className="text-[10px] uppercase tracking-wider text-dark-500">Holdings</p>
          <p className="text-[10px] text-dark-600">Professional table · all chains</p>
        </div>
        <PortfolioTokenTable onSwapToken={onSwapToken} />
      </div>

      <div
        className={`grid gap-1 w-full rounded-lg border border-white/[0.08] bg-electro-bgAlt/50 p-1 ${portfolioGridCols}`}
        role="tablist"
        aria-label="Portfolio sections"
      >
        {portfolioTabs.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={portfolioSubTab === t}
            onClick={() => setPortfolioSubTab(t)}
            className={`shell-tab min-w-0 py-2 text-center ${portfolioSubTab === t ? 'shell-tab-active' : ''}`}
          >
            {t === 'activity' ? 'Activity' : t === 'revenue' ? 'Revenue' : t === 'lifecycle' ? 'Lifecycle' : 'System'}
          </button>
        ))}
      </div>

      {portfolioSubTab === 'activity' ? (
        <ActivityPanel onRepeatSwap={onRepeatSwap} />
      ) : portfolioSubTab === 'revenue' ? (
        <RevenuePanel />
      ) : portfolioSubTab === 'lifecycle' ? (
        <LifecycleObservabilityPanel
          adminToken={bridgeAdminToken ? adminSharedToken : undefined}
          onAdminTokenChange={bridgeAdminToken ? setAdminSharedToken : undefined}
        />
      ) : (
        <OperationalHealthPanel
          adminToken={bridgeAdminToken ? adminSharedToken : undefined}
          onAdminTokenChange={bridgeAdminToken ? setAdminSharedToken : undefined}
        />
      )}

      {/* Diagnostics (debug mode only: ?debug=1) */}
      {debugMode && <DiagnosticsPanel />}

      <div className="text-center text-[11px] text-dark-500 pb-2 leading-relaxed space-y-1">
        <ShellAutoUpdateFooter intervalSeconds={30} />
        {updatedAt > 0 && (
          <p className="text-dark-600">
            Last sync {formatPortfolioRelativeTime(updatedAt)}
          </p>
        )}
      </div>
    </div>
  );
}

function formatPortfolioRelativeTime(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export default PortfolioPage;
