import { describe, expect, it } from 'vitest';
import {
  calculateSafeNativeMax,
  checkNativeGasAffordability,
  formatSafeNativeMaxAmount,
  scaleFeeByGasUnits,
} from '@/utils/safeNativeMax';
import { getNativeGasFallbackReserve } from '@/config/nativeGasReserve';

describe('calculateSafeNativeMax', () => {
  it('never consumes the full native balance', () => {
    const r = calculateSafeNativeMax({
      walletNativeBalance: 0.002,
      estimatedNetworkFeeNative: 0.00005,
      chainId: 56,
      gasPriceAvailable: true,
    });
    expect(r.safeMax).toBeGreaterThan(0);
    expect(r.safeMax).toBeLessThan(0.002);
    expect(r.safeMax + r.reservedNative).toBeLessThanOrEqual(0.002 + 1e-12);
  });

  it('never returns negative MAX', () => {
    const r = calculateSafeNativeMax({
      walletNativeBalance: 0.0001,
      estimatedNetworkFeeNative: 0.001,
      chainId: 56,
      gasPriceAvailable: true,
    });
    expect(r.safeMax).toBe(0);
  });

  it('uses chain fallback reserve when gas price unavailable', () => {
    const fallback = getNativeGasFallbackReserve(56);
    const r = calculateSafeNativeMax({
      walletNativeBalance: 0.01,
      estimatedNetworkFeeNative: null,
      chainId: 56,
      gasPriceAvailable: false,
    });
    expect(r.usedFallbackReserve).toBe(true);
    expect(r.reservedNative).toBe(fallback);
    expect(r.reserveNote).toMatch(/estimated/i);
    expect(r.safeMax).toBeCloseTo(0.01 - fallback, 8);
  });

  it('does not silently allow nearly full balance when gas unavailable', () => {
    const formatted = formatSafeNativeMaxAmount({
      walletNativeBalance: 0.002,
      estimatedNetworkFeeNative: null,
      chainId: 56,
      gasPriceAvailable: false,
    });
    expect(parseFloat(formatted)).toBe(0);
  });
});

describe('checkNativeGasAffordability', () => {
  it('blocks native input when balance leaves too little for fees', () => {
    const r = checkNativeGasAffordability({
      chainId: 56,
      nativeBalance: 0.002,
      nativeInputAmount: 0.0019,
      estimatedSwapFeeNative: 0.0003,
      gasPriceAvailable: true,
      needsApproval: false,
      estimatedApprovalFeeNative: null,
    });
    expect(r.sufficient).toBe(false);
    expect(r.blockingMessage).toMatch(/Insufficient BNB/);
  });

  it('requires approval + swap fee buffer for ERC-20 input', () => {
    const r = checkNativeGasAffordability({
      chainId: 1,
      nativeBalance: 0.001,
      nativeInputAmount: 0,
      estimatedSwapFeeNative: 0.0004,
      gasPriceAvailable: true,
      needsApproval: true,
      estimatedApprovalFeeNative: 0.0002,
    });
    expect(r.sufficient).toBe(false);
    expect(r.blockingMessage).toMatch(/Insufficient ETH/);
  });

  it('uses fallback reserve when gas price unavailable', () => {
    const r = checkNativeGasAffordability({
      chainId: 56,
      nativeBalance: 0.05,
      nativeInputAmount: 0.01,
      estimatedSwapFeeNative: null,
      gasPriceAvailable: false,
      needsApproval: false,
      estimatedApprovalFeeNative: null,
    });
    expect(r.usedFallbackReserve).toBe(true);
    expect(r.sufficient).toBe(true);
  });
});

describe('scaleFeeByGasUnits', () => {
  it('scales approval fee from swap fee', () => {
    const fee = scaleFeeByGasUnits(0.001, 100_000n, 50_000n);
    expect(fee).toBeCloseTo(0.0005, 8);
  });
});
