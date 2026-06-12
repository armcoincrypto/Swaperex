/**
 * P3.1 — Audited commission route shortcuts (display-only; no routing changes).
 */

import { useMemo, useState } from 'react';
import type { AssetInfo } from '@/types/api';
import { isCommissionRequiredMode } from '@/config';
import { getTokenBySymbol, isNativeToken } from '@/tokens';
import {
  getVerifiedPopularCommissionRoutes,
  type PopularCommissionRoute,
} from '@/constants/popularCommissionRoutes';
import {
  getRoutesByBadge,
  type RouteIntelBadge,
} from '@/constants/tradingIntelligence';
import { SWAP_SURFACE_COPY } from '@/constants/swapSurfaceCopy';
import { RouteIntelBadgePill } from '@/components/trading/RouteIntelBadge';

const CHAIN_NAMES: Record<number, string> = {
  1: 'ethereum',
  56: 'bsc',
};

const CHAIN_LABELS: Record<number, string> = {
  1: 'Ethereum',
  56: 'BNB Chain',
};

const RECOVERY_ROUTE_LIMIT = 6;

const ROUTE_TABS: { id: RouteIntelBadge; label: string }[] = [
  { id: 'most-used', label: 'Most used' },
  { id: 'trending', label: 'Trending' },
  { id: 'audited', label: 'Audited' },
];

type Props = {
  activeChainId: number;
  fromAsset: AssetInfo | null;
  toAsset: AssetInfo | null;
  onSelectPair: (from: AssetInfo, to: AssetInfo) => void;
};

function symbolToAsset(symbol: string, chainId: number): AssetInfo | null {
  const token = getTokenBySymbol(symbol, chainId);
  if (!token) return null;
  return {
    symbol: token.symbol,
    name: token.name,
    chain: CHAIN_NAMES[chainId] || 'ethereum',
    decimals: token.decimals,
    is_native: isNativeToken(token.address),
    contract_address: token.address,
    logo_url: token.logoURI,
  };
}

function resolveAssets(route: PopularCommissionRoute): { from: AssetInfo; to: AssetInfo } | null {
  const from = symbolToAsset(route.fromSymbol, route.chainId);
  const to = symbolToAsset(route.toSymbol, route.chainId);
  if (!from || !to) return null;
  return { from, to };
}

function isActiveRoute(
  route: PopularCommissionRoute,
  fromAsset: AssetInfo | null,
  toAsset: AssetInfo | null,
): boolean {
  if (!fromAsset || !toAsset) return false;
  const f = fromAsset.symbol.trim().toUpperCase();
  const t = toAsset.symbol.trim().toUpperCase();
  const a = route.fromSymbol.toUpperCase();
  const b = route.toSymbol.toUpperCase();
  return (
    (f === a && t === b) ||
    (route.bidirectional && f === b && t === a)
  );
}

function recoveryRoutesForChain(chainId: number): PopularCommissionRoute[] {
  return getVerifiedPopularCommissionRoutes()
    .filter((route) => route.chainId === chainId)
    .slice(0, RECOVERY_ROUTE_LIMIT);
}

function handleRouteSelection(
  route: PopularCommissionRoute,
  fromAsset: AssetInfo | null,
  toAsset: AssetInfo | null,
  onSelectPair: (from: AssetInfo, to: AssetInfo) => void,
): void {
  const resolved = resolveAssets(route);
  if (!resolved) return;

  if (isActiveRoute(route, fromAsset, toAsset) && route.bidirectional) {
    onSelectPair(resolved.to, resolved.from);
    return;
  }
  onSelectPair(resolved.from, resolved.to);
}

