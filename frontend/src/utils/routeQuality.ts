/**
 * P3.3 — Display-only route quality scoring (no routing / execution changes).
 * Uses commission audit keys + optional live quote provider hint.
 */

import {
  commissionPairKey,
  isCommissionPairAuditBlocked,
  isCommissionPairAuditSupported,
} from '@/constants/commissionCoverage';

export type RouteQualityTier = 'BEST' | 'STRONG' | 'GOOD' | 'LIMITED';

export type RouteQualityResult = {
  tier: RouteQualityTier;
  label: string;
  description: string;
  badgeClass: string;
};

export type RouteQualityOptions = {
  /** Live quote provider when available; falls back to audit snapshot hint. */
  provider?: string | null;
};

const NATIVE_WRAP_KEYS = new Set([
  '1|ETH|WETH',
  '1|WETH|ETH',
  '56|BNB|WBNB',
  '56|WBNB|BNB',
]);

/** V3-canary major/stable pairs — P3.2-C audit snapshot. */
const BEST_PAIR_KEYS = new Set([
  '1|USDC|WETH',
  '1|DAI|WETH',
]);

/** High-liquidity major pairs — bidirectional audit-supported. */
const STRONG_PAIR_KEYS = new Set([
  '1|ETH|USDC',
  '1|ETH|USDT',
  '1|USDT|WETH',
  '56|BNB|USDC',
  '56|BNB|USDT',
  '56|USDT|WBNB',
]);

/** Established token pairs — bidirectional audit-supported. */
const GOOD_PAIR_KEYS = new Set([
  '1|AAVE|WETH',
  '1|LDO|WETH',
  '1|LINK|WETH',
  '1|SNX|WETH',
  '1|PENDLE|WETH',
  '1|UNI|WETH',
  '1|WBTC|WETH',
  '56|BTCB|WBNB',
  '56|CAKE|USDT',
]);

/**
 * Audit snapshot provider hints (canonical pair → forward provider).
 * Source: reports/commission-coverage-audit.json @ P3.2-C.
 */
const AUDIT_PROVIDER_HINT: Record<string, string> = {
  '1|USDC|WETH': 'uniswap-v3-wrapper-v3',
  '1|DAI|WETH': 'uniswap-v3-wrapper-v3',
  '1|USDT|WETH': 'uniswap-v3-wrapper-v2',
  '1|ETH|USDC': 'uniswap-v3-wrapper-v2',
  '1|ETH|USDT': 'uniswap-v3-wrapper-v2',
  '1|AAVE|WETH': 'uniswap-v3-wrapper-v2',
  '1|LDO|WETH': 'uniswap-v3-wrapper-v2',
  '1|SNX|WETH': 'uniswap-v3-wrapper-v3',
  '1|PENDLE|WETH': 'uniswap-v3-wrapper-v3',
  '1|LINK|WETH': 'uniswap-v3-wrapper-v2',
  '1|UNI|WETH': 'uniswap-v3-wrapper-v2',
  '1|WBTC|WETH': 'uniswap-v3-wrapper-v2',
  '56|BNB|USDC': 'pancakeswap-v3-wrapper-v2',
  '56|BNB|USDT': 'pancakeswap-v3-wrapper-v2',
  '56|USDT|WBNB': 'pancakeswap-v3-wrapper-v2',
  '56|BTCB|WBNB': 'pancakeswap-v3-wrapper-v2',
  '56|CAKE|USDT': 'pancakeswap-v3-wrapper-v2',
};

const TIER_SORT_ORDER: Record<RouteQualityTier, number> = {
  BEST: 0,
  STRONG: 1,
  GOOD: 2,
  LIMITED: 3,
};

export function canonicalBidirectionalPairKey(
  chainId: number,
  symbolA: string,
  symbolB: string,
): string {
  const a = symbolA.trim().toUpperCase();
  const b = symbolB.trim().toUpperCase();
  const [lo, hi] = a < b ? [a, b] : [b, a];
  return `${chainId}|${lo}|${hi}`;
}

function isNativeWrapPair(chainId: number, fromSymbol: string, toSymbol: string): boolean {
  return (
    NATIVE_WRAP_KEYS.has(commissionPairKey(chainId, fromSymbol, toSymbol)) ||
    NATIVE_WRAP_KEYS.has(commissionPairKey(chainId, toSymbol, fromSymbol))
  );
}

