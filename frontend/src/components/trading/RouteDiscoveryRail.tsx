/**
 * Unified audited route discovery for Swap sidebar / below-fold strip.
 * Display-only — catalog rankings, not live trades or wallet telemetry.
 */

import { useMemo, useState } from 'react';
import type { AssetInfo } from '@/types/api';
import { isCommissionRequiredMode } from '@/config';
import { SWAP_SURFACE_COPY } from '@/constants/swapSurfaceCopy';
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
  { id: 'most-used', label: 'Most used' },
  { id: 'trending', label: 'Trending' },
  { id: 'audited', label: 'Audited' },
];

export interface RouteDiscoveryRailProps {
  activeChainId: number;
  onSelectPair: (from: AssetInfo, to: AssetInfo) => void;
  /** `strip` aligns width with swap card when disconnected. */
  layout?: 'sidebar' | 'strip';
  fromAsset?: AssetInfo | null;
  toAsset?: AssetInfo | null;
}

function RoutePairTile({
  intel,
  active,
  onSelect,
}: {
  intel: TradingRouteIntel;
  active: boolean;
  onSelect: () => void;
}) {
  const fromLogo = getTokenBySymbol(intel.route.fromSymbol, intel.route.chainId)?.logoURI;
  const toLogo = getTokenBySymbol(intel.route.toSymbol, intel.route.chainId)?.logoURI;

  return (
    <button
      type="button"
      onClick={onSelect}
      title={
        intel.route.bidirectional
          ? `${intel.pairLabel} — tap again to reverse`
          : intel.pairLabel
      }
      className={`snap-start shrink-0 w-[11.5rem] lg:w-auto text-left rounded-xl border p-3 transition-all duration-200 ${
        active
          ? 'border-emerald-500/50 bg-emerald-900/35 hover:bg-emerald-900/45'
          : 'border-white/[0.08] bg-electro-panel/60 hover:bg-electro-panel/80 hover:border-white/[0.12]'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <RouteIntelBadgePill badge={intel.badge} />
        <span className="text-[9px] text-dark-500 truncate">{intel.route.chainLabel}</span>
      </div>
      <div className="flex items-center gap-2 min-w-0">
        <div className="flex items-center -space-x-1.5">
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
    <ShellPanel className="p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2 mb-0.5">
        <h3 className="text-sm font-semibold text-white">
          {SWAP_SURFACE_COPY.popularCommissionRoutesTitle}
        </h3>
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium border border-emerald-700/35 bg-emerald-900/30 text-emerald-100/95 shrink-0">
          {SWAP_SURFACE_COPY.auditedCommissionRouteBadge}
        </span>
      </div>
      <p className="text-[10px] text-dark-500 mb-3 leading-snug">
        Audited catalog only · tap to pre-fill · not live trades
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
