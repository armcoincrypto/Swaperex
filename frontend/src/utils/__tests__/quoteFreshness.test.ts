import { describe, expect, it } from 'vitest';
import {
  QUOTE_FRESHNESS_TTL_MS,
  isExecutableQuoteExpired,
} from '@/utils/quoteFreshness';

describe('executable quote freshness', () => {
  it('allows a quote immediately before the boundary', () => {
    const now = 100_000;
    expect(
      isExecutableQuoteExpired(now - QUOTE_FRESHNESS_TTL_MS + 1, now),
    ).toBe(false);
  });

  it('blocks a quote at and after the boundary', () => {
    const now = 100_000;
    expect(isExecutableQuoteExpired(now - QUOTE_FRESHNESS_TTL_MS, now)).toBe(true);
    expect(isExecutableQuoteExpired(now - QUOTE_FRESHNESS_TTL_MS - 1, now)).toBe(true);
  });

  it('returns a new validity result for a refreshed timestamp', () => {
    const now = 100_000;
    const expiredTimestamp = now - QUOTE_FRESHNESS_TTL_MS;
    const refreshedTimestamp = now;
    expect(isExecutableQuoteExpired(expiredTimestamp, now)).toBe(true);
    expect(isExecutableQuoteExpired(refreshedTimestamp, now)).toBe(false);
  });
});
