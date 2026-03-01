import { describe, it, expect } from 'vitest';
import { filterTokens, sortTokens, computeTrendingScores } from '../filterSort';
import { DEFAULT_FILTERS } from '../types';
import type { ScreenerToken, ScreenerFilters } from '../types';

function makeToken(overrides: Partial<ScreenerToken> = {}): ScreenerToken {
  return {
    id: 'ethereum',
    symbol: 'ETH',
    name: 'Ethereum',
    currentPrice: 1900,
    priceChange24h: 2.5,
    volume24h: 10_000_000,
    marketCap: 200_000_000_000,
    chainId: 1,
    ...overrides,
  };
}

describe('filterTokens', () => {
  const tokens: ScreenerToken[] = [
    makeToken({ id: 'ethereum', symbol: 'ETH', name: 'Ethereum', currentPrice: 1900, volume24h: 10_000_000, priceChange24h: 2.5 }),
    makeToken({ id: 'tether', symbol: 'USDT', name: 'Tether USD', currentPrice: 1.0, volume24h: 50_000_000, priceChange24h: -0.01 }),
    makeToken({ id: 'weth', symbol: 'WETH', name: 'Wrapped Ether', currentPrice: 1899, volume24h: 5_000_000, priceChange24h: 2.4 }),
    makeToken({ id: 'pepe', symbol: 'PEPE', name: 'Pepe', currentPrice: 0.00001, volume24h: 500_000, priceChange24h: -30, riskLevel: 'risk' }),
    makeToken({ id: 'uniswap', symbol: 'UNI', name: 'Uniswap', currentPrice: 8.5, volume24h: 2_000_000, priceChange24h: 5, contractAddress: '0x1f9840a85d5af5bf1d1762f925bdaddc4201f984' }),
  ];

  it('returns all tokens with default filters', () => {
    const result = filterTokens(tokens, DEFAULT_FILTERS);
    expect(result).toHaveLength(5);
  });

  it('filters by search (symbol)', () => {
    const result = filterTokens(tokens, { ...DEFAULT_FILTERS, search: 'eth' });
    expect(result.map(t => t.symbol)).toContain('ETH');
    expect(result.map(t => t.symbol)).toContain('WETH');
    // USDT matches too because "Tether" name contains "eth" — that's correct behavior
    expect(result.map(t => t.symbol)).not.toContain('PEPE');
  });

  it('filters by search (name)', () => {
    const result = filterTokens(tokens, { ...DEFAULT_FILTERS, search: 'uniswap' });
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe('UNI');
  });

  it('filters by search (contract address)', () => {
    const result = filterTokens(tokens, { ...DEFAULT_FILTERS, search: '0x1f9840a' });
    expect(result).toHaveLength(1);
    expect(result[0].symbol).toBe('UNI');
  });

  it('filters by minimum volume', () => {
    const result = filterTokens(tokens, { ...DEFAULT_FILTERS, minVolume: 5_000_000 });
    expect(result.map(t => t.symbol)).toEqual(expect.arrayContaining(['ETH', 'USDT', 'WETH']));
    expect(result.map(t => t.symbol)).not.toContain('PEPE');
    expect(result.map(t => t.symbol)).not.toContain('UNI');
  });

  it('filters by 24h change range', () => {
    const result = filterTokens(tokens, { ...DEFAULT_FILTERS, changeMin: 0, changeMax: 10 });
    // Only ETH(2.5), WETH(2.4), UNI(5) have change >= 0 and <= 10
    expect(result.map(t => t.symbol)).toEqual(expect.arrayContaining(['ETH', 'WETH', 'UNI']));
    expect(result.map(t => t.symbol)).not.toContain('PEPE'); // -30
    expect(result.map(t => t.symbol)).not.toContain('USDT'); // -0.01
  });

  it('filters by price range', () => {
    const result = filterTokens(tokens, { ...DEFAULT_FILTERS, priceMin: 1, priceMax: 100 });
    expect(result.map(t => t.symbol)).toEqual(expect.arrayContaining(['USDT', 'UNI']));
    expect(result.map(t => t.symbol)).not.toContain('ETH');   // too high
    expect(result.map(t => t.symbol)).not.toContain('PEPE');  // too low
  });

  it('hides stablecoins', () => {
    const result = filterTokens(tokens, { ...DEFAULT_FILTERS, hideStablecoins: true });
    expect(result.map(t => t.symbol)).not.toContain('USDT');
    expect(result).toHaveLength(4);
  });

  it('hides wrapped tokens', () => {
    const result = filterTokens(tokens, { ...DEFAULT_FILTERS, hideWrapped: true });
    expect(result.map(t => t.symbol)).not.toContain('WETH');
    expect(result).toHaveLength(4);
  });

  it('filters for safe-only (excludes risk)', () => {
    const result = filterTokens(tokens, { ...DEFAULT_FILTERS, onlySafe: true });
    expect(result.map(t => t.symbol)).not.toContain('PEPE');
    expect(result).toHaveLength(4);
  });

  it('combines multiple filters', () => {
    const filters: ScreenerFilters = {
      ...DEFAULT_FILTERS,
      hideStablecoins: true,
      hideWrapped: true,
      minVolume: 1_000_000,
    };
    const result = filterTokens(tokens, filters);
    // ETH(10M, not stable, not wrapped), UNI(2M, not stable, not wrapped)
    expect(result.map(t => t.symbol)).toEqual(expect.arrayContaining(['ETH', 'UNI']));
    expect(result).toHaveLength(2);
  });
});

