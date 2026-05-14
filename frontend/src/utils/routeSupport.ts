/**
 * Commission-wrapper route support hints for the token picker (P4.1-B).
 * UX metadata only — execution and quotes remain enforced in `useSwap` / backend.
 */

import { getTokenBySymbol, isNativeToken, isStaticToken, NATIVE_SYMBOLS } from '@/tokens';

export type RouteSupportStatus = 'supported' | 'likely_supported' | 'limited' | 'unknown';

const ETH_SUPPORTED = new Set(['ETH', 'WETH', 'USDT', 'USDC', 'WBTC']);
const ETH_LIKELY = new Set(['DAI', 'LINK', 'UNI', 'AAVE']);
const ETH_LIMITED = new Set(['PENDLE', 'CRV', 'LDO', 'MKR', 'SKY']);

const BSC_SUPPORTED = new Set(['BNB', 'WBNB', 'USDT', 'USDC', 'BTCB']);
const BSC_LIKELY = new Set(['ETH', 'CAKE', 'LINK']);

const ROUTE_WRAP_TOOLTIP =
  'Route support means Swaperex may be able to quote this token through its commission wrapper.';

const STATUS_RANK: Record<RouteSupportStatus, number> = {
  supported: 0,
  likely_supported: 1,
  limited: 2,
  unknown: 3,
};

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
    if (ETH_SUPPORTED.has(sym)) return 'supported';
    if (ETH_LIKELY.has(sym)) return 'likely_supported';
    if (ETH_LIMITED.has(sym)) return 'limited';
    return 'unknown';
  }

  if (chainId === 56) {
    if (BSC_SUPPORTED.has(sym)) return 'supported';
    if (BSC_LIKELY.has(sym)) return 'likely_supported';
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
      return 'Common Swaperex wrapper route.';
    case 'likely_supported':
      return 'Usually available through wrapper routing, but quote still depends on liquidity.';
    case 'limited':
      return 'May not quote through Swaperex commission routing.';
    default:
      return 'Route support unknown. Quote may fail.';
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
