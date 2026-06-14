/**
 * Portfolio Intelligence Center — professional portfolio terminal header.
 * Presentation-only; reads portfolio store, no calculation changes elsewhere.
 */

import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useRadarStore } from '@/stores/radarStore';
import { useWatchlistStore } from '@/stores/watchlistStore';
import {
  usePortfolioStore,
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
import { PortfolioChainExposurePanel } from './PortfolioChainExposurePanel';
import { PortfolioReviewPriorities } from './PortfolioReviewPriorities';
import { PortfolioCompositionSection } from './PortfolioCompositionSection';
import { PortfolioTradingDashboardHero } from './PortfolioTradingDashboardHero';

interface Props {
  onRefresh: () => void;
  className?: string;
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

  const radarUnreadCount = useRadarStore((s) =>
    s.signals.filter((sig) => !sig.read).length,
  );
  const watchlistCount = useWatchlistStore((s) => s.tokens.length);

  const model = useMemo(
    () =>
      buildPortfolioIntelligence({
        portfolio,
        hideSmallBalances,
        smallBalanceThreshold,
        hideZeroBalances,
        radarUnreadCount,
        watchlistCount,
      }),
    [
      portfolio,
      hideSmallBalances,
      smallBalanceThreshold,
      hideZeroBalances,
      radarUnreadCount,
      watchlistCount,
    ],
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
    <div className={`space-y-3 ${className}`}>
      {degradedChains.length > 0 && (
        <div className="p-2.5 bg-yellow-900/15 border border-yellow-700/30 rounded-lg space-y-1">
          {degradedChains.map(({ chain, label, isStale }) => (
            <p key={chain} className="text-xs text-yellow-400">
              {label} temporarily unavailable
              {isStale ? ' — showing last known data' : ''}
            </p>
          ))}
        </div>
      )}

      <PortfolioTradingDashboardHero
        model={model}
        privacyMode={privacyMode}
        loading={loading}
        hasPortfolio={!!portfolio}
        onTogglePrivacy={() => setPrivacyMode(!privacyMode)}
        onRefresh={onRefresh}
        refreshing={loading}
      />

      {!model.hasPositions && !loading && (
        <p className="text-xs text-dark-400 rounded-lg border border-white/[0.06] bg-black/20 px-3 py-2">
          No portfolio positions found. Intelligence appears after balances load.
        </p>
      )}

      <ShellPanel className="p-4 sm:p-5 bg-gradient-to-b from-electro-panel/80 to-electro-panel/50">
        <div className="grid grid-cols-1 sm:grid-cols-5 gap-3">
          <div className="sm:col-span-2">
            <PortfolioHealthScore model={model} privacyMode={privacyMode} />
          </div>
          <ShellPanel className="p-3 sm:p-4 sm:col-span-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[10px] uppercase tracking-wider text-dark-500">Allocation</p>
              {!privacyMode && model.largestPosition && (
                <span className="text-[10px] text-dark-500 truncate">
                  Top: {model.largestPosition.symbol}{' '}
                  {formatPercent(model.largestPosition.percent, false)}
                </span>
              )}
            </div>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PortfolioChainExposurePanel
          chainAllocations={model.chainAllocations}
          privacyMode={privacyMode}
        />
        <ShellPanel className="p-3 sm:p-4 flex flex-col justify-center gap-3">
          <p className="text-[10px] uppercase tracking-wider text-dark-500">Exposure Summary</p>
          <dl className="grid grid-cols-2 gap-2 text-[11px]">
            <div className="rounded-lg border border-white/[0.05] bg-black/10 px-2.5 py-2">
              <dt className="text-dark-500">Stablecoins</dt>
              <dd className="text-white font-semibold tabular-nums mt-0.5">
                {formatPercent(model.stablecoinExposurePercent, privacyMode)}
              </dd>
            </div>
            <div className="rounded-lg border border-white/[0.05] bg-black/10 px-2.5 py-2">
              <dt className="text-dark-500">Largest chain</dt>
              <dd className="text-white font-semibold truncate mt-0.5">
                {privacyMode ? '****' : model.largestChain?.label ?? '—'}
              </dd>
            </div>
            <div className="rounded-lg border border-white/[0.05] bg-black/10 px-2.5 py-2">
              <dt className="text-dark-500">Risk estimate</dt>
              <dd className="text-dark-200 font-medium mt-0.5 leading-snug">{model.riskLabel}</dd>
            </div>
            <div className="rounded-lg border border-white/[0.05] bg-black/10 px-2.5 py-2">
              <dt className="text-dark-500">Health</dt>
              <dd className="text-white font-semibold mt-0.5">{model.walletHealthLabel}</dd>
            </div>
          </dl>
        </ShellPanel>
      </div>

      <PortfolioReviewPriorities priorities={model.reviewPriorities} />

      <PortfolioCompositionSection
        buckets={model.composition}
        privacyMode={privacyMode}
        totalValueUsd={model.totalValueUsd}
      />
    </div>
  );
}

export default PortfolioIntelligenceCenter;
