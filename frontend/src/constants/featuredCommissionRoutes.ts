/**
 * P4A — Featured audited commission routes (display-only; existing pairs only).
 */

import {
  commissionPairKey,
  isCommissionPairAuditSupported,
} from '@/constants/commissionCoverage';
import type { PopularCommissionRoute } from '@/constants/popularCommissionRoutes';

/** Curated homepage / swap-card featured pairs — must pass commission audit. */
const FEATURED_CATALOG: PopularCommissionRoute[] = [
  {
    chainId: 1,
    chainLabel: 'Ethereum',
    fromSymbol: 'WETH',
    toSymbol: 'USDC',
    label: 'WETH ⇄ USDC',
    bidirectional: true,
  },
  {
    chainId: 1,
    chainLabel: 'Ethereum',
    fromSymbol: 'WETH',
    toSymbol: 'USDT',
    label: 'WETH ⇄ USDT',
    bidirectional: true,
  },
  {
    chainId: 1,
    chainLabel: 'Ethereum',
    fromSymbol: 'WETH',
    toSymbol: 'DAI',
    label: 'WETH ⇄ DAI',
    bidirectional: true,
  },
  {
    chainId: 56,
    chainLabel: 'BNB Chain',
    fromSymbol: 'WBNB',
    toSymbol: 'USDT',
    label: 'WBNB ⇄ USDT',
    bidirectional: true,
  },
  {
    chainId: 56,
    chainLabel: 'BNB Chain',
    fromSymbol: 'WBNB',
    toSymbol: 'USDC',
    label: 'WBNB ⇄ USDC',
    bidirectional: true,
  },
  {
    chainId: 56,
    chainLabel: 'BNB Chain',
    fromSymbol: 'WBNB',
    toSymbol: 'CAKE',
    label: 'WBNB ⇄ CAKE',
    bidirectional: true,
  },
];

const NATIVE_WRAP_KEYS = new Set([
  '1|ETH|WETH',
  '1|WETH|ETH',
  '56|BNB|WBNB',
  '56|WBNB|BNB',
]);

function routeIsAuditVerified(route: PopularCommissionRoute): boolean {
  const forwardKey = commissionPairKey(route.chainId, route.fromSymbol, route.toSymbol);
  if (NATIVE_WRAP_KEYS.has(forwardKey)) return false;
  if (!isCommissionPairAuditSupported(route.chainId, route.fromSymbol, route.toSymbol)) {
    return false;
  }
  if (route.bidirectional) {
    return isCommissionPairAuditSupported(route.chainId, route.toSymbol, route.fromSymbol);
  }
  return true;
}

export type FeaturedRouteBadge = 'featured' | 'audited' | 'high-liquidity';

const FEATURED_BADGE_BY_KEY: Record<string, FeaturedRouteBadge> = {
  '1|WETH|USDC': 'featured',
  '1|WETH|USDT': 'featured',
  '1|WETH|DAI': 'audited',
  '56|WBNB|USDT': 'featured',
  '56|WBNB|USDC': 'high-liquidity',
  '56|WBNB|CAKE': 'audited',
};

export function getFeaturedRouteBadge(route: PopularCommissionRoute): FeaturedRouteBadge {
  const key = commissionPairKey(route.chainId, route.fromSymbol, route.toSymbol);
  return FEATURED_BADGE_BY_KEY[key] ?? 'audited';
}

export function featuredRouteBadgeLabel(badge: FeaturedRouteBadge): string {
  switch (badge) {
    case 'featured':
      return 'High liquidity';
    case 'high-liquidity':
      return 'High liquidity';
    case 'audited':
      return 'Certified';
  }
}

/** All featured routes that pass live audit allowlist. */
export function getFeaturedCommissionRoutes(): PopularCommissionRoute[] {
  return FEATURED_CATALOG.filter(routeIsAuditVerified);
}

/** Featured routes for a swap-ready chain (1 or 56). */
export function getFeaturedRoutesForSwapChain(chainId: number): PopularCommissionRoute[] {
  return getFeaturedCommissionRoutes().filter((r) => r.chainId === chainId);
}
