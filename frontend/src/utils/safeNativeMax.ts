/**
 * P18.1 / P18.2 — Canonical safe native MAX and gas-affordability checks.
 */

import {
  APPROVAL_GAS_UNITS_FALLBACK,
  getNativeGasFallbackReserve,
  LIVE_FEE_SAFETY_MARGIN,
} from '@/config/nativeGasReserve';
import { getNetworkCapability } from '@/config/networkCapabilities';

export type SafeNativeMaxInput = {
  walletNativeBalance: number;
  /** Live estimated network fee in native units (swap only, or swap+approval already summed). */
  estimatedNetworkFeeNative: number | null;
  chainId: number;
  /** When true, estimatedNetworkFeeNative came from a live gas price. */
  gasPriceAvailable: boolean;
};

export type SafeNativeMaxResult = {
  safeMax: number;
  reservedNative: number;
  usedFallbackReserve: boolean;
  /** User-facing note when reserve is estimated without live gas price. */
  reserveNote: string | null;
};

function formatSafeMax(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return '0';
  return amount.toFixed(8).replace(/\.?0+$/, '') || '0';
}

/**
 * Safe MAX for native-token input: never drains the full balance; never negative.
 */
export function calculateSafeNativeMax(input: SafeNativeMaxInput): SafeNativeMaxResult {
  const balance =
    Number.isFinite(input.walletNativeBalance) && input.walletNativeBalance > 0
      ? input.walletNativeBalance
      : 0;

  const fallback = getNativeGasFallbackReserve(input.chainId);
  let reservedNative: number;
  let usedFallbackReserve: boolean;
  let reserveNote: string | null = null;

  if (
    input.gasPriceAvailable &&
    input.estimatedNetworkFeeNative != null &&
    Number.isFinite(input.estimatedNetworkFeeNative) &&
    input.estimatedNetworkFeeNative > 0
  ) {
    reservedNative =
      input.estimatedNetworkFeeNative * (1 + LIVE_FEE_SAFETY_MARGIN) + Math.min(fallback * 0.25, fallback);
    usedFallbackReserve = false;
  } else {
    reservedNative = fallback;
    usedFallbackReserve = true;
    reserveNote =
      'Network fee reserve is estimated (gas price unavailable). Your wallet shows the final fee before signing.';
  }

  const safeMax = Math.max(0, balance - reservedNative);

  return {
    safeMax,
    reservedNative,
    usedFallbackReserve,
    reserveNote,
  };
}

export function formatSafeNativeMaxAmount(input: SafeNativeMaxInput): string {
  return formatSafeMax(calculateSafeNativeMax(input).safeMax);
}

export type GasAffordabilityInput = {
  chainId: number;
  nativeBalance: number;
  /** Amount of native token spent as swap input (0 for ERC-20 input). */
  nativeInputAmount: number;
  /** Estimated fee for the swap leg in native units; null when unknown. */
  estimatedSwapFeeNative: number | null;
  /** Whether a live gas price was obtained. */
  gasPriceAvailable: boolean;
  needsApproval: boolean;
  /** Optional separate approval fee; when null and needsApproval, derived from swap fee ratio or fallback reserve slice. */
  estimatedApprovalFeeNative: number | null;
};

export type GasAffordabilityResult = {
  sufficient: boolean;
  requiredNative: number;
  shortfall: number;
  usedFallbackReserve: boolean;
  gasPriceAvailable: boolean;
  nativeSymbol: string;
  /** Public blocking copy, e.g. "Insufficient BNB for network fees…" */
  blockingMessage: string | null;
};

/**
 * Whether the wallet retains enough native currency after the swap (and approval) for fees + reserve.
 */
export function checkNativeGasAffordability(input: GasAffordabilityInput): GasAffordabilityResult {
  const cap = getNetworkCapability(input.chainId);
  const nativeSymbol = cap?.nativeToken ?? 'ETH';
  const fallback = getNativeGasFallbackReserve(input.chainId);

  const nativeInput =
    Number.isFinite(input.nativeInputAmount) && input.nativeInputAmount > 0
      ? input.nativeInputAmount
      : 0;
  const balance =
    Number.isFinite(input.nativeBalance) && input.nativeBalance > 0 ? input.nativeBalance : 0;

  let swapFee = 0;
  let approvalFee = 0;
  let usedFallbackReserve = false;
  let gasPriceAvailable = input.gasPriceAvailable;

  if (
    input.gasPriceAvailable &&
    input.estimatedSwapFeeNative != null &&
    Number.isFinite(input.estimatedSwapFeeNative) &&
    input.estimatedSwapFeeNative > 0
  ) {
    swapFee = input.estimatedSwapFeeNative * (1 + LIVE_FEE_SAFETY_MARGIN);
    if (input.needsApproval) {
      if (
        input.estimatedApprovalFeeNative != null &&
        Number.isFinite(input.estimatedApprovalFeeNative) &&
        input.estimatedApprovalFeeNative > 0
      ) {
        approvalFee = input.estimatedApprovalFeeNative * (1 + LIVE_FEE_SAFETY_MARGIN);
      } else {
        // Scale approval from swap fee using unit ratio when possible; else modest fraction of swap fee.
        approvalFee = Math.max(swapFee * 0.35, fallback * 0.15);
      }
    }
  } else {
    usedFallbackReserve = true;
    gasPriceAvailable = false;
    // Conservative: require full chain fallback for swap (+ half again if approval).
    swapFee = fallback;
    approvalFee = input.needsApproval ? fallback * 0.5 : 0;
  }

  const safetyPad = usedFallbackReserve ? 0 : Math.min(fallback * 0.2, fallback);
  const requiredNative = nativeInput + swapFee + approvalFee + safetyPad;
  const shortfall = Math.max(0, requiredNative - balance);
  const sufficient = balance >= requiredNative;

  const blockingMessage = sufficient
    ? null
    : `Insufficient ${nativeSymbol} for network fees. Reduce the swap amount or add more ${nativeSymbol}.`;

  return {
    sufficient,
    requiredNative,
    shortfall,
    usedFallbackReserve,
    gasPriceAvailable,
    nativeSymbol,
    blockingMessage,
  };
}

/**
 * Derive native fee approx from gas units × gas price (wei), or null.
 */
export function feeNativeFromGas(gasUnits: bigint | null, gasPriceWei: bigint | null): number | null {
  if (gasUnits == null || gasUnits <= 0n || gasPriceWei == null || gasPriceWei <= 0n) return null;
  const feeWei = gasUnits * gasPriceWei;
  const native = Number(feeWei) / 1e18;
  return Number.isFinite(native) && native > 0 ? native : null;
}

export function parseGasUnitsBigInt(gasEstimate: string | null | undefined): bigint | null {
  if (gasEstimate == null || gasEstimate === '') return null;
  try {
    const units = BigInt(gasEstimate);
    return units > 0n ? units : null;
  } catch {
    return null;
  }
}

/** Scale a swap-fee native estimate by approval:swap gas unit ratio. */
export function scaleFeeByGasUnits(
  swapFeeNative: number | null,
  swapGasUnits: bigint | null,
  approvalGasUnits: bigint = APPROVAL_GAS_UNITS_FALLBACK,
): number | null {
  if (swapFeeNative == null || !Number.isFinite(swapFeeNative) || swapFeeNative <= 0) return null;
  if (swapGasUnits == null || swapGasUnits <= 0n) {
    return swapFeeNative * 0.35;
  }
  return swapFeeNative * (Number(approvalGasUnits) / Number(swapGasUnits));
}
