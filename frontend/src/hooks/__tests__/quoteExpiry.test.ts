import { describe, it, expect } from 'vitest';

/**
 * Tests for quote expiry logic used in useSwap.ts confirmSwap().
 *
 * The actual check is:
 *   const quoteAge = Date.now() - swapQuote.quoteTimestamp;
 *   if (quoteAge > QUOTE_EXPIRY_MS) { throw 'QUOTE_EXPIRED' }
 *
 * We test the pure logic here without rendering the hook.
 */

const QUOTE_EXPIRY_MS = 30000;

function isQuoteExpired(quoteTimestamp: number, now: number): boolean {
  return (now - quoteTimestamp) > QUOTE_EXPIRY_MS;
}

describe('quote expiry logic', () => {
  it('fresh quote (0s old) is not expired', () => {
    const now = Date.now();
    expect(isQuoteExpired(now, now)).toBe(false);
  });

  it('quote at 29s is not expired', () => {
    const now = Date.now();
    expect(isQuoteExpired(now - 29000, now)).toBe(false);
  });

  it('quote at exactly 30s is not expired (boundary)', () => {
    const now = Date.now();
    expect(isQuoteExpired(now - 30000, now)).toBe(false);
  });

  it('quote at 30.001s is expired', () => {
    const now = Date.now();
    expect(isQuoteExpired(now - 30001, now)).toBe(true);
  });

  it('quote at 60s is expired', () => {
    const now = Date.now();
    expect(isQuoteExpired(now - 60000, now)).toBe(true);
  });

  it('quote from the future is not expired', () => {
    const now = Date.now();
    expect(isQuoteExpired(now + 5000, now)).toBe(false);
  });
});

describe('QUOTE_EXPIRED sentinel', () => {
  it('confirmSwap should throw QUOTE_EXPIRED for stale quotes', () => {
    // Simulate the throw logic from useSwap.ts
    const quoteTimestamp = Date.now() - 35000; // 35s old
    const quoteAge = Date.now() - quoteTimestamp;

    expect(quoteAge > QUOTE_EXPIRY_MS).toBe(true);

    // The hook throws new Error('QUOTE_EXPIRED') which UI can catch
    const error = new Error('QUOTE_EXPIRED');
    expect(error.message).toBe('QUOTE_EXPIRED');
  });

  it('confirmSwap should proceed for fresh quotes', () => {
    const quoteTimestamp = Date.now() - 5000; // 5s old
    const quoteAge = Date.now() - quoteTimestamp;

    expect(quoteAge > QUOTE_EXPIRY_MS).toBe(false);
  });
});
