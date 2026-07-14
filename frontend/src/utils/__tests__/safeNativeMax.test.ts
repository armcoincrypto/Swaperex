import { describe, expect, it } from 'vitest';
import {
  calculateSafeNativeMax,
  checkNativeGasAffordability,
  formatSafeNativeMaxAmount,
  scaleFeeByGasUnits,
} from '@/utils/safeNativeMax';
import { getNativeGasFallbackReserve, LIVE_FEE_SAFETY_MARGIN } from '@/config/nativeGasReserve';

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

  describe('BNB boundary matrix (P18.2)', () => {
    const chainId = 56;
    const fallback = getNativeGasFallbackReserve(56);
    const cases: Array<{ balance: number; fee: number | null; gasOk: boolean; expectMax: number | 'lte-balance' }> = [
      { balance: 0, fee: 0.00005, gasOk: true, expectMax: 0 },
      { balance: fallback * 0.5, fee: null, gasOk: false, expectMax: 0 },
      { balance: fallback, fee: null, gasOk: false, expectMax: 0 },
      { balance: fallback + 0.0001, fee: null, gasOk: false, expectMax: 0.0001 },
      { balance: 0.002, fee: null, gasOk: false, expectMax: 0 },
      { balance: 0.05, fee: 0.0004, gasOk: true, expectMax: 'lte-balance' },
      { balance: 100, fee: 0.0004, gasOk: true, expectMax: 'lte-balance' },
    ];

    it.each(cases)(
      'balance=$balance fee=$fee gasOk=$gasOk → safeMax never negative/overrun',
      ({ balance, fee, gasOk, expectMax }) => {
        const r = calculateSafeNativeMax({
          walletNativeBalance: balance,
          estimatedNetworkFeeNative: fee,
          chainId,
          gasPriceAvailable: gasOk,
        });
        expect(r.safeMax).toBeGreaterThanOrEqual(0);
        expect(r.safeMax).toBeLessThanOrEqual(balance + 1e-12);
        if (typeof expectMax === 'number') {
          expect(r.safeMax).toBeCloseTo(expectMax, 8);
        } else {
          expect(r.safeMax).toBeLessThan(balance);
          expect(r.reservedNative).toBeGreaterThan(0);
        }
      },
    );

    it('applies live fee × margin + padding consistently', () => {
      const fee = 0.0004;
      const r = calculateSafeNativeMax({
        walletNativeBalance: 0.05,
        estimatedNetworkFeeNative: fee,
        chainId: 56,
        gasPriceAvailable: true,
      });
      const expectedReserve = fee * (1 + LIVE_FEE_SAFETY_MARGIN) + Math.min(fallback * 0.25, fallback);
      expect(r.reservedNative).toBeCloseTo(expectedReserve, 10);
      expect(r.safeMax).toBeCloseTo(0.05 - expectedReserve, 10);
    });
  });

  describe('ETH boundary matrix (P18.2 deterministic)', () => {
    it('uses ETH fallback reserve on chain 1', () => {
      const fallback = getNativeGasFallbackReserve(1);
      expect(fallback).toBe(0.005);
      const r = calculateSafeNativeMax({
        walletNativeBalance: 0.01,
        estimatedNetworkFeeNative: null,
        chainId: 1,
        gasPriceAvailable: false,
      });
      expect(r.safeMax).toBeCloseTo(0.01 - fallback, 8);
      expect(r.usedFallbackReserve).toBe(true);
    });
  });

  describe('precision (P18.2)', () => {
    it('formats without scientific notation or negative zero', () => {
      const formatted = formatSafeNativeMaxAmount({
        walletNativeBalance: 1.23456789111,
        estimatedNetworkFeeNative: 0.00012345,
        chainId: 56,
        gasPriceAvailable: true,
      });
      expect(formatted).not.toMatch(/e[-+]?\d+/i);
      expect(formatted).not.toBe('-0');
      expect(parseFloat(formatted)).toBeGreaterThan(0);
      expect(parseFloat(formatted)).toBeLessThan(1.23456789111);
    });
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

  it('blocks 0.0019 BNB near-full input on 0.002 balance (live fee)', () => {
    const r = checkNativeGasAffordability({
      chainId: 56,
      nativeBalance: 0.002,
      nativeInputAmount: 0.0019,
      estimatedSwapFeeNative: 0.00005,
      gasPriceAvailable: true,
      needsApproval: false,
      estimatedApprovalFeeNative: null,
    });
    expect(r.sufficient).toBe(false);
    expect(r.blockingMessage).toMatch(/Insufficient BNB/);
  });

  it('blocks ERC-20 approval when native cannot cover approval+swap+pad', () => {
    const r = checkNativeGasAffordability({
      chainId: 56,
      nativeBalance: 0.0003,
      nativeInputAmount: 0,
      estimatedSwapFeeNative: 0.0002,
      gasPriceAvailable: true,
      needsApproval: true,
      estimatedApprovalFeeNative: 0.00015,
    });
    expect(r.sufficient).toBe(false);
    expect(r.requiredNative).toBeGreaterThan(0.0003);
  });
});

describe('scaleFeeByGasUnits', () => {
  it('scales approval fee from swap fee', () => {
    const fee = scaleFeeByGasUnits(0.001, 100_000n, 50_000n);
    expect(fee).toBeCloseTo(0.0005, 8);
  });
});
