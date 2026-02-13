/**
 * Screener Filtering & Sorting Logic
 *
 * Pure functions — no side effects, easily testable.
 */

import type { ScreenerToken, ScreenerFilters, SortField, SortDir } from './types';
import { STABLECOIN_SYMBOLS, WRAPPED_SYMBOLS } from './types';

/**
 * Apply all active filters to a token list
 */
export function filterTokens(
  tokens: ScreenerToken[],
  filters: ScreenerFilters,
): ScreenerToken[] {
  return tokens.filter((t) => {
    // Text search (symbol, name, contract)
    if (filters.search) {
      const q = filters.search.toLowerCase();
      const matchSymbol = t.symbol.toLowerCase().includes(q);
      const matchName = t.name.toLowerCase().includes(q);
      const matchAddress = t.contractAddress?.toLowerCase().includes(q);
      if (!matchSymbol && !matchName && !matchAddress) return false;
    }

    // Volume threshold
    if (filters.minVolume > 0 && t.volume24h < filters.minVolume) return false;

    // 24h change range
    if (t.priceChange24h < filters.changeMin) return false;
    if (t.priceChange24h > filters.changeMax) return false;

    // Price range
    if (filters.priceMin > 0 && t.currentPrice < filters.priceMin) return false;
    if (filters.priceMax > 0 && t.currentPrice > filters.priceMax) return false;

    // Hide stablecoins
    if (filters.hideStablecoins && STABLECOIN_SYMBOLS.has(t.symbol)) return false;

    // Hide wrapped/native
    if (filters.hideWrapped && WRAPPED_SYMBOLS.has(t.symbol)) return false;

    // Safety filter
    if (filters.onlySafe && t.riskLevel === 'risk') return false;

    return true;
  });
}

/**
 * Sort tokens by a field
 */
export function sortTokens(
  tokens: ScreenerToken[],
  field: SortField,
  dir: SortDir,
): ScreenerToken[] {
  return [...tokens].sort((a, b) => {
    const aVal = getFieldValue(a, field);
    const bVal = getFieldValue(b, field);
    return dir === 'desc' ? bVal - aVal : aVal - bVal;
  });
}

function getFieldValue(token: ScreenerToken, field: SortField): number {
  switch (field) {
    case 'volume24h': return token.volume24h;
    case 'priceChange24h': return token.priceChange24h;
    case 'marketCap': return token.marketCap;
    case 'currentPrice': return token.currentPrice;
    case 'trendingScore': return token.trendingScore ?? 0;
  }
}

/**
 * Compute trending score for each token.
 *
 * Score = weighted sum of normalised ranks:
 *   volume rank (40%) + |24h change| rank (35%) + marketCap rank (25%)
 *
 * Higher = more "trending". Range 0-100.
 */
export function computeTrendingScores(tokens: ScreenerToken[]): ScreenerToken[] {
  if (tokens.length === 0) return tokens;
  const n = tokens.length;

  // Build rank arrays (index = rank position)
  const byVolume = [...tokens].sort((a, b) => b.volume24h - a.volume24h);
  const byMomentum = [...tokens].sort(
    (a, b) => Math.abs(b.priceChange24h) - Math.abs(a.priceChange24h),
  );
  const byMcap = [...tokens].sort((a, b) => b.marketCap - a.marketCap);

  const volumeRank = new Map<string, number>();
  const momentumRank = new Map<string, number>();
  const mcapRank = new Map<string, number>();

  byVolume.forEach((t, i) => volumeRank.set(t.id, i));
  byMomentum.forEach((t, i) => momentumRank.set(t.id, i));
  byMcap.forEach((t, i) => mcapRank.set(t.id, i));

  return tokens.map((t) => {
    const vr = 1 - (volumeRank.get(t.id) ?? n) / n;
    const mr = 1 - (momentumRank.get(t.id) ?? n) / n;
    const cr = 1 - (mcapRank.get(t.id) ?? n) / n;
    const score = Math.round((vr * 40 + mr * 35 + cr * 25));
    return { ...t, trendingScore: score };
  });
}
