import { describe, it, expect, beforeEach } from 'vitest';
import { useWatchlistStore } from '@/stores/watchlistStore';

describe('watchlist integration', () => {
  beforeEach(() => {
    // Reset store between tests
    useWatchlistStore.getState().clear();
  });

  it('adds a token to watchlist', () => {
    const result = useWatchlistStore.getState().addToken({
      chainId: 1,
      address: '0xabc',
      symbol: 'TEST',
    });
    expect(result).toBe(true);
    expect(useWatchlistStore.getState().tokens).toHaveLength(1);
  });

  it('removes a token from watchlist', () => {
    useWatchlistStore.getState().addToken({
      chainId: 1,
      address: '0xabc',
      symbol: 'TEST',
    });
    useWatchlistStore.getState().removeToken(1, '0xabc');
    expect(useWatchlistStore.getState().tokens).toHaveLength(0);
  });

  it('checks if token is in watchlist', () => {
    useWatchlistStore.getState().addToken({
      chainId: 1,
      address: '0xabc',
      symbol: 'TEST',
    });
    expect(useWatchlistStore.getState().hasToken(1, '0xabc')).toBe(true);
    expect(useWatchlistStore.getState().hasToken(1, '0xdef')).toBe(false);
    expect(useWatchlistStore.getState().hasToken(56, '0xabc')).toBe(false);
  });

  it('enforces max 20 tokens', () => {
    for (let i = 0; i < 20; i++) {
      const result = useWatchlistStore.getState().addToken({
        chainId: 1,
        address: `0x${i.toString(16).padStart(40, '0')}`,
        symbol: `T${i}`,
      });
      expect(result).toBe(true);
    }

    // 21st should fail
    const result = useWatchlistStore.getState().addToken({
      chainId: 1,
      address: '0xoverflow',
      symbol: 'OVER',
    });
    expect(result).toBe(false);
    expect(useWatchlistStore.getState().tokens).toHaveLength(20);
  });

  it('prevents duplicate entries', () => {
    useWatchlistStore.getState().addToken({
      chainId: 1,
      address: '0xabc',
      symbol: 'TEST',
    });
    const result = useWatchlistStore.getState().addToken({
      chainId: 1,
      address: '0xabc',
      symbol: 'TEST',
    });
    expect(result).toBe(false);
    expect(useWatchlistStore.getState().tokens).toHaveLength(1);
  });

  it('normalizes address to lowercase', () => {
    useWatchlistStore.getState().addToken({
      chainId: 1,
      address: '0xABCDEF',
      symbol: 'TEST',
    });
    expect(useWatchlistStore.getState().hasToken(1, '0xabcdef')).toBe(true);
    expect(useWatchlistStore.getState().hasToken(1, '0xABCDEF')).toBe(true);
  });

  it('clears all tokens', () => {
    useWatchlistStore.getState().addToken({ chainId: 1, address: '0xa', symbol: 'A' });
    useWatchlistStore.getState().addToken({ chainId: 1, address: '0xb', symbol: 'B' });
    useWatchlistStore.getState().clear();
    expect(useWatchlistStore.getState().tokens).toHaveLength(0);
  });
});
