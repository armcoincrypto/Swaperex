import { describe, expect, it } from 'vitest';
import {
  buildSwapSearchParams,
  parseSwapSearchParams,
  swapSearchStringsEqual,
} from '@/utils/swapUrlState';

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

  it('builds and compares search strings', () => {
    const built = buildSwapSearchParams({
      chainId: 56,
      fromSymbol: 'WBNB',
      toSymbol: 'USDC',
      slippage: 0.5,
    });
    expect(built).toContain('chain=56');
    expect(built).toContain('from=WBNB');
    expect(swapSearchStringsEqual('chain=56&from=WBNB', 'from=WBNB&chain=56')).toBe(true);
  });
});
