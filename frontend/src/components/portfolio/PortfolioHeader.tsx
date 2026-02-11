/**
 * Portfolio Header
 *
 * Shows: total portfolio value (USD), per-chain status chips with health dots,
 * partial failure banner, refresh button, last updated time, privacy toggle.
 *
 * Production Hardening:
 *  - Partial failure banner when chains are degraded/down
 *  - Chain chips show health status (ok/degraded/down) with detailed tooltips
 *  - Stale data indicators
 *  - All values respect privacy mode
 */

import { useState, useEffect, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  usePortfolioStore,
  getChainTotals,
  formatUsdPrivate,
  getPortfolioChainLabel,
} from '@/stores/portfolioStore';
import type { PortfolioChain } from '@/services/portfolioTypes';
import {
  type ChainHealthStatus,
  isStaleDataValid,
  formatMsAgo,
  redactError,
  PORTFOLIO_CHAINS,
} from '@/utils/chainHealth';

interface PortfolioHeaderProps {
  onRefresh: () => void;
  className?: string;
}

export function PortfolioHeader({ onRefresh, className = '' }: PortfolioHeaderProps) {
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const loading = usePortfolioStore((s) => s.loading);
  const errors = usePortfolioStore((s) => s.errors);
  const updatedAt = usePortfolioStore((s) => s.updatedAt);
  const privacyMode = usePortfolioStore((s) => s.privacyMode);
  const setPrivacyMode = usePortfolioStore((s) => s.setPrivacyMode);
  const hideSmallBalances = usePortfolioStore((s) => s.hideSmallBalances);
  const setHideSmallBalances = usePortfolioStore((s) => s.setHideSmallBalances);
  const chainHealth = usePortfolioStore(useShallow((s) => s.chainHealth));
  const [, tick] = useState(0);

  // Force re-render for relative time
  useEffect(() => {
    const interval = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(interval);
  }, []);

  const totalUsd = portfolio?.totalUsdValue || '0';
  const chainTotals = getChainTotals(portfolio);

  // Compute degraded/down chains for banner
  const degradedChains = useMemo(() => {
    const result: Array<{
      chain: PortfolioChain;
      label: string;
      status: ChainHealthStatus;
      isStale: boolean;
      error: string | null;
    }> = [];

    for (const chain of PORTFOLIO_CHAINS) {
      const health = chainHealth[chain];
      if (!health || health.status === 'ok') continue;

      result.push({
        chain,
        label: getPortfolioChainLabel(chain),
        status: health.status,
        isStale: isStaleDataValid(health.lastSuccessAt),
        error: health.lastError,
      });
    }
    return result;
  }, [chainHealth]);

  return (
    <div className={`bg-dark-800/50 rounded-xl border border-dark-700/50 p-4 ${className}`}>
      {/* Partial Failure Banner — smooth transition instead of abrupt appear/disappear */}
      <div
        className={`overflow-hidden transition-all duration-300 ease-in-out ${
          degradedChains.length > 0 ? 'max-h-40 opacity-100 mb-3' : 'max-h-0 opacity-0 mb-0'
        }`}
      >
        <div className="p-2.5 bg-yellow-900/15 border border-yellow-700/30 rounded-lg">
          {degradedChains.map(({ chain, label, isStale }) => (
            <div key={chain} className="flex items-center gap-2 text-xs text-yellow-400">
              <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
              <span>
                {label} temporarily unavailable
                {isStale
                  ? ' — showing last known data (stale)'
                  : ` — excluding ${label} from totals`}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Total Portfolio Value */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="text-xs text-dark-500 uppercase tracking-wider mb-1">
            Portfolio Value
          </div>
          <div className="text-3xl font-bold h-9 flex items-center">
            {loading && !portfolio ? (
              <span className="animate-pulse text-dark-500">Loading...</span>
            ) : (
              formatUsdPrivate(totalUsd, privacyMode)
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Privacy toggle */}
          <button
            onClick={() => setPrivacyMode(!privacyMode)}
            className={`p-2 rounded-lg transition-colors ${
              privacyMode
                ? 'bg-dark-700 text-dark-300'
                : 'text-dark-500 hover:text-dark-300 hover:bg-dark-700/50'
            }`}
            title={privacyMode ? 'Show values' : 'Hide values'}
          >
            {privacyMode ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
            )}
          </button>

          {/* Refresh */}
          <button
            onClick={onRefresh}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-dark-700 hover:bg-dark-600 text-dark-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Chain Status Chips */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {PORTFOLIO_CHAINS.map((chain) => {
          const total = chainTotals[chain];
          const health = chainHealth[chain];
          const chainError = errors[chain];
          const label = getPortfolioChainLabel(chain);
          const status: ChainHealthStatus = health?.status || (chainError ? 'degraded' : 'ok');
          const isStale = health && health.status !== 'ok' && isStaleDataValid(health.lastSuccessAt);

          // Build tooltip
          let tooltip = '';
          if (privacyMode) {
            tooltip = `${label}: Hidden`;
          } else if (status === 'ok' && total) {
            tooltip = `${label}: $${total.total.toFixed(2)}`;
            if (health?.lastLatencyMs) tooltip += ` (${health.lastLatencyMs}ms)`;
          } else if (status !== 'ok' && health) {
            tooltip = `${label}: ${status.toUpperCase()}`;
            if (health.lastError) tooltip += ` — ${redactError(health.lastError)}`;
            if (isStale) tooltip += ` (showing stale data from ${formatMsAgo(health.lastSuccessAt)})`;
            if (health.failureCount > 0) tooltip += ` | Failures: ${health.failureCount}`;
          } else if (!total) {
            tooltip = `${label}: No data`;
          }

          // Colors by status
          const chipClass =
            status === 'down' ? 'bg-red-900/20 text-red-400'
            : status === 'degraded' ? 'bg-yellow-900/20 text-yellow-400'
            : 'bg-dark-700/60 text-dark-300';

          const dotClass =
            status === 'down' ? 'bg-red-400'
            : status === 'degraded' ? 'bg-yellow-400'
            : 'bg-green-400';

          // Value display
          let valueDisplay: string;
          if (status === 'down' && !isStale) {
            valueDisplay = '—';
          } else if (total) {
            valueDisplay = formatUsdPrivate(total.total, privacyMode);
          } else {
            valueDisplay = '$0.00';
          }

          return (
            <span
              key={chain}
              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium ${chipClass}`}
              title={tooltip}
            >
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dotClass}`} />
              {label}: {valueDisplay}
              {isStale && <span className="text-[9px] opacity-60 ml-0.5">(stale)</span>}
            </span>
          );
        })}
      </div>

      {/* Bottom row: last updated + hide small */}
      <div className="flex items-center justify-between text-[11px] text-dark-500">
        <span>
          {updatedAt > 0
            ? `Updated ${formatRelativeTime(updatedAt)}`
            : loading
            ? 'Fetching balances...'
            : 'Not loaded yet'}
        </span>

        <label className="flex items-center gap-1.5 cursor-pointer">
          <input
            id="hide-small-balances"
            name="hide-small-balances"
            type="checkbox"
            checked={hideSmallBalances}
            onChange={(e) => setHideSmallBalances(e.target.checked)}
            className="w-3.5 h-3.5 rounded border-dark-600 bg-dark-700 text-primary-500 focus:ring-primary-500"
          />
          <span>Hide small balances</span>
        </label>
      </div>
    </div>
  );
}

function formatRelativeTime(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 120) return '1m ago';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

export default PortfolioHeader;
