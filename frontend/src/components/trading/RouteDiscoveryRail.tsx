/**
 * Unified audited route discovery for Swap sidebar / below-fold strip.
 * Display-only — catalog rankings, not live trades or wallet telemetry.
 */

import { useMemo, useState } from 'react';
import type { AssetInfo } from '@/types/api';
import { isCommissionRequiredMode } from '@/config';
import { SWAP_SURFACE_COPY } from '@/constants/swapSurfaceCopy';
import { logRevenueTelemetry } from '@/utils/revenueTelemetry';
import {
  getRoutesByBadge,
  routeIntelToAssets,
  type RouteIntelBadge,
  type TradingRouteIntel,
} from '@/constants/tradingIntelligence';
import { SwapTokenAvatar } from '@/components/common/SwapTokenAvatar';
import { ShellPanel } from '@/components/ui/ShellPrimitives';
import { RouteIntelBadgePill } from './RouteIntelBadge';
import { getTokenBySymbol } from '@/tokens';
import {
  isActiveCommissionRoute,
  selectCommissionRoute,
} from './routeDiscoverySelection';

const ROUTE_TABS: { id: RouteIntelBadge; label: string }[] = [
  { id: 'most-used', label: 'Featured' },
  { id: 'trending', label: 'High-liquidity' },
  { id: 'audited', label: 'Certified' },
];

const CHAIN_BADGE_CLASS: Record<number, string> = {
  1: 'bg-indigo-500/15 text-indigo-200 border-indigo-500/30',
  56: 'bg-amber-500/15 text-amber-100 border-amber-500/35',
};

export interface RouteDiscoveryRailProps {
  activeChainId: number;
  onSelectPair: (from: AssetInfo, to: AssetInfo) => void;
  /** `strip` aligns width with swap card when disconnected. */
  layout?: 'sidebar' | 'strip';
  fromAsset?: AssetInfo | null;
  toAsset?: AssetInfo | null;
  /** Premium tile styling for Swap Intelligence Center. */
  variant?: 'default' | 'premium';
}

