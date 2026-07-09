/**
 * P2.1 — Single source of truth for swap-card routing *display* (UX only).
 * Authority: successful quote > commission error > native/wrapped pair > soft heuristic.
 * Does not change quote fetching, wrapper selection, or execution.
 */

import {
  computeRoutePrecheck,
  type RoutePrecheckAsset,
  type RoutePrecheckStatus,
} from '@/utils/routePrecheck';
import type { RouteSupportStatus } from '@/utils/routeSupport';
import { getTokenRouteSupport } from '@/utils/routeSupport';
import type { QuoteFailureReasonCode } from '@/utils/errors';
import { SWAP_SURFACE_COPY } from '@/constants/swapSurfaceCopy';
import { getWrappedNativeAddress, isNativeToken } from '@/tokens';

export type RoutingDisplayStatus =
  | 'success_route'
  | 'unsupported_commission'
  | 'native_wrapped_pair'
  | 'loading_quote'
  | 'heuristic_likely'
  | 'heuristic_limited'
  | 'heuristic_no_recent'
  | 'heuristic_unknown'
  | 'heuristic_checking';

export type RoutingDisplayInput = {
  chainId: number;
  fromAsset: RoutePrecheckAsset;
  toAsset: RoutePrecheckAsset;
  fromRouteSupport: RouteSupportStatus;
  toRouteSupport: RouteSupportStatus;
  hasUsableQuote: boolean;
  quoteSuccess: boolean;
  quoteErrorReasonCode: QuoteFailureReasonCode | null | undefined;
  isQuoteFetchUiLoading: boolean;
};

export type RoutingDisplayView = {
  status: RoutingDisplayStatus;
  /** Soft precheck row under pay/receive (never alongside unsupported amber panel). */
  showPrecheckRow: boolean;
  /** Large amber unsupported panel (commission route failure). */
  showUnsupportedPanel: boolean;
};

const NATIVE_WRAPPED: Record<number, { native: string; wrapped: string }> = {
  1: { native: 'ETH', wrapped: 'WETH' },
  56: { native: 'BNB', wrapped: 'WBNB' },
};

function normSym(s: string): string {
  return s.trim().toUpperCase();
}

/** ETH↔WETH, BNB↔WBNB — wrap/unwrap, not a normal DEX swap route. */
export function isNativeWrappedPair(
  chainId: number,
  fromAsset: RoutePrecheckAsset,
  toAsset: RoutePrecheckAsset,
): boolean {
  const cfg = NATIVE_WRAPPED[chainId];
  if (!cfg || !fromAsset || !toAsset) return false;

  const wrappedAddr = getWrappedNativeAddress(chainId).toLowerCase();

  const isNativeSide = (a: NonNullable<RoutePrecheckAsset>): boolean => {
    if (a.is_native === true) return true;
    if (normSym(a.symbol) === cfg.native) return true;
    if (a.contract_address && isNativeToken(a.contract_address)) return true;
    return false;
  };

  const isWrappedSide = (a: NonNullable<RoutePrecheckAsset>): boolean => {
    if (normSym(a.symbol) === cfg.wrapped) return true;
    if (wrappedAddr && a.contract_address?.toLowerCase() === wrappedAddr) return true;
    return false;
  };

  return (
    (isNativeSide(fromAsset) && isWrappedSide(toAsset)) ||
    (isWrappedSide(fromAsset) && isNativeSide(toAsset))
  );
}

function mapPrecheckToHeuristic(precheck: RoutePrecheckStatus): RoutingDisplayStatus {
  switch (precheck) {
    case 'likely_routable':
      return 'heuristic_likely';
    case 'limited':
      return 'heuristic_limited';
    case 'no_recent_success':
      return 'heuristic_no_recent';
    case 'checking':
      return 'heuristic_checking';
    default:
      return 'heuristic_unknown';
  }
}

/**
 * Resolves what routing truth the swap card should show (display-only).
 */
