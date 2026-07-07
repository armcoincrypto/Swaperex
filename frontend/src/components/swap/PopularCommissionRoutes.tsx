/**
 * P3.1 — Audited commission route shortcuts (display-only; no routing changes).
 */

import { useMemo } from 'react';
import type { AssetInfo } from '@/types/api';
import { isCommissionRequiredMode } from '@/config';
import {
  getVerifiedPopularCommissionRoutes,
  type PopularCommissionRoute,
} from '@/constants/popularCommissionRoutes';
import { SWAP_SURFACE_COPY } from '@/constants/swapSurfaceCopy';
import { logRevenueTelemetry } from '@/utils/revenueTelemetry';
import {
  isActiveCommissionRoute,
  resolveRouteAssets,
  selectCommissionRoute,
} from '@/components/trading/routeDiscoverySelection';

const CHAIN_LABELS: Record<number, string> = {
  1: 'Ethereum',
  56: 'BNB Chain',
};

const RECOVERY_ROUTE_LIMIT = 6;

type Props = {
  activeChainId: number;
  fromAsset: AssetInfo | null;
  toAsset: AssetInfo | null;
  onSelectPair: (from: AssetInfo, to: AssetInfo) => void;
};

function recoveryRoutesForChain(chainId: number): PopularCommissionRoute[] {
  return getVerifiedPopularCommissionRoutes()
    .filter((route) => route.chainId === chainId)
    .slice(0, RECOVERY_ROUTE_LIMIT);
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
        if (!resolveRouteAssets(route)) return null;
        return (
          <RecoveryRouteChip
            key={`recovery-${route.chainId}-${route.fromSymbol}-${route.toSymbol}`}
            route={route}
            active={isActiveCommissionRoute(route, fromAsset, toAsset)}
            isActiveChain
            chainLabel={chainLabel}
            onSelect={(selected) => {
              logRevenueTelemetry('pair_selected', {
                chainId: selected.chainId,
                fromSymbol: selected.fromSymbol,
                toSymbol: selected.toSymbol,
                pairKey: `${selected.chainId}|${selected.fromSymbol}|${selected.toSymbol}`,
                source: 'recovery_chip',
              });
              selectCommissionRoute(selected, fromAsset, toAsset, onSelectPair);
            }}
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

