/**
 * P3.7 — Premium trading-terminal hero for Portfolio.
 * Presentation-only; metrics derived from portfolio intelligence model.
 */

import type { PortfolioIntelligenceModel } from './portfolioIntelligenceModel';
import { formatPercent } from './portfolioIntelligenceModel';
import { formatUsdPrivate } from '@/stores/portfolioStore';
import { ShellPanel } from '@/components/ui/ShellPrimitives';

interface Props {
  model: PortfolioIntelligenceModel;
  privacyMode: boolean;
  loading: boolean;
  hasPortfolio: boolean;
  onTogglePrivacy: () => void;
  onRefresh?: () => void;
  refreshing?: boolean;
}

function healthTone(label: PortfolioIntelligenceModel['walletHealthLabel']): string {
  switch (label) {
    case 'Strong':
      return 'text-accent border-accent/30 bg-accent/10';
    case 'Balanced':
      return 'text-emerald-300 border-emerald-500/25 bg-emerald-500/10';
    case 'Concentrated':
      return 'text-yellow-300 border-yellow-500/25 bg-yellow-500/10';
    default:
      return 'text-orange-300 border-orange-500/25 bg-orange-500/10';
  }
}

export function PortfolioTradingDashboardHero({
  model,
  privacyMode,
  loading,
  hasPortfolio,
  onTogglePrivacy,
  onRefresh,
  refreshing = false,
}: Props) {
  const metrics = [
    {
      label: 'Assets',
      value: privacyMode ? '••' : String(model.assetCount),
      sub: model.assetCount === 1 ? 'token' : 'tokens',
    },
    {
      label: 'Chains',
      value: privacyMode ? '••' : String(model.chainCount),
      sub: model.chainCount === 1 ? 'network' : 'networks',
    },
    {
      label: 'Stable Exposure',
      value: formatPercent(model.stablecoinExposurePercent, privacyMode),
      sub: 'of portfolio',
    },
    {
      label: 'Allocation score',
      value: privacyMode ? '••' : String(model.walletHealthScore),
      sub: `${model.walletHealthLabel} · balance mix only`,
      badge: model.walletHealthLabel,
    },
  ];

  return (
    <ShellPanel className="relative overflow-hidden p-5 sm:p-6 bg-gradient-to-br from-electro-panel/90 via-electro-panel/70 to-black/40 border-white/[0.1] shadow-[0_8px_32px_rgba(0,0,0,0.35)]">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(46,255,139,0.08),transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -top-24 -right-24 h-48 w-48 rounded-full bg-accent/5 blur-3xl"
        aria-hidden
      />

      <div className="relative flex items-start justify-between gap-3 mb-5">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.2em] text-dark-500 mb-2 font-medium">
            Trading Dashboard
          </p>
          <p className="text-xs text-dark-400 mb-1">Portfolio value</p>
          <p className="text-4xl sm:text-5xl font-bold text-white tabular-nums tracking-tight leading-none">
            {loading && !hasPortfolio ? (
              <span className="animate-pulse text-dark-500 text-3xl">Loading…</span>
            ) : (
              formatUsdPrivate(model.totalValueUsd, privacyMode)
            )}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="p-2 rounded-lg border border-white/[0.08] bg-black/20 text-dark-400 hover:text-white hover:bg-black/30 transition-colors disabled:opacity-50"
              title="Refresh portfolio"
              aria-label="Refresh portfolio"
            >
              <svg
                className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
            </button>
          )}
          <button
            type="button"
            onClick={onTogglePrivacy}
            className={`p-2 rounded-lg transition-colors border ${
              privacyMode
                ? 'bg-electro-panel/70 text-dark-300 border-white/[0.08]'
                : 'text-dark-500 hover:text-dark-300 hover:bg-black/20 border-transparent'
            }`}
            title={privacyMode ? 'Show values' : 'Hide values'}
            aria-label={privacyMode ? 'Show values' : 'Hide values'}
          >
            {privacyMode ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
                />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="rounded-xl border border-white/[0.06] bg-black/25 backdrop-blur-sm px-3 py-2.5 sm:py-3"
          >
            <p className="text-[10px] uppercase tracking-wider text-dark-500 mb-1">{m.label}</p>
            <p className="text-lg sm:text-xl font-bold text-white tabular-nums leading-tight">
              {m.value}
            </p>
            {m.badge && !privacyMode ? (
              <span
                className={`inline-block mt-1 text-[9px] font-medium px-1.5 py-0.5 rounded-full border ${healthTone(m.badge)}`}
              >
                {m.badge}
              </span>
            ) : (
              <p className="text-[10px] text-dark-500 mt-0.5">{m.sub}</p>
            )}
          </div>
        ))}
      </div>

      <div className="relative rounded-xl border border-dashed border-white/[0.08] bg-black/15 px-3 py-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-dark-500">Performance</p>
          <p className="text-xs text-dark-400 mt-0.5">Performance tracking coming soon</p>
        </div>
        <span className="text-[9px] text-dark-600 uppercase tracking-wider shrink-0">No PnL data</span>
      </div>
    </ShellPanel>
  );
}

export default PortfolioTradingDashboardHero;