export function getRoutingDisplayStatus(input: RoutingDisplayInput): RoutingDisplayView {
  const {
    chainId,
    fromAsset,
    toAsset,
    fromRouteSupport,
    toRouteSupport,
    hasUsableQuote,
    quoteSuccess,
    quoteErrorReasonCode,
    isQuoteFetchUiLoading,
  } = input;

  if (!fromAsset || !toAsset) {
    return {
      status: 'heuristic_checking',
      showPrecheckRow: false,
      showUnsupportedPanel: false,
    };
  }

  if (hasUsableQuote && quoteSuccess) {
    return {
      status: 'success_route',
      showPrecheckRow: false,
      showUnsupportedPanel: false,
    };
  }

  if (quoteErrorReasonCode === 'unsupported_commission_route') {
    return {
      status: 'unsupported_commission',
      showPrecheckRow: false,
      showUnsupportedPanel: true,
    };
  }

  if (isNativeWrappedPair(chainId, fromAsset, toAsset)) {
    return {
      status: 'native_wrapped_pair',
      showPrecheckRow: true,
      showUnsupportedPanel: false,
    };
  }

  if (isQuoteFetchUiLoading) {
    return {
      status: 'loading_quote',
      showPrecheckRow: true,
      showUnsupportedPanel: false,
    };
  }

  const precheck = computeRoutePrecheck({
    chainId,
    fromAsset,
    toAsset,
    fromRouteSupport,
    toRouteSupport,
  });

  return {
    status: mapPrecheckToHeuristic(precheck),
    showPrecheckRow: true,
    showUnsupportedPanel: false,
  };
}

/** Build route-support inputs from swap assets (display-only). */
export function routeSupportForAsset(
  chainId: number,
  asset: {
    symbol: string;
    contract_address?: string | null;
    isCustom?: boolean;
  } | null,
): RouteSupportStatus {
  if (!asset) return 'unknown';
  return getTokenRouteSupport(chainId, {
    symbol: asset.symbol,
    contract_address: asset.contract_address,
    isCustom: asset.isCustom,
  });
}

export function getRoutingDisplayBadgeLabel(status: RoutingDisplayStatus): string {
  switch (status) {
    case 'native_wrapped_pair':
      return 'Wrap / unwrap';
    case 'unsupported_commission':
      return 'Not available';
    case 'loading_quote':
      return 'Getting quote…';
    case 'heuristic_likely':
      return 'Audited route available';
    case 'heuristic_limited':
      return 'Route depends on live liquidity';
    case 'heuristic_no_recent':
      return 'No recent route';
    case 'heuristic_checking':
      return 'Checking…';
    case 'success_route':
      return 'Wrapper route supported';
    default:
      return 'Unknown route';
  }
}

export function getRoutingDisplayDescription(
  status: RoutingDisplayStatus,
  chainId = 1,
): string {
  switch (status) {
    case 'native_wrapped_pair':
      return chainId === 56
        ? SWAP_SURFACE_COPY.nativeWrappedPairRouteHelperBsc
        : SWAP_SURFACE_COPY.nativeWrappedPairRouteHelperEth;
    case 'unsupported_commission':
      return SWAP_SURFACE_COPY.unsupportedCommissionRouteHelper;
    case 'loading_quote':
      return 'Checking route with Swaperex commission wrapper…';
    case 'heuristic_likely':
      return 'Audited wrapper route available. Final quote depends on live liquidity.';
    case 'heuristic_limited':
      return 'Route depends on live liquidity. This pair may not quote through Swaperex commission routing.';
    case 'heuristic_no_recent':
      return 'No recent successful wrapper route seen for this pair.';
    case 'heuristic_checking':
      return 'Checking route confidence…';
    case 'success_route':
      return 'Audited wrapper route available. Final quote depends on live liquidity.';
    default:
      return 'Route support unknown. Quote may fail.';
  }
}

export function routingDisplayBadgeClass(status: RoutingDisplayStatus): string {
  switch (status) {
    case 'native_wrapped_pair':
      return 'bg-slate-800/80 text-slate-200 border-white/[0.1]';
    case 'unsupported_commission':
      return 'bg-amber-950/35 text-amber-100/95 border-amber-700/40';
    case 'loading_quote':
    case 'heuristic_checking':
      return 'bg-dark-600/60 text-dark-400 border-white/[0.06]';
    case 'heuristic_likely':
      return 'bg-emerald-900/30 text-emerald-100/95 border-emerald-700/30';
    case 'heuristic_limited':
      return 'bg-amber-900/25 text-amber-100/90 border-amber-700/35';
    case 'heuristic_no_recent':
      return 'bg-slate-800/80 text-slate-200 border-white/[0.08]';
    case 'success_route':
      return 'bg-emerald-900/30 text-emerald-100/95 border-emerald-700/30';
    default:
      return 'bg-dark-600/70 text-dark-400 border-white/[0.08]';
  }
}
