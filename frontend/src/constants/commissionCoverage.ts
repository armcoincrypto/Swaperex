/**
 * P3.1 — Commission pair audit snapshot (display-only).
 * Regenerate: `node scripts/audit/audit-commission-pairs.mjs` from repo root.
 * Source: reports/commission-pair-audit-YYYYMMDD.json
 */

export const COMMISSION_COVERAGE_AUDIT_AT = '2026-07-07T09:35:20.471Z';

/** Pairs that returned a live wrapper quote in the audit (directional). */
export const COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS = new Set<string>([
  '1|WETH|USDC',
  '1|USDC|WETH',
  '1|WETH|USDT',
  '1|USDT|WETH',
  '1|WETH|DAI',
  '1|DAI|WETH',
  '1|ETH|USDC',
  '1|USDC|ETH',
  '1|ETH|USDT',
  '1|USDT|ETH',
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
  '1|WETH|SNX',
  '1|SNX|WETH',
  '1|WETH|PENDLE',
  '1|PENDLE|WETH',
  '56|BNB|USDT',
  '56|USDT|BNB',
  '56|BNB|USDC',
  '56|USDC|BNB',
  '56|WBNB|USDT',
  '56|USDT|WBNB',
  '56|WBNB|BTCB',
  '56|BTCB|WBNB',
  '56|CAKE|USDT',
  '56|USDT|CAKE',
  '56|WBNB|CAKE',
  '56|CAKE|WBNB',
  '56|WBNB|USDC',
  '56|USDC|WBNB',
  '56|WBNB|ETH',
  '56|ETH|WBNB',
  '56|WBNB|FDUSD',
  '56|FDUSD|WBNB',
]);

/** Pairs blocked by product policy or failed audit — never promote (directional). */
export const COMMISSION_AUDIT_BLOCKED_PAIR_KEYS = new Set<string>([
  '1|WETH|PEPE',
  '1|PEPE|WETH',
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
