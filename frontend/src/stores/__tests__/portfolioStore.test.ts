import { describe, it, expect, beforeEach } from 'vitest';
import {
  usePortfolioStore,
  flattenPortfolioTokens,
  sortTokens,
  filterTokensBySearch,
  filterSmallBalances,
  getChainTotals,
  isSnapshotValid,
  formatUsdPrivate,
  getPortfolioChainLabel,
} from '../portfolioStore';
import type { Portfolio, TokenBalance } from '@/services/portfolioTypes';

// ── Test Fixtures ──────────────────────────────────────────────────

function makeToken(overrides: Partial<TokenBalance> = {}): TokenBalance {
  return {
    symbol: 'ETH',
    name: 'Ethereum',
    address: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
    decimals: 18,
    balance: '5000000000000000000',
    balanceFormatted: '5.0',
    usdValue: '15000.00',
    usdPrice: '3000.00',
    isNative: true,
    chain: 'ethereum',
    ...overrides,
  };
}

function makePortfolio(chains: Partial<Portfolio['chains']> = {}): Portfolio {
  return {
    address: '0x1234',
    addressType: 'evm',
    chains: {
      ethereum: {
        chain: 'ethereum',
        chainId: 1,
        nativeBalance: makeToken(),
        tokenBalances: [
          makeToken({ symbol: 'USDT', name: 'Tether', address: '0xdac17', isNative: false, balanceFormatted: '100.0', usdValue: '100.00', usdPrice: '1.00' }),
        ],
        totalUsdValue: '15100.00',
        lastUpdated: Date.now(),
      },
      bsc: {
        chain: 'bsc',
        chainId: 56,
        nativeBalance: makeToken({ symbol: 'BNB', name: 'BNB', chain: 'bsc', balanceFormatted: '2.0', usdValue: '600.00', usdPrice: '300.00' }),
        tokenBalances: [],
        totalUsdValue: '600.00',
        lastUpdated: Date.now(),
      },
      polygon: null,
      arbitrum: null,
      solana: null,
      ...chains,
    },
    totalUsdValue: '15700.00',
    lastUpdated: Date.now(),
  };
}

// ── Tests ──────────────────────────────────────────────────────────

