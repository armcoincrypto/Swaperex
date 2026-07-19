/**
 * Homepage popular-route chip contract — resolves curated labels through
 * certified coverage + shared navigation helpers (no manual URL assembly).
 */

import {
  getVerifiedPopularCommissionRoutes,
  type PopularCommissionRoute,
} from '@/constants/popularCommissionRoutes';
import {
  buildCertifiedDirectionalSwapNavigation,
  getSwapAvailability,
} from '@/utils/swapAvailability';

export type HomepageRouteChipMode = 'executable' | 'informational';

export type HomepageRouteChip = {
  chainId: number;
  tokenIn: string;
  tokenOut: string;
  label: string;
  chainLabel: string;
  mode: HomepageRouteChipMode;
  /** Query string without leading `?` — only when mode === 'executable' */
  search?: string;
  reason?: string;
};

export function resolveHomepageRouteChip(route: PopularCommissionRoute): HomepageRouteChip {
  const base = {
    chainId: route.chainId,
    tokenIn: route.fromSymbol.toUpperCase(),
    tokenOut: route.toSymbol.toUpperCase(),
    label: route.label,
    chainLabel: route.chainLabel,
  };

  const availability = getSwapAvailability({
    chainId: route.chainId,
    tokenIn: route.fromSymbol,
    tokenOut: route.toSymbol,
  });

  if (availability.status !== 'executable') {
    return {
      ...base,
      mode: 'informational',
      reason: String(availability.reason ?? availability.status),
    };
  }

  const nav = buildCertifiedDirectionalSwapNavigation({
    chainId: route.chainId,
    tokenIn: route.fromSymbol,
    tokenOut: route.toSymbol,
  });
  if (!nav) {
    return {
      ...base,
      mode: 'informational',
      reason: 'navigation_unavailable',
    };
  }

  return {
    ...base,
    tokenIn: nav.fromSymbol,
    tokenOut: nav.toSymbol,
    mode: 'executable',
    search: nav.search,
  };
}

export function listHomepagePopularRouteChips(): HomepageRouteChip[] {
  return getVerifiedPopularCommissionRoutes().map(resolveHomepageRouteChip);
}

export function listExecutableHomepageRouteChips(): HomepageRouteChip[] {
  return listHomepagePopularRouteChips().filter((c) => c.mode === 'executable');
}
