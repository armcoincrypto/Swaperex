/**
 * P3.4 — Display-only revenue route priority (no routing / execution changes).
 * Guides users toward high-value audited commission routes via UX ordering only.
 */

import { commissionPairKey } from '@/constants/commissionCoverage';
import type { PopularCommissionRoute } from '@/constants/popularCommissionRoutes';
import {
  canonicalBidirectionalPairKey,
  compareRouteQuality,
  getRouteQuality,
} from '@/utils/routeQuality';

export type RevenueRouteGroupId = 'stablecoin' | 'major' | 'ecosystem';

/** Section labels within the popular routes panel. */
export const REVENUE_ROUTE_GROUP_LABELS: Record<RevenueRouteGroupId, string> = {
  stablecoin: 'Best stablecoin routes',
  major: 'Major token routes',
  ecosystem: 'Ecosystem routes',
};

const GROUP_DISPLAY_ORDER: RevenueRouteGroupId[] = ['stablecoin', 'major', 'ecosystem'];

/**
 * Operator demand priority within each chain (catalog orientation).
 * Quality tier still sorts first via compareRouteQuality.
 */
export const REVENUE_ROUTE_PRIORITY_ORDER: string[] = [
  // Ethereum
  '1|WETH|USDC',
  '1|WETH|DAI',
  '1|WETH|USDT',
  '1|ETH|USDC',
  '1|ETH|USDT',
  '1|WETH|LINK',
  '1|WETH|UNI',
  '1|WETH|WBTC',
  '1|WETH|AAVE',
  '1|WETH|LDO',
  '1|WETH|SNX',
  '1|WETH|PENDLE',
  // BSC
  '56|BNB|USDT',
  '56|BNB|USDC',
  '56|WBNB|USDT',
  '56|WBNB|BTCB',
  '56|CAKE|USDT',
];

/** Canonical bidirectional keys — only top audited commission routes. */
export const RECOMMENDED_ROUTE_CANONICAL_KEYS = new Set<string>([
  '1|USDC|WETH',
  '1|DAI|WETH',
  '1|USDT|WETH',
  '1|ETH|USDC',
  '1|ETH|USDT',
  '56|BNB|USDC',
  '56|BNB|USDT',
]);

const ROUTE_GROUP_BY_CATALOG_KEY: Record<string, RevenueRouteGroupId> = {
  '1|WETH|USDC': 'stablecoin',
  '1|WETH|DAI': 'stablecoin',
  '1|WETH|USDT': 'stablecoin',
  '1|ETH|USDC': 'stablecoin',
  '1|ETH|USDT': 'stablecoin',
  '1|WETH|LINK': 'major',
  '1|WETH|UNI': 'major',
  '1|WETH|WBTC': 'major',
  '56|BNB|USDT': 'stablecoin',
  '56|BNB|USDC': 'stablecoin',
  '56|WBNB|USDT': 'stablecoin',
  '56|WBNB|BTCB': 'major',
  '1|WETH|AAVE': 'ecosystem',
  '1|WETH|LDO': 'ecosystem',
  '1|WETH|SNX': 'ecosystem',
  '1|WETH|PENDLE': 'ecosystem',
  '56|CAKE|USDT': 'ecosystem',
};

const PRIORITY_INDEX = new Map(
  REVENUE_ROUTE_PRIORITY_ORDER.map((key, index) => [key, index]),
);

export function catalogRouteKey(route: PopularCommissionRoute): string {
  return commissionPairKey(route.chainId, route.fromSymbol, route.toSymbol);
}

export function getRevenueRoutePriorityIndex(route: PopularCommissionRoute): number {
  return PRIORITY_INDEX.get(catalogRouteKey(route)) ?? 999;
}

export function getRevenueRouteGroup(route: PopularCommissionRoute): RevenueRouteGroupId {
  return ROUTE_GROUP_BY_CATALOG_KEY[catalogRouteKey(route)] ?? 'ecosystem';
}

export function isRecommendedRevenueRoute(
  chainId: number,
  fromSymbol: string,
  toSymbol: string,
): boolean {
  const canonical = canonicalBidirectionalPairKey(chainId, fromSymbol, toSymbol);
  return RECOMMENDED_ROUTE_CANONICAL_KEYS.has(canonical);
}

export function compareRevenueRoutePriority(
  a: PopularCommissionRoute,
  b: PopularCommissionRoute,
): number {
  const byQuality = compareRouteQuality(
    getRouteQuality(a.fromSymbol, a.toSymbol, a.chainId),
    getRouteQuality(b.fromSymbol, b.toSymbol, b.chainId),
  );
  if (byQuality !== 0) return byQuality;

  const byDemand = getRevenueRoutePriorityIndex(a) - getRevenueRoutePriorityIndex(b);
  if (byDemand !== 0) return byDemand;

  return catalogRouteKey(a).localeCompare(catalogRouteKey(b));
}

export type RevenueRouteSection = {
  groupId: RevenueRouteGroupId;
  groupLabel: string;
  routes: PopularCommissionRoute[];
};

export type RevenueRouteChainGroup = {
  chainId: number;
  chainLabel: string;
  sections: RevenueRouteSection[];
};

export function groupPopularCommissionRoutesByRevenue(
  routes: PopularCommissionRoute[],
  activeChainId: number,
): RevenueRouteChainGroup[] {
  const byChain = new Map<number, PopularCommissionRoute[]>();
  for (const route of routes) {
    const list = byChain.get(route.chainId) ?? [];
    list.push(route);
    byChain.set(route.chainId, list);
  }

  const chainOrder =
    activeChainId === 56 ? [56, 1] : activeChainId === 1 ? [1, 56] : [1, 56];

  const groups: RevenueRouteChainGroup[] = [];

  for (const chainId of chainOrder) {
    const chainRoutes = byChain.get(chainId);
    if (!chainRoutes?.length) continue;

    const sorted = [...chainRoutes].sort(compareRevenueRoutePriority);
    const sectionsByGroup = new Map<RevenueRouteGroupId, PopularCommissionRoute[]>();

    for (const route of sorted) {
      const groupId = getRevenueRouteGroup(route);
      const list = sectionsByGroup.get(groupId) ?? [];
      list.push(route);
      sectionsByGroup.set(groupId, list);
    }

    const sections: RevenueRouteSection[] = [];
    for (const groupId of GROUP_DISPLAY_ORDER) {
      const list = sectionsByGroup.get(groupId);
      if (list?.length) {
        sections.push({
          groupId,
          groupLabel: REVENUE_ROUTE_GROUP_LABELS[groupId],
          routes: list,
        });
      }
    }

    groups.push({
      chainId,
      chainLabel: sorted[0].chainLabel,
      sections,
    });
  }

  return groups;
}