describe('portfolioStore helpers', () => {
  describe('flattenPortfolioTokens', () => {
    it('returns empty array for null portfolio', () => {
      expect(flattenPortfolioTokens(null)).toEqual([]);
    });

    it('flattens tokens across chains', () => {
      const tokens = flattenPortfolioTokens(makePortfolio());
      expect(tokens.length).toBe(3); // ETH native + USDT + BNB native
    });

    it('skips null chains', () => {
      const tokens = flattenPortfolioTokens(makePortfolio({ ethereum: null }));
      expect(tokens.length).toBe(1); // Only BNB
    });
  });

  describe('sortTokens', () => {
    const tokens = [
      makeToken({ symbol: 'LINK', usdValue: '50.00', balanceFormatted: '10.0' }),
      makeToken({ symbol: 'ETH', usdValue: '15000.00', balanceFormatted: '5.0' }),
      makeToken({ symbol: 'USDT', usdValue: '100.00', balanceFormatted: '100.0' }),
    ];

    it('sorts by value (USD) descending', () => {
      const sorted = sortTokens(tokens, 'value');
      expect(sorted[0].symbol).toBe('ETH');
      expect(sorted[1].symbol).toBe('USDT');
      expect(sorted[2].symbol).toBe('LINK');
    });

    it('sorts by balance descending', () => {
      const sorted = sortTokens(tokens, 'balance');
      expect(sorted[0].symbol).toBe('USDT'); // 100
      expect(sorted[1].symbol).toBe('LINK'); // 10
      expect(sorted[2].symbol).toBe('ETH'); // 5
    });

    it('sorts alphabetically', () => {
      const sorted = sortTokens(tokens, 'alpha');
      expect(sorted[0].symbol).toBe('ETH');
      expect(sorted[1].symbol).toBe('LINK');
      expect(sorted[2].symbol).toBe('USDT');
    });
  });

  describe('filterTokensBySearch', () => {
    const tokens = [
      makeToken({ symbol: 'ETH', name: 'Ethereum' }),
      makeToken({ symbol: 'USDT', name: 'Tether USD', address: '0xdac17' }),
    ];

    it('returns all when query is empty', () => {
      expect(filterTokensBySearch(tokens, '').length).toBe(2);
    });

    it('filters by symbol', () => {
      expect(filterTokensBySearch(tokens, 'USDT').length).toBe(1);
      expect(filterTokensBySearch(tokens, 'usdt').length).toBe(1); // case insensitive
    });

    it('filters by name', () => {
      expect(filterTokensBySearch(tokens, 'Tether').length).toBe(1);
    });

    it('filters by address', () => {
      expect(filterTokensBySearch(tokens, '0xdac').length).toBe(1);
    });

    it('returns empty for no matches', () => {
      expect(filterTokensBySearch(tokens, 'XYZ').length).toBe(0);
    });
  });

  describe('filterSmallBalances', () => {
    const tokens = [
      makeToken({ symbol: 'ETH', usdValue: '15000.00', isNative: true }),
      makeToken({ symbol: 'DUST', usdValue: '0.50', isNative: false }),
      makeToken({ symbol: 'USDT', usdValue: '2.00', isNative: false }),
    ];

    it('returns all when hide is false', () => {
      expect(filterSmallBalances(tokens, 1, false).length).toBe(3);
    });

    it('hides tokens below threshold', () => {
      const filtered = filterSmallBalances(tokens, 1, true);
      expect(filtered.length).toBe(2); // ETH + USDT (DUST < $1)
    });

    it('always keeps native tokens', () => {
      const tokens2 = [makeToken({ symbol: 'ETH', usdValue: '0.10', isNative: true })];
      expect(filterSmallBalances(tokens2, 1, true).length).toBe(1);
    });
  });

  describe('getChainTotals', () => {
    it('returns empty for null portfolio', () => {
      expect(getChainTotals(null)).toEqual({});
    });

    it('returns per-chain totals', () => {
      const totals = getChainTotals(makePortfolio());
      expect(totals.ethereum.total).toBe(15100);
      expect(totals.ethereum.label).toBe('ETH');
      expect(totals.bsc.total).toBe(600);
      expect(totals.bsc.label).toBe('BSC');
    });

    it('skips null chains', () => {
      const totals = getChainTotals(makePortfolio());
      expect(totals.polygon).toBeUndefined();
    });
  });

  describe('isSnapshotValid', () => {
    it('returns false for 0 timestamp', () => {
      expect(isSnapshotValid(0)).toBe(false);
    });

    it('returns true for recent snapshot', () => {
      expect(isSnapshotValid(Date.now() - 60_000)).toBe(true); // 1 min ago
    });

    it('returns false for expired snapshot (>10 min)', () => {
      expect(isSnapshotValid(Date.now() - 11 * 60_000)).toBe(false);
    });
  });

  describe('formatUsdPrivate', () => {
    it('shows **** in privacy mode', () => {
      expect(formatUsdPrivate(15000, true)).toBe('****');
    });

    it('formats small values', () => {
      expect(formatUsdPrivate(42.5, false)).toBe('$42.50');
    });

    it('formats thousands', () => {
      expect(formatUsdPrivate(15000, false)).toBe('$15.00K');
    });

    it('formats millions', () => {
      expect(formatUsdPrivate(1500000, false)).toBe('$1.50M');
    });

    it('handles NaN', () => {
      expect(formatUsdPrivate('not-a-number', false)).toBe('$0.00');
    });
  });

  describe('getPortfolioChainLabel', () => {
    it('returns ETH for ethereum', () => {
      expect(getPortfolioChainLabel('ethereum')).toBe('ETH');
    });
    it('returns BSC for bsc', () => {
      expect(getPortfolioChainLabel('bsc')).toBe('BSC');
    });
    it('returns Polygon for polygon', () => {
      expect(getPortfolioChainLabel('polygon')).toBe('Polygon');
    });
  });

  // ── Audit edge case tests ──────────────────────────────────────────

  describe('sortTokens edge cases', () => {
    it('sorts tokens with null usdValue (treated as 0)', () => {
      const tokens = [
        makeToken({ symbol: 'UNKNOWN', usdValue: null, balanceFormatted: '99' }),
        makeToken({ symbol: 'ETH', usdValue: '3000.00', balanceFormatted: '1' }),
      ];
      const sorted = sortTokens(tokens, 'value');
      expect(sorted[0].symbol).toBe('ETH'); // has value
      expect(sorted[1].symbol).toBe('UNKNOWN'); // null → 0
    });

    it('sorts by chain groups correctly', () => {
      const tokens = [
        makeToken({ symbol: 'BNB', chain: 'bsc' }),
        makeToken({ symbol: 'ETH', chain: 'ethereum' }),
        makeToken({ symbol: 'MATIC', chain: 'polygon' }),
      ];
      const sorted = sortTokens(tokens, 'chain');
      expect(sorted[0].chain).toBe('bsc');
      expect(sorted[1].chain).toBe('ethereum');
      expect(sorted[2].chain).toBe('polygon');
    });
  });

  describe('filterSmallBalances edge cases', () => {
    it('treats null usdValue as 0 (hides below threshold)', () => {
      const tokens = [
        makeToken({ symbol: 'UNKNOWN', usdValue: null, isNative: false }),
      ];
      const filtered = filterSmallBalances(tokens, 1, true);
      expect(filtered.length).toBe(0);
    });
  });

  describe('getChainTotals edge cases', () => {
    it('treats missing totalUsdValue as 0', () => {
      const portfolio = makePortfolio({
        polygon: {
          chain: 'polygon',
          chainId: 137,
          nativeBalance: makeToken({ symbol: 'MATIC', chain: 'polygon', usdValue: null }),
          tokenBalances: [],
          totalUsdValue: '',
          lastUpdated: Date.now(),
        },
      });
      const totals = getChainTotals(portfolio);
      expect(totals.polygon.total).toBe(0);
    });
  });

  describe('hydrateFromSnapshot (store action)', () => {
    beforeEach(() => {
      // Reset store between tests
      usePortfolioStore.setState({
        portfolio: null,
        snapshot: null,
        snapshotAt: 0,
        loading: false,
        errors: {},
        updatedAt: 0,
        searchQuery: '',
      });
    });

    it('hydrates from valid snapshot without re-stamping', () => {
      const snap = makePortfolio();
      const originalAt = Date.now() - 5 * 60_000; // 5 min ago (valid)
      usePortfolioStore.setState({
        snapshot: snap,
        snapshotAt: originalAt,
        portfolio: null,
      });

      const result = usePortfolioStore.getState().hydrateFromSnapshot();
      expect(result).toBe(true);

      const state = usePortfolioStore.getState();
      expect(state.portfolio).toBe(snap);
      // snapshotAt should NOT be re-stamped
      expect(state.snapshotAt).toBe(originalAt);
      // updatedAt should match original snapshotAt
      expect(state.updatedAt).toBe(originalAt);
    });

    it('returns false if no snapshot', () => {
      const result = usePortfolioStore.getState().hydrateFromSnapshot();
      expect(result).toBe(false);
    });

    it('returns false if snapshot expired', () => {
      usePortfolioStore.setState({
        snapshot: makePortfolio(),
        snapshotAt: Date.now() - 15 * 60_000, // 15 min ago (expired)
        portfolio: null,
      });

      const result = usePortfolioStore.getState().hydrateFromSnapshot();
      expect(result).toBe(false);
      expect(usePortfolioStore.getState().portfolio).toBeNull();
    });

    it('returns false if portfolio already exists', () => {
      const existing = makePortfolio();
      usePortfolioStore.setState({
        portfolio: existing,
        snapshot: makePortfolio(),
        snapshotAt: Date.now() - 60_000,
      });

      const result = usePortfolioStore.getState().hydrateFromSnapshot();
      expect(result).toBe(false);
      // Should keep existing portfolio unchanged
      expect(usePortfolioStore.getState().portfolio).toBe(existing);
    });
  });

  describe('formatUsdPrivate edge cases', () => {
    it('handles zero value', () => {
      expect(formatUsdPrivate(0, false)).toBe('$0.00');
    });

    it('handles string zero', () => {
      expect(formatUsdPrivate('0', false)).toBe('$0.00');
    });

    it('handles empty string', () => {
      expect(formatUsdPrivate('', false)).toBe('$0.00');
    });
  });
});
