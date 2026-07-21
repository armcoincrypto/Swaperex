import { describe, expect, it } from 'vitest';
import { buildQuoteEconomics, type QuoteEconomicsInput } from '@/utils/quoteEconomics';
import {
  classifyPriceImpactBps,
  classifyQuoteQuality,
  PRICE_IMPACT_BLOCK_BPS,
  PRICE_IMPACT_ELEVATED_BPS,
  PRICE_IMPACT_HIGH_BPS,
} from '@/utils/quoteQuality';

const base: QuoteEconomicsInput = {
  chainId: 1,
  routeFingerprint: 'route',
  tokenIn: { symbol: 'WETH', address: '0x1', decimals: 18, isNative: false },
  tokenOut: { symbol: 'USDC', address: '0x2', decimals: 6, isNative: false },
  amountIn: 1n,
  grossAmountOut: 1_000_000n,
  commissionBps: 20,
  commissionAmount: 2_000n,
  netAmountOut: 998_000n,
  estimatedGasUnits: 200_000n,
  slippageBps: 50,
  hopCount: 1,
  routeType: 'uniswap-v3-wrapper-v2',
  wrapperAddress: '0x3',
  certified: true,
  directRouter: false,
  quotedAt: 1_000,
  expiresAt: 31_000,
};

describe('price-impact policy', () => {
  it.each([
    [undefined, 'UNKNOWN'],
    [0, 'NORMAL'],
    [PRICE_IMPACT_ELEVATED_BPS, 'NORMAL'],
    [PRICE_IMPACT_ELEVATED_BPS + 1, 'ELEVATED'],
    [PRICE_IMPACT_HIGH_BPS, 'ELEVATED'],
    [PRICE_IMPACT_HIGH_BPS + 1, 'HIGH'],
    [PRICE_IMPACT_BLOCK_BPS, 'HIGH'],
    [PRICE_IMPACT_BLOCK_BPS + 1, 'BLOCKED'],
  ] as const)('classifies %s bps as %s', (impact, expected) => {
    expect(classifyPriceImpactBps(impact)).toBe(expected);
  });

  it('does not label unknown impact as safe', () => {
    const q = buildQuoteEconomics(base, (quote) => classifyQuoteQuality(quote, 2_000));
    expect(q.qualityStatus).toBe('UNKNOWN');
    expect(q.warnings).toContain('NO_PRICE_IMPACT_DATA');
  });

  it('blocks expired and above-threshold impact quotes', () => {
    const impact = buildQuoteEconomics(
      { ...base, priceImpactBps: PRICE_IMPACT_BLOCK_BPS + 1 },
      (quote) => classifyQuoteQuality(quote, 2_000),
    );
    const stale = buildQuoteEconomics(
      { ...base, priceImpactBps: 1, expiresAt: 1_999 },
      (quote) => classifyQuoteQuality(quote, 2_000),
    );
    expect(impact.qualityStatus).toBe('BLOCKED');
    expect(impact.warnings).toContain('HIGH_PRICE_IMPACT');
    expect(stale.qualityStatus).toBe('BLOCKED');
    expect(stale.warnings).toContain('STALE_QUOTE');
  });

  it('warns for multi-hop, high gas, and low liquidity', () => {
    const q = buildQuoteEconomics(
      {
        ...base,
        priceImpactBps: 20,
        hopCount: 2,
        netValueUsdMicros: 100_000_000n,
        estimatedGasUsdMicros: 3_000_000n,
        liquidityUsdMicros: 99_000_000_000n,
      },
      (quote) => classifyQuoteQuality(quote, 2_000),
    );
    expect(q.warnings).toEqual(
      expect.arrayContaining(['MULTI_HOP', 'HIGH_GAS', 'LOW_LIQUIDITY']),
    );
    expect(q.qualityStatus).toBe('ELEVATED');
  });
});
