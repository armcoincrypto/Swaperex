/**
 * Commission-wrapper route support hints for the token picker.
 * Soft UX metadata only — execution remains fail-closed in `useSwap`.
 *
 * Supported tiers are derived from `commissionCoverage` so picker hints cannot
 * drift ahead of certified commission routes.
 */

import {
  COMMISSION_AUDIT_BLOCKED_PAIR_KEYS,
  COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS,
} from '@/constants/commissionCoverage';
import { getTokenBySymbol, isNativeToken, isStaticToken, NATIVE_SYMBOLS } from '@/tokens';

export type RouteSupportStatus = 'supported' | 'likely_supported' | 'limited' | 'unknown';

/** Soft tiers for tokens that are listed but not yet certified as commission routes. */
const ETH_LIKELY = new Set(['ARB', 'OP']);
const ETH_LIMITED = new Set([
  'SNX',
  'PENDLE',
  'PEPE',
  'SHIB',
  'FET',
  'GRT',
  'SUSHI',
  'SAND',
  'APE',
  'MKR',
]);

const BSC_LIKELY = new Set(['LINK', 'XRP', 'DOGE']);
const BSC_LIMITED = new Set([
  'WBNB',
  'FDUSD',
  'ADA',
  'DOT',
  'LTC',
  'TRX',
  'PEPE',
  'FLOKI',
  'TWT',
  'XVS',
  'BUSD',
  'TUSD',
]);

const ROUTE_WRAP_TOOLTIP =
  'Route support means Kobbex may be able to quote this token through its commission wrapper.';

const STATUS_RANK: Record<RouteSupportStatus, number> = {
  supported: 0,
  likely_supported: 1,
  limited: 2,
  unknown: 3,
};

function symbolsCertifiedOnChain(chainId: number): Set<string> {
  const out = new Set<string>();
  for (const key of COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS) {
    const [cid, from, to] = key.split('|');
    if (Number(cid) !== chainId) continue;
    if (from) out.add(from.toUpperCase());
    if (to) out.add(to.toUpperCase());
  }
  return out;
}

function isPolicyBlockedSymbol(chainId: number, symbol: string): boolean {
  const sym = symbol.toUpperCase();
  for (const key of COMMISSION_AUDIT_BLOCKED_PAIR_KEYS) {
    const [cid, from, to] = key.split('|');
    if (Number(cid) !== chainId) continue;
    if (from === sym || to === sym) return true;
  }
  return false;
}

const ETH_SUPPORTED = symbolsCertifiedOnChain(1);
const BSC_SUPPORTED = symbolsCertifiedOnChain(56);

function symbolFromNativeOrStatic(chainId: number, symbol: string): string {
  const native = (NATIVE_SYMBOLS[chainId] || 'ETH').toUpperCase();
  if (symbol.toUpperCase() === native) return native;
  return symbol.toUpperCase();
}

/**
 * Route support for a token on a chain. Custom / non-static registry tokens → `unknown`.
 */
export function getTokenRouteSupport(
  chainId: number,
  input: { symbol: string; contract_address?: string | null; isCustom?: boolean } | string,
): RouteSupportStatus {
  const symbol = typeof input === 'string' ? input : input.symbol;
  const isCustomFlag = typeof input === 'object' && input.isCustom === true;
  let addr = typeof input === 'object' ? input.contract_address : undefined;

  if (!symbol?.trim()) return 'unknown';

  if (isCustomFlag) return 'unknown';

  if (addr == null || addr === '') {
    const t = getTokenBySymbol(symbol, chainId);
    addr = t?.address;
  }

  if (addr && !isNativeToken(addr) && !isStaticToken(addr, chainId)) {
    return 'unknown';
  }

  const sym = symbolFromNativeOrStatic(chainId, symbol);

  if (chainId === 1) {
    if (isPolicyBlockedSymbol(1, sym) && !ETH_SUPPORTED.has(sym)) return 'limited';
    if (ETH_SUPPORTED.has(sym)) return 'supported';
    if (ETH_LIKELY.has(sym)) return 'likely_supported';
    if (ETH_LIMITED.has(sym)) return 'limited';
    return 'unknown';
  }

  if (chainId === 56) {
    if (isPolicyBlockedSymbol(56, sym) && !BSC_SUPPORTED.has(sym)) return 'limited';
    if (BSC_SUPPORTED.has(sym)) return 'supported';
    if (BSC_LIKELY.has(sym)) return 'likely_supported';
    if (BSC_LIMITED.has(sym)) return 'limited';
    return 'unknown';
  }

  return 'unknown';
}

export function getRouteSupportLabel(status: RouteSupportStatus): string {
  switch (status) {
    case 'supported':
      return 'Supported';
    case 'likely_supported':
      return 'Likely';
    case 'limited':
      return 'Limited';
    default:
      return 'Unknown';
  }
}

export function getRouteSupportDescription(status: RouteSupportStatus): string {
  switch (status) {
    case 'supported':
      return 'Certified commission wrapper route.';
    case 'likely_supported':
      return 'Usually available; quote depends on liquidity.';
    case 'limited':
      return 'May not quote through current production-certified routes.';
    default:
      return 'Route support unknown.';
  }
}

export function routeSupportBadgeTooltip(status: RouteSupportStatus): string {
  return `${ROUTE_WRAP_TOOLTIP} ${getRouteSupportDescription(status)}`.trim();
}

/** Lower rank = stronger support (for sorting: supported first). */
export function compareRouteSupport(a: RouteSupportStatus, b: RouteSupportStatus): number {
  return STATUS_RANK[a] - STATUS_RANK[b];
}

export { ROUTE_WRAP_TOOLTIP };
