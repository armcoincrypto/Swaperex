/**
 * P3.1 — Popular commission routes (display-only presets).
 * Every entry must pass `isCommissionPairAuditSupported`; regenerate audit via
 * `node scripts/audit/commission-coverage-audit.mjs`.
 * P3.2-C: ⇄ only when both directions are audit-supported.
 */

import {
  commissionPairKey,
  isCommissionPairAuditSupported,
} from '@/constants/commissionCoverage';
import {
  compareRevenueRoutePriority,
  groupPopularCommissionRoutesByRevenue,
} from '@/constants/revenueRoutePriority';
import {
  getRouteQuality,
  isPromotableRouteQuality,
} from '@/utils/routeQuality';

export type PopularCommissionRoute = {
  chainId: number;
  chainLabel: string;
  fromSymbol: string;
  toSymbol: string;
};

/** Curated catalog — revenue display order applied in getVerifiedPopularCommissionRoutes. */
const ROUTE_CATALOG: PopularCommissionRoute[] = [
  { chainId: 1, chainLabel: 'Ethereum', fromSymbol: 'WETH', toSymbol: 'USDC' },
  { chainId: 1, chainLabel: 'Ethereum', fromSymbol: 'WETH', toSymbol: 'DAI' },
  { chainId: 1, chainLabel: 'Ethereum', fromSymbol: 'WETH', toSymbol: 'USDT' },
  { chainId: 1, chainLabel: 'Ethereum', fromSymbol: 'ETH', toSymbol: 'USDC' },
  { chainId: 1, chainLabel: 'Ethereum', fromSymbol: 'ETH', toSymbol: 'USDT' },
  { chainId: 1, chainLabel: 'Ethereum', fromSymbol: 'WETH', toSymbol: 'LINK' },
  { chainId: 1, chainLabel: 'Ethereum', fromSymbol: 'WETH', toSymbol: 'UNI' },
  { chainId: 1, chainLabel: 'Ethereum', fromSymbol: 'WETH', toSymbol: 'WBTC' },
  { chainId: 1, chainLabel: 'Ethereum', fromSymbol: 'WETH', toSymbol: 'AAVE' },
  { chainId: 1, chainLabel: 'Ethereum', fromSymbol: 'WETH', toSymbol: 'LDO' },
  { chainId: 1, chainLabel: 'Ethereum', fromSymbol: 'WETH', toSymbol: 'SNX' },
  { chainId: 1, chainLabel: 'Ethereum', fromSymbol: 'WETH', toSymbol: 'PENDLE' },
  { chainId: 56, chainLabel: 'BNB Chain', fromSymbol: 'BNB', toSymbol: 'USDT' },
  { chainId: 56, chainLabel: 'BNB Chain', fromSymbol: 'BNB', toSymbol: 'USDC' },
  { chainId: 56, chainLabel: 'BNB Chain', fromSymbol: 'WBNB', toSymbol: 'USDT' },
  { chainId: 56, chainLabel: 'BNB Chain', fromSymbol: 'WBNB', toSymbol: 'BTCB' },
  { chainId: 56, chainLabel: 'BNB Chain', fromSymbol: 'CAKE', toSymbol: 'USDT' },
];

/** ⇄ only when both directions are audit-supported; never trust a stale static label. */
export function isPopularRouteBidirectional(route: PopularCommissionRoute): boolean {
  return (
    isCommissionPairAuditSupported(route.chainId, route.fromSymbol, route.toSymbol) &&
    isCommissionPairAuditSupported(route.chainId, route.toSymbol, route.fromSymbol)
  );
}

export function formatPopularRouteLabel(route: PopularCommissionRoute): string {
  const { chainId, fromSymbol, toSymbol } = route;
  const forward = isCommissionPairAuditSupported(chainId, fromSymbol, toSymbol);
  const reverse = isCommissionPairAuditSupported(chainId, toSymbol, fromSymbol);
  if (forward && reverse) return `${fromSymbol} ⇄ ${toSymbol}`;
  if (forward) return `${fromSymbol} → ${toSymbol}`;
  if (reverse) return `${toSymbol} → ${fromSymbol}`;
  return `${fromSymbol} → ${toSymbol}`;
}

const NATIVE_WRAP_KEYS = new Set([
  '1|ETH|WETH',
  '1|WETH|ETH',
  '56|BNB|WBNB',
  '56|WBNB|BNB',
]);

function routeIsAuditVerified(route: PopularCommissionRoute): boolean {
  const { chainId, fromSymbol, toSymbol } = route;
  const forwardKey = commissionPairKey(chainId, fromSymbol, toSymbol);
  if (NATIVE_WRAP_KEYS.has(forwardKey)) return false;
  return (
    isCommissionPairAuditSupported(chainId, fromSymbol, toSymbol) ||
    isCommissionPairAuditSupported(chainId, toSymbol, fromSymbol)
  );
}

/** Audited routes only — never includes PEPE, native wrap, or LIMITED quality. */
export function getVerifiedPopularCommissionRoutes(): PopularCommissionRoute[] {
  return ROUTE_CATALOG.filter(routeIsAuditVerified)
    .filter((route) =>
      isPromotableRouteQuality(
        getRouteQuality(route.fromSymbol, route.toSymbol, route.chainId).tier,
      ),
    )
    .sort(compareRevenueRoutePriority);
}

/** @deprecated Use groupPopularCommissionRoutesByRevenue from revenueRoutePriority.ts */
export function groupPopularCommissionRoutes(
  routes: PopularCommissionRoute[],
  activeChainId: number,
): { chainId: number; chainLabel: string; routes: PopularCommissionRoute[] }[] {
  return groupPopularCommissionRoutesByRevenue(routes, activeChainId).map((g) => ({
    chainId: g.chainId,
    chainLabel: g.chainLabel,
    routes: g.sections.flatMap((s) => s.routes),
  }));
}