function RecoveryRouteChip({
  route,
  active,
  isActiveChain,
  chainLabel,
  onSelect,
}: {
  route: PopularCommissionRoute;
  active: boolean;
  isActiveChain: boolean;
  chainLabel: string;
  onSelect: (route: PopularCommissionRoute) => void;
}) {
  return (
    <button
      type="button"
      disabled={!isActiveChain}
      onClick={() => onSelect(route)}
      title={
        isActiveChain
          ? route.bidirectional
            ? `${SWAP_SURFACE_COPY.auditedCommissionRouteBadge}: ${route.label}. Click again to reverse.`
            : `${SWAP_SURFACE_COPY.auditedCommissionRouteBadge}: ${route.label}`
          : `Available on ${chainLabel} — switch network first`
      }
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
        !isActiveChain
          ? 'border-white/[0.06] bg-white/[0.02] text-dark-500 cursor-not-allowed'
          : active
            ? 'border-emerald-500/50 bg-emerald-900/40 text-emerald-50'
            : 'border-white/[0.08] bg-white/[0.04] text-dark-200 hover:border-emerald-600/40 hover:bg-emerald-950/30 hover:text-emerald-50'
      }`}
    >
      <span>{route.label}</span>
    </button>
  );
}

/** Compact audited route chips for recovery surfaces (display-only). */
export function CommissionRouteRecoveryChips({
  activeChainId,
  fromAsset,
  toAsset,
  onSelectPair,
}: Props) {
  const routes = useMemo(() => recoveryRoutesForChain(activeChainId), [activeChainId]);

  if (!isCommissionRequiredMode()) return null;
  if (activeChainId !== 1 && activeChainId !== 56) return null;
  if (routes.length === 0) return null;

  const chainLabel = CHAIN_LABELS[activeChainId] || 'Ethereum';

  return (
    <div
      className="flex flex-wrap gap-1.5"
      role="list"
      aria-label={SWAP_SURFACE_COPY.commissionRouteRecoveryChipsLabel}
    >
      {routes.map((route) => {
        if (!resolveAssets(route)) return null;
        return (
          <RecoveryRouteChip
            key={`recovery-${route.chainId}-${route.fromSymbol}-${route.toSymbol}`}
            route={route}
            active={isActiveRoute(route, fromAsset, toAsset)}
            isActiveChain
            chainLabel={chainLabel}
            onSelect={(selected) =>
              handleRouteSelection(selected, fromAsset, toAsset, onSelectPair)
            }
          />
        );
      })}
    </div>
  );
}

/** Amber recovery panel for blocked/unsupported commission pairs (display-only). */
export function CommissionRouteRecoveryPanel({
  activeChainId,
  fromAsset,
  toAsset,
  onSelectPair,
}: Props) {
  if (!isCommissionRequiredMode()) return null;
  if (activeChainId !== 1 && activeChainId !== 56) return null;
  if (recoveryRoutesForChain(activeChainId).length === 0) return null;

  return (
    <div
      className="relative z-10 mt-3 rounded-xl border border-amber-700/35 bg-amber-900/15 px-3 py-2.5 text-sm text-amber-100"
      role="alert"
      aria-live="polite"
    >
      <p className="font-medium text-amber-50">
        {SWAP_SURFACE_COPY.unsupportedCommissionRouteTitle}
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-amber-100/90">
        {SWAP_SURFACE_COPY.commissionRouteRecoveryHelper}
      </p>
      <div className="mt-2">
        <CommissionRouteRecoveryChips
          activeChainId={activeChainId}
          fromAsset={fromAsset}
          toAsset={toAsset}
          onSelectPair={onSelectPair}
        />
      </div>
    </div>
  );
}

export function PopularCommissionRoutes({
  activeChainId,
  fromAsset,
  toAsset,
  onSelectPair,
}: Props) {
  const [activeTab, setActiveTab] = useState<RouteIntelBadge>('most-used');

  const tabRoutes = useMemo(
    () => getRoutesByBadge(activeTab, activeChainId),
    [activeTab, activeChainId],
  );

  if (!isCommissionRequiredMode()) return null;
  if (activeChainId !== 1 && activeChainId !== 56) return null;
  if (tabRoutes.length === 0) return null;

  const handleRouteClick = (route: PopularCommissionRoute) => {
    const resolved = resolveAssets(route);
    if (!resolved) return;

    if (isActiveRoute(route, fromAsset, toAsset) && route.bidirectional) {
      onSelectPair(resolved.to, resolved.from);
      return;
    }
    onSelectPair(resolved.from, resolved.to);
  };

  const visibleRoutes = tabRoutes.filter((intel) => intel.route.chainId === activeChainId);

  return (
    <section
      className="relative z-10 mt-3 rounded-xl border border-emerald-800/25 bg-emerald-950/15 px-3 py-2.5"
      aria-label={SWAP_SURFACE_COPY.popularCommissionRoutesTitle}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-xs font-semibold text-emerald-50">
          {SWAP_SURFACE_COPY.popularCommissionRoutesTitle}
        </h3>
        <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-medium border border-emerald-700/35 bg-emerald-900/30 text-emerald-100/95">
          {SWAP_SURFACE_COPY.auditedCommissionRouteBadge}
        </span>
      </div>

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

      <div className="flex flex-wrap gap-1.5">
        {visibleRoutes.length === 0 ? (
          <p className="text-[10px] text-dark-500 py-1">No routes in this category on this network.</p>
        ) : (
          visibleRoutes.map((intel) => {
            const route = intel.route;
            const resolved = resolveAssets(route);
            if (!resolved) return null;
            const active = isActiveRoute(route, fromAsset, toAsset);
            return (
              <button
                key={`${route.chainId}-${route.label}-${intel.badge}`}
                type="button"
                onClick={() => handleRouteClick(route)}
                title={
                  route.bidirectional
                    ? `${route.label} — tap again to reverse`
                    : route.label
                }
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors ${
                  active
                    ? 'border-emerald-500/50 bg-emerald-900/40 text-emerald-50'
                    : 'border-white/[0.08] bg-white/[0.04] text-dark-200 hover:border-emerald-600/40 hover:bg-emerald-950/30 hover:text-emerald-50'
                }`}
              >
                <span>{intel.pairLabel}</span>
                <RouteIntelBadgePill badge={intel.badge} />
              </button>
            );
          })
        )}
      </div>
    </section>
  );
}