function isBidirectionalAuditSupported(
  chainId: number,
  fromSymbol: string,
  toSymbol: string,
): boolean {
  return (
    isCommissionPairAuditSupported(chainId, fromSymbol, toSymbol) &&
    isCommissionPairAuditSupported(chainId, toSymbol, fromSymbol)
  );
}

function resolveProviderHint(
  canonicalKey: string,
  provider?: string | null,
): string | null {
  const raw = provider?.trim() || AUDIT_PROVIDER_HINT[canonicalKey] || null;
  return raw ? raw.toLowerCase() : null;
}

function computeRouteQualityTier(
  fromSymbol: string,
  toSymbol: string,
  chainId: number,
  options?: RouteQualityOptions,
): RouteQualityTier {
  if (
    isCommissionPairAuditBlocked(chainId, fromSymbol, toSymbol) ||
    isCommissionPairAuditBlocked(chainId, toSymbol, fromSymbol)
  ) {
    return 'LIMITED';
  }

  if (isNativeWrapPair(chainId, fromSymbol, toSymbol)) {
    return 'LIMITED';
  }

  if (!isBidirectionalAuditSupported(chainId, fromSymbol, toSymbol)) {
    return 'LIMITED';
  }

  const canonical = canonicalBidirectionalPairKey(chainId, fromSymbol, toSymbol);
  const provider = resolveProviderHint(canonical, options?.provider);

  if (BEST_PAIR_KEYS.has(canonical)) {
    return provider === 'uniswap-v3-wrapper-v3' ? 'BEST' : 'STRONG';
  }

  if (STRONG_PAIR_KEYS.has(canonical)) {
    return 'STRONG';
  }

  if (GOOD_PAIR_KEYS.has(canonical)) {
    return 'GOOD';
  }

  return 'LIMITED';
}

export function routeQualityLabel(tier: RouteQualityTier): string {
  switch (tier) {
    case 'BEST':
      return 'Best';
    case 'STRONG':
      return 'Strong';
    case 'GOOD':
      return 'Good';
    case 'LIMITED':
      return 'Limited';
  }
}

export function routeQualityDescription(tier: RouteQualityTier): string {
  switch (tier) {
    case 'BEST':
      return 'Preferred audited commission route with verified bidirectional quotes via the V3 wrapper.';
    case 'STRONG':
      return 'Audited commission route with verified bidirectional quotes on a high-liquidity major pair.';
    case 'GOOD':
      return 'Audited commission route with verified bidirectional quotes on an established pair.';
    case 'LIMITED':
      return 'Not ready for commission route promotion — blocked, wrap-only, or unaudited.';
  }
}

export function routeQualityBadgeClass(tier: RouteQualityTier): string {
  switch (tier) {
    case 'BEST':
      return 'border-emerald-400/55 bg-emerald-900/45 text-emerald-100';
    case 'STRONG':
      return 'border-teal-500/45 bg-teal-950/40 text-teal-100';
    case 'GOOD':
      return 'border-sky-500/40 bg-sky-950/35 text-sky-100';
    case 'LIMITED':
      return 'border-white/[0.08] bg-white/[0.03] text-dark-400';
  }
}

export function getRouteQuality(
  fromSymbol: string,
  toSymbol: string,
  chainId: number,
  options?: RouteQualityOptions,
): RouteQualityResult {
  const tier = computeRouteQualityTier(fromSymbol, toSymbol, chainId, options);
  return {
    tier,
    label: routeQualityLabel(tier),
    description: routeQualityDescription(tier),
    badgeClass: routeQualityBadgeClass(tier),
  };
}

export function compareRouteQuality(
  a: RouteQualityResult,
  b: RouteQualityResult,
): number {
  const byTier = TIER_SORT_ORDER[a.tier] - TIER_SORT_ORDER[b.tier];
  if (byTier !== 0) return byTier;
  return a.label.localeCompare(b.label);
}

export function isPromotableRouteQuality(tier: RouteQualityTier): boolean {
  return tier !== 'LIMITED';
}
