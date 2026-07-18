/**
 * Canonical commission route coverage (display + soft precheck + execution policy).
 *
 * Regenerated from 2026-07-18 route-truth audits.
 * Under `VITE_COMMISSION_REQUIRED=true`, `utils/commissionRoutePolicy.ts` fail-closes
 * quote, approval, and transaction construction against this catalog.
 */

export const COMMISSION_COVERAGE_AUDIT_AT = '2026-07-18T14:00:00.000Z';

/** Directional pairs that currently have proven commission-wrapper quote truth. */
export const COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS = new Set<string>([
  // Ethereum native legs (Uniswap wrapper V2)
  '1|ETH|USDC',
  '1|USDC|ETH',
  '1|ETH|USDT',
  '1|USDT|ETH',
  '1|ETH|WBTC',
  '1|WBTC|ETH',

  // Ethereum WETH majors (Uniswap wrapper V3 direct paths)
  '1|WETH|USDC',
  '1|USDC|WETH',
  '1|WETH|USDT',
  '1|USDT|WETH',
  '1|WETH|DAI',
  '1|DAI|WETH',
  '1|WETH|WBTC',
  '1|WBTC|WETH',
  '1|WETH|LINK',
  '1|LINK|WETH',
  '1|WETH|UNI',
  '1|UNI|WETH',
  '1|WETH|AAVE',
  '1|AAVE|WETH',
  '1|WETH|LDO',
  '1|LDO|WETH',
  '1|WETH|CRV',
  '1|CRV|WETH',
  '1|WETH|COMP',
  '1|COMP|WETH',
  '1|WETH|ENS',
  '1|ENS|WETH',
  '1|WETH|ONDO',
  '1|ONDO|WETH',
  '1|WETH|ENA',
  '1|ENA|WETH',
  '1|WETH|MANA',
  '1|MANA|WETH',

  // BNB Chain native legs (Pancake wrapper V2)
  '56|BNB|USDT',
  '56|USDT|BNB',
  '56|BNB|USDC',
  '56|USDC|BNB',
  '56|BNB|BTCB',
  '56|BTCB|BNB',
  '56|BNB|CAKE',
  '56|CAKE|BNB',
  '56|BNB|ETH',
  '56|ETH|BNB',

  // BNB Chain ERC-20 major that does not require WBNB as an ERC-20 execution leg
  '56|CAKE|USDT',
  '56|USDT|CAKE',
]);

/**
 * Pairs blocked by product policy or proven unsafe for commission promotion.
 * WBNB-labeled routes are blocked because Pancake V2 rejects WBNB in the
 * ERC-20 execution entrypoint; users must use native BNB legs instead.
 */
export const COMMISSION_AUDIT_BLOCKED_PAIR_KEYS = new Set<string>([
  '1|WETH|PEPE',
  '1|PEPE|WETH',
  '1|ETH|PEPE',
  '1|PEPE|ETH',
  '56|WBNB|USDT',
  '56|USDT|WBNB',
  '56|WBNB|USDC',
  '56|USDC|WBNB',
  '56|WBNB|BTCB',
  '56|BTCB|WBNB',
  '56|WBNB|CAKE',
  '56|CAKE|WBNB',
  '56|WBNB|ETH',
  '56|ETH|WBNB',
  '56|WBNB|FDUSD',
  '56|FDUSD|WBNB',
  '56|BNB|FDUSD',
  '56|FDUSD|BNB',
]);

export function commissionPairKey(chainId: number, fromSymbol: string, toSymbol: string): string {
  return `${chainId}|${fromSymbol.trim().toUpperCase()}|${toSymbol.trim().toUpperCase()}`;
}

export function isCommissionPairAuditSupported(
  chainId: number,
  fromSymbol: string,
  toSymbol: string,
): boolean {
  return COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS.has(commissionPairKey(chainId, fromSymbol, toSymbol));
}

export function isCommissionPairAuditBlocked(
  chainId: number,
  fromSymbol: string,
  toSymbol: string,
): boolean {
  return COMMISSION_AUDIT_BLOCKED_PAIR_KEYS.has(commissionPairKey(chainId, fromSymbol, toSymbol));
}
