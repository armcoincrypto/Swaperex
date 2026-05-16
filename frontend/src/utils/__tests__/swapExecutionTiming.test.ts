import { describe, it, expect } from 'vitest';
import { resolveUniswapWrapperV3GasLimitHint } from '../swapExecutionTiming';
import type { AggregatedQuote } from '@/services/quoteAggregator';

function agg(gas: number): AggregatedQuote {
  return {
    amountIn: '1',
    amountOut: '1',
    amountOutFormatted: '1',
    minAmountOut: '1',
    minAmountOutFormatted: '1',
    provider: 'uniswap-v3-wrapper-v3',
    providerDetails: { gas },
    chainId: 1,
    priceImpact: '0',
    amountOutRaw: 1n,
    originalQuote: {} as AggregatedQuote['originalQuote'],
  };
}

describe('resolveUniswapWrapperV3GasLimitHint', () => {
  it('pads quoted gas by 15% and floors', () => {
    expect(resolveUniswapWrapperV3GasLimitHint(agg(380_000))).toBe(437_000n);
  });

  it('clamps below minimum', () => {
    expect(resolveUniswapWrapperV3GasLimitHint(agg(100_000))).toBe(300_000n);
  });

  it('clamps above maximum', () => {
    expect(resolveUniswapWrapperV3GasLimitHint(agg(600_000))).toBe(600_000n);
  });

  it('returns undefined when gas missing', () => {
    expect(resolveUniswapWrapperV3GasLimitHint(undefined)).toBeUndefined();
  });
});