function RoutePairTile({
  intel,
  active,
  onSelect,
  premium = false,
}: {
  intel: TradingRouteIntel;
  active: boolean;
  onSelect: () => void;
  premium?: boolean;
}) {
  const fromLogo = getTokenBySymbol(intel.route.fromSymbol, intel.route.chainId)?.logoURI;
  const toLogo = getTokenBySymbol(intel.route.toSymbol, intel.route.chainId)?.logoURI;
  const chainBadge = CHAIN_BADGE_CLASS[intel.route.chainId] ?? 'bg-electro-panel/60 text-dark-300 border-white/[0.08]';

  return (
    <button
      type="button"
      onClick={onSelect}
      title={
        intel.route.bidirectional
          ? `${intel.pairLabel} — tap again to reverse`
          : intel.pairLabel
      }
      className={`snap-start shrink-0 w-[11.75rem] lg:w-auto text-left rounded-xl border p-3 transition-all duration-200 group ${
        active
          ? 'border-emerald-500/55 bg-emerald-900/35 shadow-[0_0_20px_rgba(16,185,129,0.12)]'
          : premium
            ? 'border-white/[0.08] bg-electro-panel/55 hover:bg-electro-panel/75 hover:border-accent/25 hover:shadow-[0_8px_24px_rgba(0,0,0,0.35)] hover:-translate-y-0.5'
            : 'border-white/[0.08] bg-electro-panel/60 hover:bg-electro-panel/80 hover:border-white/[0.12]'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <RouteIntelBadgePill badge={intel.badge} />
        <span
          className={`text-[9px] font-medium truncate rounded-full border px-1.5 py-0.5 ${chainBadge}`}
        >
          {intel.route.chainLabel}
        </span>
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center -space-x-1.5 transition-transform duration-200 group-hover:scale-[1.02]">
          <SwapTokenAvatar symbol={intel.route.fromSymbol} logoUrl={fromLogo} size="sm" />
          <SwapTokenAvatar symbol={intel.route.toSymbol} logoUrl={toLogo} size="sm" />
        </div>
        <span className="text-sm font-semibold text-white truncate">{intel.pairLabel}</span>
      </div>
    </button>
  );
}

export function RouteDiscoveryRail({
  activeChainId,
  onSelectPair,
  layout = 'sidebar',
  fromAsset = null,
  toAsset = null,
  variant = 'default',
}: RouteDiscoveryRailProps) {
  const [activeTab, setActiveTab] = useState<RouteIntelBadge>('most-used');

  const tabRoutes = useMemo(
    () =>
      getRoutesByBadge(activeTab, activeChainId).filter(
        (intel) => intel.route.chainId === activeChainId,
      ),
    [activeTab, activeChainId],
  );

  if (!isCommissionRequiredMode()) return null;
  if (activeChainId !== 1 && activeChainId !== 56) return null;

  const handleIntelClick = (intel: TradingRouteIntel) => {
    logRevenueTelemetry('pair_selected', {
      chainId: intel.route.chainId,
      fromSymbol: intel.route.fromSymbol,
      toSymbol: intel.route.toSymbol,
      pairKey: `${intel.route.chainId}|${intel.route.fromSymbol}|${intel.route.toSymbol}`,
      source: 'route_discovery',
    });
    const assets = routeIntelToAssets(intel);
    if (assets) {
      if (
        isActiveCommissionRoute(intel.route, fromAsset, toAsset) &&
        intel.route.bidirectional
      ) {
        onSelectPair(assets.to, assets.from);
        return;
      }
      onSelectPair(assets.from, assets.to);
      return;
    }
    selectCommissionRoute(intel.route, fromAsset, toAsset, onSelectPair);
  };

  const panel = (
    <ShellPanel
      className={`p-3 sm:p-4 ${variant === 'premium' ? 'bg-gradient-to-b from-electro-panel/70 to-electro-panel/45' : ''}`}
    >
      <div className="flex items-start justify-between gap-2 mb-0.5">
        <h3 className="text-sm font-semibold text-white">
          {SWAP_SURFACE_COPY.popularCommissionRoutesTitle}
        </h3>
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium border border-emerald-700/35 bg-emerald-900/30 text-emerald-100/95 shrink-0">
          {SWAP_SURFACE_COPY.auditedCommissionRouteBadge}
        </span>
      </div>
      <p className="text-[10px] text-dark-500 mb-3 leading-snug">
        Certified catalog only · tap to pre-fill · not live trades
      </p>

      <div className="shell-segment-track mb-2.5" role="tablist" aria-label="Route categories">
        {ROUTE_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            onClick={() => setActiveTab(id)}
            className={`shell-segment flex-1 text-center text-[11px] py-1 ${
              activeTab === id ? 'shell-segment-active' : ''
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tabRoutes.length === 0 ? (
        <p className="text-[10px] text-dark-500 py-1">No routes in this category on this network.</p>
      ) : (
        <div
          className="flex lg:grid lg:grid-cols-2 gap-2 overflow-x-auto pb-0.5 lg:overflow-visible snap-x snap-mandatory scrollbar-thin"
          role="list"
          aria-label={SWAP_SURFACE_COPY.popularCommissionRoutesTitle}
        >
          {tabRoutes.map((intel) => (
            <RoutePairTile
              key={`${intel.route.chainId}-${intel.pairLabel}-${intel.badge}`}
              intel={intel}
              active={isActiveCommissionRoute(intel.route, fromAsset, toAsset)}
              onSelect={() => handleIntelClick(intel)}
              premium={variant === 'premium'}
            />
          ))}
        </div>
      )}
    </ShellPanel>
  );

  if (layout === 'strip') {
    return (
      <div className="w-full max-w-md lg:max-w-xl 2xl:max-w-2xl mx-auto">{panel}</div>
    );
  }

  return panel;
}

export default RouteDiscoveryRail;
