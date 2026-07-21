import { describe, expect, it } from 'vitest';
import { buildQuoteEconomics, type QuoteEconomicsInput } from '@/utils/quoteEconomics';
import { classifyQuoteQuality } from '@/utils/quoteQuality';
import { selectBestCertifiedQuote } from '@/utils/selectBestCertifiedQuote';

const base: QuoteEconomicsInput = {
  chainId: 1,
  routeFingerprint: 'b-route',
  tokenIn: { symbol: 'WETH', address: '0x1', decimals: 18, isNative: false },
  tokenOut: { symbol: 'USDC', address: '0x2', decimals: 6, isNative: false },
  amountIn: 1n,
  grossAmountOut: 1_000_000n,
  commissionBps: 20,
  commissionAmount: 2_000n,
  netAmountOut: 998_000n,
  estimatedGasUnits: 200_000n,
  priceImpactBps: 20,
  slippageBps: 50,
  hopCount: 1,
  routeType: 'wrapper',
  wrapperAddress: '0x3',
  certified: true,
  directRouter: false,
  quotedAt: 1_000,
  expiresAt: 60_000,
};

function quote(overrides: Partial<QuoteEconomicsInput> = {}) {
  return buildQuoteEconomics({ ...base, ...overrides }, (q) =>
    classifyQuoteQuality(q, 2_000),
  );
}

describe('selectBestCertifiedQuote', () => {
  it('uses effective USD value when gas reverses the gross-output winner', () => {
    const highGrossHighGas = quote({
      routeFingerprint: 'high-gross',
      grossAmountOut: 1_010_000n,
      commissionAmount: 2_020n,
      netAmountOut: 1_007_980n,
      netValueUsdMicros: 1_010_000_000n,
      estimatedGasUsdMicros: 30_000_000n,
    });
    const lowerGrossLowGas = quote({
      routeFingerprint: 'low-gross',
      netValueUsdMicros: 1_000_000_000n,
      estimatedGasUsdMicros: 5_000_000n,
    });
    const result = selectBestCertifiedQuote([highGrossHighGas, lowerGrossLowGas], 2_000);
    expect(result.selected.routeFingerprint).toBe('low-gross');
    expect(result.selectionReason).toBe('highest_effective_net_value');
  });

  it('excludes uncertified, direct-router, stale, and blocked-impact candidates', () => {
    const valid = quote({ routeFingerprint: 'valid' });
    const invalid = [
      quote({ routeFingerprint: 'uncertified', certified: false }),
      quote({ routeFingerprint: 'direct', directRouter: true }),
      quote({ routeFingerprint: 'stale', expiresAt: 1_999 }),
      quote({ routeFingerprint: 'impact', priceImpactBps: 501 }),
    ];
    const result = selectBestCertifiedQuote([valid, ...invalid], 2_000);
    expect(result.selected.routeFingerprint).toBe('valid');
    expect(result.candidatesRejected).toBe(4);
  });

  it('uses lower hops, freshness, then fingerprint as deterministic tie-breakers', () => {
    const hopWinner = quote({ routeFingerprint: 'hop', hopCount: 1 });
    const multi = quote({ routeFingerprint: 'multi', hopCount: 2, quotedAt: 2_000 });
    expect(selectBestCertifiedQuote([multi, hopWinner], 2_000).selected.routeFingerprint).toBe('hop');

    const fresh = quote({ routeFingerprint: 'fresh', quotedAt: 2_000 });
    const old = quote({ routeFingerprint: 'old', quotedAt: 1_000 });
    expect(selectBestCertifiedQuote([old, fresh], 2_000).selected.routeFingerprint).toBe('fresh');

    const a = quote({ routeFingerprint: 'a', quotedAt: 2_000 });
    const b = quote({ routeFingerprint: 'b', quotedAt: 2_000 });
    expect(selectBestCertifiedQuote([b, a], 2_000).selected.routeFingerprint).toBe('a');
  });

  it('is independent of candidate order', () => {
    const a = quote({ routeFingerprint: 'a', netAmountOut: 998_000n });
    const b = quote({
      routeFingerprint: 'b',
      grossAmountOut: 1_001_000n,
      commissionAmount: 2_002n,
      netAmountOut: 998_998n,
    });
    expect(selectBestCertifiedQuote([a, b], 2_000).selected.routeFingerprint).toBe('b');
    expect(selectBestCertifiedQuote([b, a], 2_000).selected.routeFingerprint).toBe('b');
  });
});
