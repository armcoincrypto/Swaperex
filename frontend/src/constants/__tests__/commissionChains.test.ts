import { describe, expect, it, vi } from 'vitest';

vi.mock('@/config', () => ({
  isCommissionRequiredMode: () => true,
}));

import {
  COMMISSION_SWAP_CHAIN_IDS,
  isCommissionSwapChain,
  isCommissionSwapUnavailableOnChain,
} from '@/constants/commissionChains';

describe('commissionChains', () => {
  it('defines Ethereum and BNB Chain as swap-ready', () => {
    expect(COMMISSION_SWAP_CHAIN_IDS).toEqual([1, 56]);
    expect(isCommissionSwapChain(1)).toBe(true);
    expect(isCommissionSwapChain(56)).toBe(true);
  });

  it('marks balance-view chains as swap-unavailable in commission mode', () => {
    for (const chainId of [137, 42161, 10, 43114]) {
      expect(isCommissionSwapChain(chainId)).toBe(false);
      expect(isCommissionSwapUnavailableOnChain(chainId)).toBe(true);
    }
  });

  it('does not mark swap-ready chains as unavailable', () => {
    expect(isCommissionSwapUnavailableOnChain(1)).toBe(false);
    expect(isCommissionSwapUnavailableOnChain(56)).toBe(false);
  });
});
