import { describe, expect, it } from 'vitest';
import {
  assertExecutionGasBudget,
  evaluateExecutionGasBudget,
} from '@/utils/executionGasPreflight';

describe('execution gas preflight', () => {
  it('includes transaction value plus swap gas for native input', () => {
    const result = evaluateExecutionGasBudget({
      chainId: 1,
      nativeBalanceWei: 2_000n,
      transactionValueWei: 1_000n,
      gasUnits: 100n,
      maxFeePerGasWei: 5n,
    });
    expect(result.requiredNativeWei).toBe(1_500n);
    expect(result.sufficient).toBe(true);
  });

  it('blocks ERC-20 input when native gas balance is insufficient', () => {
    expect(() =>
      assertExecutionGasBudget({
        chainId: 1,
        nativeBalanceWei: 499n,
        transactionValueWei: 0n,
        gasUnits: 100n,
        maxFeePerGasWei: 5n,
      }),
    ).toThrow(/Insufficient ETH for network fees/);
  });

  it('uses BNB-specific copy without cross-contamination', () => {
    expect(() =>
      assertExecutionGasBudget({
        chainId: 56,
        nativeBalanceWei: 1n,
        transactionValueWei: 0n,
        gasUnits: 100n,
        maxFeePerGasWei: 5n,
      }),
    ).toThrow(/Insufficient BNB for network fees/);
  });

  it('fails closed when gas or fee data is missing', () => {
    expect(() =>
      assertExecutionGasBudget({
        chainId: 1,
        nativeBalanceWei: 1_000n,
        transactionValueWei: 0n,
        gasUnits: 0n,
        maxFeePerGasWei: 5n,
      }),
    ).toThrow(/unavailable/i);
  });
});
