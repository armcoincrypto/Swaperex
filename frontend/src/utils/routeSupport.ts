/**
 * Commission-wrapper route support hints for the token picker (P4.1-B).
 * UX metadata only — execution and quotes remain enforced in `useSwap` / backend.
 * P4.2: confirm tier assumptions against admin Failures (`wrapperQuoteDiagnostic`) and live wrapper quotes;
 * do not promote symbols to stronger tiers without evidence.
 */

import { getTokenBySymbol, isNativeToken, isStaticToken, NATIVE_SYMBOLS } from '@/tokens';

export type RouteSupportStatus = 'supported' | 'likely_supported' | 'limited' | 'unknown';

const ETH_SUPPORTED = new Set(['ETH', 'WETH', 'USDT', 'USDC', 'WBTC']);
const ETH_LIKELY = new Set(['DAI', 'LINK', 'UNI', 'AAVE', 'LDO', 'CRV', 'SNX', 'PENDLE']);
const ETH_LIMITED = new Set([
  'PEPE',
  'SHIB',
  'ARB',
  'OP',
  'ENA',
  'ONDO',
  'FET',
  'GRT',
  'SUSHI',
  'COMP',
  'MANA',
  'SAND',
  'APE',
]);

const BSC_SUPPORTED = new Set(['BNB', 'WBNB', 'USDT', 'USDC', 'FDUSD', 'BTCB']);
const BSC_LIKELY = new Set(['ETH', 'CAKE', 'LINK', 'XRP', 'DOGE']);
const BSC_LIMITED = new Set(['ADA', 'DOT', 'LTC', 'TRX', 'PEPE', 'FLOKI', 'TWT', 'XVS']);

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
      return 'Common wrapper route.';
    case 'likely_supported':
      return 'Usually available; quote depends on liquidity.';
    case 'limited':
      return 'May not quote through Swaperex commission routing.';
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
