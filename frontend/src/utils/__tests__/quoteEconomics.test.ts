import { describe, expect, it } from 'vitest';
import {
  QuoteAccountingError,
  assertQuoteAccounting,
  buildQuoteEconomics,
  calculateCommissionAmount,
  calculateMinimumReceived,
  type QuoteEconomicsInput,
} from '@/utils/quoteEconomics';
import { classifyQuoteQuality } from '@/utils/quoteQuality';

const token = {
  symbol: 'USDC',
  address: '0x0000000000000000000000000000000000000001',
  decimals: 6,
  isNative: false,
};

function input(overrides: Partial<QuoteEconomicsInput> = {}): QuoteEconomicsInput {
  return {
    chainId: 1,
    routeFingerprint: 'eth:weth-usdc:500',
    tokenIn: { ...token, symbol: 'WETH' },
    tokenOut: token,
    amountIn: 1_000_000_000_000_000_000n,
    grossAmountOut: 1_000_000n,
    commissionBps: 20,
    commissionAmount: 2_000n,
    netAmountOut: 998_000n,
    estimatedGasUnits: 200_000n,
    priceImpactBps: 42,
    slippageBps: 50,
    hopCount: 1,
    routeType: 'uniswap-v3-wrapper-v2',
    wrapperAddress: '0x0000000000000000000000000000000000000002',
    certified: true,
    directRouter: false,
    quotedAt: 1_000,
    expiresAt: 31_000,
    ...overrides,
  };
}

describe('quote economics accounting', () => {
  it('uses exact chain bps with integer floor rounding', () => {
    expect(calculateCommissionAmount(1_000_001n, 20)).toBe(2_000n);
    expect(calculateCommissionAmount(1_000_001n, 50)).toBe(5_000n);
  });

  it('calculates minimum received from net output', () => {
    expect(calculateMinimumReceived(998_000n, 50)).toBe(993_010n);
  });

  it('builds an internally consistent economics record', () => {
    const result = buildQuoteEconomics(input(), (quote) =>
      classifyQuoteQuality(quote, 2_000),
    );
    expect(result.netAmountOut).toBe(result.grossAmountOut - result.commissionAmount);
    expect(result.minimumReceived).toBe(993_010n);
    expect(result.minimumReceived).toBeLessThanOrEqual(result.netAmountOut);
    expect(result.qualityStatus).toBe('NORMAL');
  });

  it('fails closed when chain commission bps is wrong', () => {
    expect(() =>
      buildQuoteEconomics(input({ commissionBps: 50, commissionAmount: 5_000n }), classifyQuoteQuality),
    ).toThrow(QuoteAccountingError);
  });

  it('fails closed for mismatched provider fee accounting', () => {
    expect(() =>
      assertQuoteAccounting({
        chainId: 1,
        grossAmountOut: 1_000_000n,
        commissionBps: 20,
        commissionAmount: 1_999n,
        netAmountOut: 998_001n,
        minimumReceived: 990_000n,
      }),
    ).toThrow(/inconsistent/i);
  });

  it('fails for negative or oversized commission', () => {
    expect(() =>
      assertQuoteAccounting({
        chainId: 1,
        grossAmountOut: 1_000_000n,
        commissionBps: 20,
        commissionAmount: -1n,
        netAmountOut: 1_000_001n,
        minimumReceived: 1n,
      }),
    ).toThrow(/invalid/i);
    expect(() =>
      assertQuoteAccounting({
        chainId: 1,
        grossAmountOut: 1_000_000n,
        commissionBps: 20,
        commissionAmount: 1_000_001n,
        netAmountOut: -1n,
        minimumReceived: 0n,
      }),
    ).toThrow(/invalid/i);
  });
});
