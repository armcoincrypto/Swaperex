import { describe, expect, it } from 'vitest';
import {
  buildCertifiedQuoteEconomics,
  parseReliablePriceImpactBps,
} from '@/utils/certifiedQuoteEconomics';
import { PRICE_IMPACT_NOT_ESTIMATED } from '@/utils/format';

const input = {
  chainId: 1,
  certifiedRouteFingerprint: '1|weth|usdc',
  provider: 'uniswap-v3-wrapper-v2',
  wrapperAddress: '0x0000000000000000000000000000000000000001',
  tokenIn: { symbol: 'WETH', address: '0x2', decimals: 18, isNative: false },
  tokenOut: { symbol: 'USDC', address: '0x3', decimals: 6, isNative: false },
  amountIn: '1000000000000000000',
  amountOutGross: '1000000',
  commissionAmount: '2000',
  amountOutNet: '998000',
  gasEstimate: '200000',
  priceImpactPercent: '0.42',
  slippagePercent: 0.5,
  feeTier: 500,
  hopCount: 1,
  quotedAt: 1_000,
  expiresAt: 31_000,
};

describe('buildCertifiedQuoteEconomics', () => {
  it('preserves exact wrapper gross, commission, and net values', () => {
    const result = buildCertifiedQuoteEconomics(input, 2_000);
    expect(result.grossAmountOut).toBe(1_000_000n);
    expect(result.commissionAmount).toBe(2_000n);
    expect(result.netAmountOut).toBe(998_000n);
    expect(result.minimumReceived).toBe(993_010n);
    expect(result.priceImpactBps).toBe(42);
  });

  it('fails closed when wrapper omits exact accounting fields', () => {
    expect(() =>
      buildCertifiedQuoteEconomics({ ...input, amountOutGross: undefined }, 2_000),
    ).toThrow(/gross output/i);
  });

  it('treats unavailable impact as unknown rather than zero', () => {
    expect(parseReliablePriceImpactBps(PRICE_IMPACT_NOT_ESTIMATED)).toBeUndefined();
    const result = buildCertifiedQuoteEconomics(
      { ...input, priceImpactPercent: PRICE_IMPACT_NOT_ESTIMATED },
      2_000,
    );
    expect(result.qualityStatus).toBe('UNKNOWN');
    expect(result.warnings).toContain('NO_PRICE_IMPACT_DATA');
  });
});
