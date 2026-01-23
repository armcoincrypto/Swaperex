/**
 * Stablecoin Detection Utilities
 *
 * Shared logic for identifying stablecoins and detecting unreliable prices.
 * Used by WalletScan and TokenDisplay components.
 */

// Known stablecoin symbols
const KNOWN_STABLES = new Set([
  'USDT', 'USDC', 'DAI', 'FDUSD', 'TUSD', 'USDP', 'USDD', 'USDE',
  'FRAX', 'LUSD', 'BUSD', 'GUSD', 'USDJ', 'UST', 'CUSD', 'SUSD', 'XUSD'
]);

/**
 * Check if a token is a stablecoin based on symbol or name
 */
export function isStablecoin(symbol?: string, name?: string): boolean {
  const s = (symbol || '').toUpperCase();
  const n = (name || '').toUpperCase();

  // Check known stablecoin symbols
  if (KNOWN_STABLES.has(s)) return true;

  // Check if symbol contains USD (but exclude DUSK which is not a stablecoin)
  if (s.includes('USD') && !s.includes('DUSK')) return true;

  // Check name patterns
  if (n.includes('USD') || n.includes('DOLLAR') || n.includes('STABLECOIN')) return true;

  return false;
}

/**
 * Check if a stablecoin's price is unreliable (outside 0.90-1.10 range)
 *
 * Only returns true for stablecoins with prices outside the expected range.
 * Non-stablecoins always return false.
 */
export function isStablecoinPriceUnreliable(
  priceUsd: number | null | undefined,
  symbol?: string,
  name?: string
): boolean {
  if (!isStablecoin(symbol, name)) return false;
  if (priceUsd === null || priceUsd === undefined || priceUsd === 0) return false;
  // Stablecoin should be within 10% of $1.00
  return priceUsd < 0.90 || priceUsd > 1.10;
}
