import { describe, expect, it } from 'vitest';
import {
  buildSwapSearchParams,
  parseSwapSearchParams,
  swapSearchStringsEqual,
} from '@/utils/swapUrlState';
import { isCommissionRouteCertified } from '@/utils/commissionRoutePolicy';

describe('swapUrlState', () => {
  it('parses valid swap params', () => {
    const { params, rejected } = parseSwapSearchParams('?chain=1&from=WETH&to=USDT&slippage=1');
    expect(rejected).toEqual([]);
    expect(params).toEqual({ chain: 1, from: 'WETH', to: 'USDT', slippage: 1 });
  });

  it('rejects invalid chain and slippage', () => {
    const { params, rejected } = parseSwapSearchParams('?chain=137&from=!!!&slippage=99');
    expect(rejected).toContain('chain');
    expect(rejected).toContain('from');
    expect(rejected).toContain('slippage');
    expect(params).toEqual({});
  });

  it('rejects view-only chain ids at parse time', () => {
    expect(parseSwapSearchParams('?chain=42161&from=ETH&to=USDC').rejected).toContain('chain');
    expect(parseSwapSearchParams('?chain=137&from=USDC&to=USDT').params.chain).toBeUndefined();
  });

  it('builds and compares search strings', () => {
    const built = buildSwapSearchParams({
      chainId: 56,
      fromSymbol: 'BNB',
      toSymbol: 'USDC',
      slippage: 0.5,
    });
    expect(built).toContain('chain=56');
    expect(built).toContain('from=BNB');
    expect(swapSearchStringsEqual('chain=56&from=BNB', 'from=BNB&chain=56')).toBe(true);
  });

  it('marks known uncertified deep-link pairs as not certified', () => {
    expect(isCommissionRouteCertified({ chainId: 56, tokenIn: 'WBNB', tokenOut: 'USDT' })).toBe(false);
    expect(isCommissionRouteCertified({ chainId: 56, tokenIn: 'FDUSD', tokenOut: 'BNB' })).toBe(false);
    expect(isCommissionRouteCertified({ chainId: 1, tokenIn: 'PEPE', tokenOut: 'WETH' })).toBe(false);
    expect(isCommissionRouteCertified({ chainId: 1, tokenIn: 'ETH', tokenOut: 'WETH' })).toBe(false);
    expect(isCommissionRouteCertified({ chainId: 1, tokenIn: 'WETH', tokenOut: 'USDT' })).toBe(true);
  });
});
