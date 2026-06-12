/**
 * Portfolio Intelligence Center — premium dashboard header for Portfolio page.
 * Presentation-only; reads portfolio store, no calculation changes elsewhere.
 */

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import {
  usePortfolioStore,
  formatUsdPrivate,
  getPortfolioChainLabel,
} from '@/stores/portfolioStore';
import type { PortfolioChain } from '@/services/portfolioTypes';
import {
  isStaleDataValid,
  PORTFOLIO_CHAINS,
} from '@/utils/chainHealth';
import { ShellChipButton, ShellPanel } from '@/components/ui/ShellPrimitives';
import {
  buildPortfolioIntelligence,
  formatPercent,
} from './portfolioIntelligenceModel';
import { PortfolioHealthScore } from './PortfolioHealthScore';
import { PortfolioAllocationBar } from './PortfolioAllocationBar';
import { PortfolioInsightCards } from './PortfolioInsightCards';
import { PortfolioSecurityCard } from './PortfolioSecurityCard';

interface Props {
  onRefresh: () => void;
  className?: string;
}

function ChainExposureBars({
  chainAllocations,
  privacyMode,
}: {
  chainAllocations: ReturnType<typeof buildPortfolioIntelligence>['chainAllocations'];
  privacyMode: boolean;
}) {
  const allChains: PortfolioChain[] = ['ethereum', 'bsc', 'polygon'];
  const byChain = new Map(chainAllocations.map((c) => [c.chain, c]));

  return (
    <ul className="space-y-2">
      {allChains.map((chain) => {
        const row = byChain.get(chain);
        const pct = row?.percent ?? 0;
        const label = row?.label ?? getPortfolioChainLabel(chain);
        return (
          <li key={chain}>
            <div className="flex items-center justify-between text-[11px] mb-1">
              <span className="text-dark-300">{label}</span>
              <span className="text-dark-500 tabular-nums">
                {formatPercent(pct, privacyMode)}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-black/30 border border-white/[0.04] overflow-hidden">
              <div
                className="h-full bg-accent/70 rounded-full transition-all"
                style={{ width: privacyMode ? '0%' : `${Math.min(pct, 100)}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function PortfolioIntelligenceCenter({ onRefresh, className = '' }: Props) {
  const portfolio = usePortfolioStore((s) => s.portfolio);
  const loading = usePortfolioStore((s) => s.loading);
  const errors = usePortfolioStore((s) => s.errors);
  const privacyMode = usePortfolioStore((s) => s.privacyMode);
  const setPrivacyMode = usePortfolioStore((s) => s.setPrivacyMode);
  const hideSmallBalances = usePortfolioStore((s) => s.hideSmallBalances);
  const smallBalanceThreshold = usePortfolioStore((s) => s.smallBalanceThreshold);
  const hideZeroBalances = usePortfolioStore((s) => s.hideZeroBalances);
  const chainHealth = usePortfolioStore(useShallow((s) => s.chainHealth));

  const model = useMemo(
    () =>
      buildPortfolioIntelligence({
        portfolio,
        hideSmallBalances,
        smallBalanceThreshold,
        hideZeroBalances,
      }),
    [portfolio, hideSmallBalances, smallBalanceThreshold, hideZeroBalances],
  );

  const degradedChains = useMemo(() => {
    const result: Array<{ chain: PortfolioChain; label: string; isStale: boolean }> = [];
    for (const chain of PORTFOLIO_CHAINS) {
      const health = chainHealth[chain];
      if (!health || health.status === 'ok') continue;
      result.push({
        chain,
        label: getPortfolioChainLabel(chain),
        isStale: isStaleDataValid(health.lastSuccessAt),
      });
    }
    return result;
  }, [chainHealth]);

  const showRetry =
    degradedChains.length > 0 || PORTFOLIO_CHAINS.some((c) => !!errors[c]);

  return (
    <div className={`space-y-4 ${className}`}>
      <ShellPanel className="p-4 sm:p-5">
        {degradedChains.length > 0 && (
          <div className="mb-3 p-2.5 bg-yellow-900/15 border border-yellow-700/30 rounded-lg space-y-1">
            {degradedChains.map(({ chain, label, isStale }) => (
              <p key={chain} className="text-xs text-yellow-400">
                {label} temporarily unavailable
                {isStale ? ' — showing last known data' : ''}
              </p>
            ))}
          </div>
        )}

        <div className="flex items-start justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-dark-500 mb-1">
              Portfolio Intelligence
            </p>
            <p className="text-xs text-dark-400 mb-1">Total value</p>
            <p className="text-3xl sm:text-4xl font-bold text-white tabular-nums">
              {loading && !portfolio ? (
                <span className="animate-pulse text-dark-500 text-2xl">Loading…</span>
              ) : (
                formatUsdPrivate(model.totalValueUsd, privacyMode)
              )}
            </p>
            {!privacyMode && model.isSmallPortfolio && model.hasPositions && (
              <p className="text-[10px] text-dark-500 mt-1">
                Small portfolio — insights use visible balances only.
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setPrivacyMode(!privacyMode)}
            className={`p-2 rounded-lg transition-colors border shrink-0 ${
              privacyMode
                ? 'bg-electro-panel/70 text-dark-300 border-white/[0.08]'
                : 'text-dark-500 hover:text-dark-300 hover:bg-electro-panel/40 border-transparent'
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
        </div>

        {!model.hasPositions && !loading && (
          <p className="text-xs text-dark-400 mb-4 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
            No portfolio positions found. Intelligence appears after balances load.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <PortfolioHealthScore model={model} privacyMode={privacyMode} />
          <ShellPanel className="p-4 sm:col-span-1 lg:col-span-2">
            <p className="text-[10px] uppercase tracking-wider text-dark-500 mb-2">Allocation</p>
            <PortfolioAllocationBar assets={model.topAssets} privacyMode={privacyMode} />
          </ShellPanel>
        </div>

        {showRetry && (
          <div className="mt-3">
            <ShellChipButton
              onClick={onRefresh}
              disabled={loading}
              className="text-[11px] !px-2.5 !py-1"
            >
              {loading ? 'Retrying…' : 'Retry update'}
            </ShellChipButton>
          </div>
        )}
      </ShellPanel>

      <PortfolioInsightCards model={model} privacyMode={privacyMode} />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <ShellPanel className="p-4">
          <p className="text-[10px] uppercase tracking-wider text-dark-500 mb-3">Chain Exposure</p>
          <ChainExposureBars
            chainAllocations={model.chainAllocations}
            privacyMode={privacyMode}
          />
        </ShellPanel>
        <PortfolioSecurityCard />
      </div>
    </div>
  );
}

export default PortfolioIntelligenceCenter;
