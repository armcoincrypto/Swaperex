import { describe, it, expect } from 'vitest';
import {
  QUOTE_PREVIEW_REUSE_MAX_AGE_MS,
  getQuoteRoutePathFingerprint,
  isReusableFreshQuote,
  type PreviewReuseQuote,
} from '../reusableFreshQuote';

const WALLET = '0xabc0000000000000000000000000000000000001';
const FINGERPRINT = '1::0.5::1::WETH|ethereum|native:1::USDC|ethereum|0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48::best';

function baseQuote(overrides: Partial<PreviewReuseQuote> = {}): PreviewReuseQuote {
  const now = Date.now();
  return {
    success: true,
    quoteTimestamp: now,
    fromSymbol: 'WETH',
    toSymbol: 'USDC',
    from_asset: 'WETH',
    to_asset: 'USDC',
    from_amount: '1',
    provider: 'uniswap-v3-wrapper-v3',
    routeMode: 'best',
    aggregatedQuote: {
      amountIn: '1',
      amountOut: '1',
      amountOutFormatted: '3000',
      minAmountOut: '1',
      minAmountOutFormatted: '2990',
      provider: 'uniswap-v3-wrapper-v3',
      providerDetails: {
        gas: 380000,
        wrapperV3Path: '0x1234',
      },
      chainId: 1,
      priceImpact: '0',
      amountOutRaw: 1n,
      originalQuote: {
        wrapperPath: '0x1234',
        v3FeeTiers: [500],
      } as never,
    },
    ...overrides,
  };
}

function baseParams(overrides: Partial<Parameters<typeof isReusableFreshQuote>[0]> = {}) {
  const quote = baseQuote();
  const routeFp = getQuoteRoutePathFingerprint(quote);
  return {
    quote,
    status: 'previewing' as const,
    chainId: 1,
    address: WALLET,
    fromSymbol: 'WETH',
    toSymbol: 'USDC',
    fromAmount: '1',
    routeMode: 'best' as const,
    quoteInputFingerprint: FINGERPRINT,
    quoteCapturedInputFingerprint: FINGERPRINT,
    quoteCapturedWallet: WALLET,
    quoteCapturedRouteFingerprint: routeFp,
    quoteCapturedCommissionRequired: true,
    commissionRequired: true,
    now: Date.now(),
    ...overrides,
  };
}

describe('isReusableFreshQuote', () => {
  it('returns reusable for a fresh matching quote', () => {
    const result = isReusableFreshQuote(baseParams());
    expect(result.reusable).toBe(true);
    expect(result.reason).toBe('reusable');
  });

  it('rejects when quote is older than TTL', () => {
    const now = Date.now();
    const result = isReusableFreshQuote(
      baseParams({
        now,
        quote: baseQuote({ quoteTimestamp: now - QUOTE_PREVIEW_REUSE_MAX_AGE_MS - 1 }),
      }),
    );
    expect(result.reusable).toBe(false);
    expect(result.reason).toBe('quote_expired');
  });

  it('allows quote at exactly 30s (confirmSwap boundary)', () => {
    const now = Date.now();
    const result = isReusableFreshQuote(
      baseParams({
        now,
        quote: baseQuote({ quoteTimestamp: now - QUOTE_PREVIEW_REUSE_MAX_AGE_MS }),
      }),
    );
    expect(result.reusable).toBe(true);
  });

  it('rejects amount mismatch', () => {
    const result = isReusableFreshQuote(baseParams({ fromAmount: '2' }));
    expect(result.reusable).toBe(false);
    expect(result.reason).toBe('amount_mismatch');
  });

  it('rejects token mismatch', () => {
    const result = isReusableFreshQuote(baseParams({ toSymbol: 'DAI' }));
    expect(result.reusable).toBe(false);
    expect(result.reason).toBe('to_token_mismatch');
  });

  it('rejects wallet mismatch', () => {
    const result = isReusableFreshQuote(
      baseParams({ address: '0xdead000000000000000000000000000000000001' }),
    );
    expect(result.reusable).toBe(false);
    expect(result.reason).toBe('wallet_mismatch');
  });

  it('rejects while quote fetch in progress', () => {
    const result = isReusableFreshQuote(baseParams({ status: 'fetching_quote' }));
    expect(result.reusable).toBe(false);
    expect(result.reason).toBe('quote_fetch_in_progress');
  });

  it('rejects when input fingerprint changed', () => {
    const result = isReusableFreshQuote(
      baseParams({ quoteInputFingerprint: 'changed-fingerprint' }),
    );
    expect(result.reusable).toBe(false);
    expect(result.reason).toBe('input_fingerprint_mismatch');
  });

  it('rejects when commission mode changed', () => {
    const result = isReusableFreshQuote(baseParams({ commissionRequired: false }));
    expect(result.reusable).toBe(false);
    expect(result.reason).toBe('commission_mode_mismatch');
  });
});

describe('getQuoteRoutePathFingerprint', () => {
  it('includes V3 path and fee tiers', () => {
    const fp = getQuoteRoutePathFingerprint(baseQuote());
    expect(fp).toContain('0x1234');
    expect(fp).toContain('500');
  });
});
