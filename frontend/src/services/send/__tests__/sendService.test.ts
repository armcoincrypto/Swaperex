/**
 * Send Service Tests
 */

import { describe, it, expect } from 'vitest';
import {
  calculateMaxNativeSend,
  canAffordGas,
  type FeeEstimate,
} from '@/services/send/sendService';

const mockFeeEstimate: FeeEstimate = {
  gasLimit: 21000n,
  maxFeePerGas: 50000000000n, // 50 gwei
  maxPriorityFeePerGas: 2000000000n, // 2 gwei
  gasPrice: null,
  totalFeeWei: 21000n * 50000000000n, // 1,050,000 gwei = 0.00105 ETH
  isEip1559: true,
};

describe('calculateMaxNativeSend', () => {
  it('subtracts fee with buffer from balance', () => {
    const balance = 1000000000000000000n; // 1 ETH
    const max = calculateMaxNativeSend(balance, mockFeeEstimate);

    // fee = 1,050,000,000,000,000 wei * 1.15 = 1,207,500,000,000,000
    const expectedFeeWithBuffer = (mockFeeEstimate.totalFeeWei * 115n) / 100n;
    expect(max).toBe(balance - expectedFeeWithBuffer);
    expect(max > 0n).toBe(true);
  });

  it('returns 0 when balance is less than fee', () => {
    const balance = 100000n; // tiny amount
    const max = calculateMaxNativeSend(balance, mockFeeEstimate);
    expect(max).toBe(0n);
  });

  it('returns 0 when balance equals fee', () => {
    const feeWithBuffer = (mockFeeEstimate.totalFeeWei * 115n) / 100n;
    const max = calculateMaxNativeSend(feeWithBuffer, mockFeeEstimate);
    expect(max).toBe(0n);
  });
});

describe('canAffordGas', () => {
  it('returns true when native balance covers amount + gas', () => {
    const balance = 2000000000000000000n; // 2 ETH
    const sendAmount = 1000000000000000000n; // 1 ETH
    const result = canAffordGas(balance, sendAmount, mockFeeEstimate, true);
    expect(result.canAfford).toBe(true);
    expect(result.shortfallWei).toBe(0n);
  });

  it('returns false when native balance insufficient for amount + gas', () => {
    const balance = 1000000000000000000n; // 1 ETH
    const sendAmount = 999999000000000000n; // 0.999999 ETH (leaves only 1000 gwei for gas)
    const result = canAffordGas(balance, sendAmount, mockFeeEstimate, true);
    expect(result.canAfford).toBe(false);
    expect(result.shortfallWei > 0n).toBe(true);
  });

  it('only checks gas fee for ERC-20 sends (not amount)', () => {
    const nativeBalance = 2000000000000000n; // 0.002 ETH (enough for gas)
    const erc20Amount = 1000000000000000000n; // 1 token (irrelevant for gas check)
    const result = canAffordGas(nativeBalance, erc20Amount, mockFeeEstimate, false);
    // For ERC-20, only need gas fee (0.00105 ETH), have 0.002 ETH
    expect(result.canAfford).toBe(true);
  });

  it('returns shortfall amount when insufficient', () => {
    const balance = 500000000000000n; // 0.0005 ETH
    const sendAmount = 0n; // ERC-20, amount doesn't matter
    const result = canAffordGas(balance, sendAmount, mockFeeEstimate, false);
    expect(result.canAfford).toBe(false);
    expect(result.shortfallWei).toBe(mockFeeEstimate.totalFeeWei - balance);
  });
});