describe('sortTokens', () => {
  const tokens: ScreenerToken[] = [
    makeToken({ id: 'a', symbol: 'A', volume24h: 100, priceChange24h: 5, marketCap: 300, currentPrice: 10, trendingScore: 80 }),
    makeToken({ id: 'b', symbol: 'B', volume24h: 300, priceChange24h: -2, marketCap: 100, currentPrice: 30, trendingScore: 50 }),
    makeToken({ id: 'c', symbol: 'C', volume24h: 200, priceChange24h: 10, marketCap: 200, currentPrice: 20, trendingScore: 90 }),
  ];

  it('sorts by volume descending', () => {
    const result = sortTokens(tokens, 'volume24h', 'desc');
    expect(result.map(t => t.symbol)).toEqual(['B', 'C', 'A']);
  });

  it('sorts by volume ascending', () => {
    const result = sortTokens(tokens, 'volume24h', 'asc');
    expect(result.map(t => t.symbol)).toEqual(['A', 'C', 'B']);
  });

  it('sorts by price change descending', () => {
    const result = sortTokens(tokens, 'priceChange24h', 'desc');
    expect(result.map(t => t.symbol)).toEqual(['C', 'A', 'B']);
  });

  it('sorts by market cap descending', () => {
    const result = sortTokens(tokens, 'marketCap', 'desc');
    expect(result.map(t => t.symbol)).toEqual(['A', 'C', 'B']);
  });

  it('sorts by trending score descending', () => {
    const result = sortTokens(tokens, 'trendingScore', 'desc');
    expect(result.map(t => t.symbol)).toEqual(['C', 'A', 'B']);
  });

  it('sorts by price ascending', () => {
    const result = sortTokens(tokens, 'currentPrice', 'asc');
    expect(result.map(t => t.symbol)).toEqual(['A', 'C', 'B']);
  });
});

describe('computeTrendingScores', () => {
  it('returns empty for empty input', () => {
    expect(computeTrendingScores([])).toEqual([]);
  });

  it('assigns scores between 0-100', () => {
    const tokens = [
      makeToken({ id: 'a', volume24h: 100, priceChange24h: 1, marketCap: 100 }),
      makeToken({ id: 'b', volume24h: 200, priceChange24h: 10, marketCap: 200 }),
      makeToken({ id: 'c', volume24h: 300, priceChange24h: -5, marketCap: 300 }),
    ];
    const result = computeTrendingScores(tokens);
    for (const t of result) {
      expect(t.trendingScore).toBeGreaterThanOrEqual(0);
      expect(t.trendingScore).toBeLessThanOrEqual(100);
    }
  });

  it('highest volume + momentum token gets highest score', () => {
    const tokens = [
      makeToken({ id: 'low', volume24h: 100, priceChange24h: 1, marketCap: 100 }),
      makeToken({ id: 'high', volume24h: 10_000_000, priceChange24h: 50, marketCap: 1_000_000_000 }),
    ];
    const result = computeTrendingScores(tokens);
    const high = result.find(t => t.id === 'high')!;
    const low = result.find(t => t.id === 'low')!;
    expect(high.trendingScore!).toBeGreaterThan(low.trendingScore!);
  });

  it('single token gets score of 100', () => {
    const tokens = [makeToken({ id: 'only' })];
    const result = computeTrendingScores(tokens);
    expect(result[0].trendingScore).toBe(100);
  });
});
