/**
 * Trading intelligence — display-only route rankings derived from audited catalog.
 * No backend telemetry; does not fabricate live trades or wallet activity.
 */

import type { AssetInfo } from '@/types/api';
import { getTokenBySymbol, isNativeToken } from '@/tokens';
import {
  getVerifiedPopularCommissionRoutes,
  type PopularCommissionRoute,
} from '@/constants/popularCommissionRoutes';

export type RouteIntelBadge = 'most-used' | 'trending' | 'audited';

export interface TradingRouteIntel {
  route: PopularCommissionRoute;
  badge: RouteIntelBadge;
  /** One-way display e.g. "ETH → USDT" */
  pairLabel: string;
  rank: number;
}

const CHAIN_NAMES: Record<number, string> = {
  1: 'ethereum',
  56: 'bsc',
};

/** Curated trending highlights (matches product examples). */
const TRENDING_PAIR_KEYS = new Set([
  '1|ETH|USDT',
  '1|USDC|ETH',
  '1|ETH|USDC',
  '56|WBNB|USDT',
  '56|BNB|USDT',
  '1|WETH|USDC',
]);

/** First N catalog entries per chain treated as "most used" by display rank. */
const MOST_USED_PER_CHAIN = 4;

function pairKey(chainId: number, from: string, to: string): string {
  return `${chainId}|${from.trim().toUpperCase()}|${to.trim().toUpperCase()}`;
}

function forwardPairLabel(route: PopularCommissionRoute): string {
  return `${route.fromSymbol} → ${route.toSymbol}`;
}

function assignBadge(route: PopularCommissionRoute, chainRank: number): RouteIntelBadge {
  const key = pairKey(route.chainId, route.fromSymbol, route.toSymbol);
  if (TRENDING_PAIR_KEYS.has(key)) return 'trending';
  if (chainRank < MOST_USED_PER_CHAIN) return 'most-used';
  return 'audited';
}

function enrichRoutes(activeChainId: number): TradingRouteIntel[] {
  const routes = getVerifiedPopularCommissionRoutes();
  const chainRanks = new Map<number, number>();
  const intel: TradingRouteIntel[] = [];

  for (const [index, route] of routes.entries()) {
    const rankInChain = chainRanks.get(route.chainId) ?? 0;
    chainRanks.set(route.chainId, rankInChain + 1);
    const badge = assignBadge(route, rankInChain);
    const chainBoost = route.chainId === activeChainId ? 0 : 100;
    intel.push({
      route,
      badge,
      pairLabel: forwardPairLabel(route),
      rank: chainBoost + index,
    });
  }

  /** Trending keys may request reverse of bidirectional audited pairs (e.g. USDC → ETH). */
  for (const route of routes) {
    if (!route.bidirectional) continue;
    const reverseKey = pairKey(route.chainId, route.toSymbol, route.fromSymbol);
    if (!TRENDING_PAIR_KEYS.has(reverseKey)) continue;
    if (TRENDING_PAIR_KEYS.has(pairKey(route.chainId, route.fromSymbol, route.toSymbol))) continue;
    const chainBoost = route.chainId === activeChainId ? 0 : 100;
    intel.push({
      route,
      badge: 'trending',
      pairLabel: `${route.toSymbol} → ${route.fromSymbol}`,
      rank: chainBoost + 0.5,
    });
  }

  return intel;
}

export function getTrendingPairs(activeChainId: number, limit = 6): TradingRouteIntel[] {
  return enrichRoutes(activeChainId)
    .filter((r) => r.badge === 'trending' || r.badge === 'most-used')
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit);
}

export function getPopularActivityFeed(activeChainId: number, limit = 5): TradingRouteIntel[] {
  /** Rotating display order — derived from catalog popularity, not live trades. */
  return enrichRoutes(activeChainId)
    .sort((a, b) => {
      const tierOrder = (badge: RouteIntelBadge) =>
        badge === 'most-used' ? 0 : badge === 'trending' ? 1 : 2;
      const d = tierOrder(a.badge) - tierOrder(b.badge);
      return d !== 0 ? d : a.rank - b.rank;
    })
    .slice(0, limit);
}

export function getRoutesByBadge(
  badge: RouteIntelBadge,
  activeChainId: number,
): TradingRouteIntel[] {
  return enrichRoutes(activeChainId)
    .filter((r) => r.badge === badge)
    .sort((a, b) => a.rank - b.rank);
}

export function routeIntelBadgeLabel(badge: RouteIntelBadge): string {
  switch (badge) {
    case 'most-used':
      return 'Most used';
    case 'trending':
      return 'Trending';
    case 'audited':
      return 'Audited';
  }
}

export function routeIntelToAssets(
  intel: TradingRouteIntel,
): { from: AssetInfo; to: AssetInfo } | null {
  const { route, pairLabel } = intel;
  const [fromSym, toSym] = pairLabel.split(' → ').map((s) => s.trim());
  if (!fromSym || !toSym) return null;

  const fromToken = getTokenBySymbol(fromSym, route.chainId);
  const toToken = getTokenBySymbol(toSym, route.chainId);
  if (!fromToken || !toToken) return null;

  const chain = CHAIN_NAMES[route.chainId] || 'ethereum';
  return {
    from: {
      symbol: fromToken.symbol,
      name: fromToken.name,
      chain,
      decimals: fromToken.decimals,
      is_native: isNativeToken(fromToken.address),
      contract_address: fromToken.address,
      logo_url: fromToken.logoURI,
    },
    to: {
      symbol: toToken.symbol,
      name: toToken.name,
      chain,
      decimals: toToken.decimals,
      is_native: isNativeToken(toToken.address),
      contract_address: toToken.address,
      logo_url: toToken.logoURI,
    },
  };
}
