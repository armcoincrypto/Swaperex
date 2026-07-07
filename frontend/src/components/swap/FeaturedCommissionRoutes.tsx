/**
 * P4A — Always-visible featured audited routes near the swap card.
 */

import { useMemo } from 'react';
import type { AssetInfo } from '@/types/api';
import { isCommissionRequiredMode } from '@/config';
import {
  featuredRouteBadgeLabel,
  getFeaturedCommissionRoutes,
  getFeaturedRouteBadge,
} from '@/constants/featuredCommissionRoutes';
import {
  COMMISSION_SWAP_CHAIN_IDS,
  isCommissionSwapChain,
  isCommissionSwapUnavailableOnChain,
} from '@/constants/commissionChains';
import { SWAP_SURFACE_COPY } from '@/constants/swapSurfaceCopy';
import {
  isActiveCommissionRoute,
  resolveRouteAssets,
  selectCommissionRoute,
} from '@/components/trading/routeDiscoverySelection';
import type { PopularCommissionRoute } from '@/constants/popularCommissionRoutes';
import { logRevenueTelemetry } from '@/utils/revenueTelemetry';
import { getChainName } from '@/utils/format';

type Props = {
  activeChainId: number;
  fromAsset: AssetInfo | null;
  toAsset: AssetInfo | null;
  onSelectPair: (from: AssetInfo, to: AssetInfo) => void;
};

function FeaturedRouteChip({
  route,
  active,
  disabled,
  disabledHint,
  onSelect,
}: {
  route: PopularCommissionRoute;
  active: boolean;
  disabled: boolean;
  disabledHint?: string;
  onSelect: (route: PopularCommissionRoute) => void;
}) {
  const badge = getFeaturedRouteBadge(route);
  const badgeLabel = featuredRouteBadgeLabel(badge);

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(route)}
      title={
        disabled && disabledHint
          ? disabledHint
          : route.bidirectional
            ? `${badgeLabel}: ${route.label}. Tap again to reverse.`
            : `${badgeLabel}: ${route.label}`
      }
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
        disabled
          ? 'border-white/[0.06] bg-white/[0.02] text-dark-500 cursor-not-allowed'
          : active
            ? 'border-emerald-500/50 bg-emerald-900/40 text-emerald-50'
            : 'border-white/[0.08] bg-white/[0.04] text-dark-200 hover:border-emerald-600/40 hover:bg-emerald-950/30 hover:text-emerald-50'
      }`}
    >
      <span className="text-[9px] uppercase tracking-wide text-dark-400">{badgeLabel}</span>
      <span>{route.label}</span>
    </button>
  );
}

export function FeaturedCommissionRoutes({
  activeChainId,
  fromAsset,
  toAsset,
  onSelectPair,
}: Props) {
  const featuredRoutes = useMemo(() => getFeaturedCommissionRoutes(), []);
  const onSwapReadyChain = isCommissionSwapChain(activeChainId);
  const swapUnavailable = isCommissionSwapUnavailableOnChain(activeChainId);

  const visibleRoutes = useMemo(() => {
    if (onSwapReadyChain) {
      return featuredRoutes.filter((r) => r.chainId === activeChainId);
    }
    if (swapUnavailable) {
      return featuredRoutes;
    }
    return featuredRoutes.filter((r) => r.chainId === activeChainId);
  }, [activeChainId, featuredRoutes, onSwapReadyChain, swapUnavailable]);

  if (!isCommissionRequiredMode()) return null;
  if (visibleRoutes.length === 0) return null;

  const handleSelect = (route: PopularCommissionRoute) => {
    if (!resolveRouteAssets(route)) return;
    if (swapUnavailable && route.chainId !== activeChainId) {
      return;
    }
    if (!isCommissionSwapChain(route.chainId)) return;

    logRevenueTelemetry('pair_selected', {
      chainId: route.chainId,
      fromSymbol: route.fromSymbol,
      toSymbol: route.toSymbol,
      pairKey: `${route.chainId}|${route.fromSymbol}|${route.toSymbol}`,
      source: 'featured_chip',
    });
    selectCommissionRoute(route, fromAsset, toAsset, onSelectPair);
  };

  return (
    <div
      className="relative z-10 mt-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2.5"
      aria-label={SWAP_SURFACE_COPY.featuredCommissionRoutesLabel}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-dark-300">
          {SWAP_SURFACE_COPY.featuredCommissionRoutesTitle}
        </p>
        <span className="text-[10px] text-dark-500">{SWAP_SURFACE_COPY.featuredCommissionRoutesHint}</span>
      </div>

      {swapUnavailable ? (
        <p className="mb-2 text-[11px] leading-snug text-amber-100/90">
          {SWAP_SURFACE_COPY.featuredRoutesSwitchNetworkHint.replace(
            '{network}',
            getChainName(activeChainId) || 'this network',
          )}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5" role="list">
        {visibleRoutes.map((route) => {
          if (!resolveRouteAssets(route)) return null;
          const routeOnActiveChain = route.chainId === activeChainId;
          const disabled = swapUnavailable && !routeOnActiveChain;
          const disabledHint = disabled
            ? `Switch to ${route.chainLabel} to use ${route.label}`
            : undefined;

          return (
            <FeaturedRouteChip
              key={`featured-${route.chainId}-${route.fromSymbol}-${route.toSymbol}`}
              route={route}
              active={routeOnActiveChain && isActiveCommissionRoute(route, fromAsset, toAsset)}
              disabled={disabled}
              disabledHint={disabledHint}
              onSelect={handleSelect}
            />
          );
        })}
      </div>

      {swapUnavailable ? (
        <p className="mt-2 text-[10px] text-dark-500">
          Swap networks:{' '}
          {COMMISSION_SWAP_CHAIN_IDS.map((id) => getChainName(id)).join(' · ')}
        </p>
      ) : null}
    </div>
  );
}

export default FeaturedCommissionRoutes;
