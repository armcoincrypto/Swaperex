/**
 * Send Service
 *
 * Gas estimation, fee calculation, max-send computation.
 * All client-side via ethers.js provider — no backend required.
 */

import type { BrowserProvider, TransactionRequest } from 'ethers';

export interface FeeEstimate {
  gasLimit: bigint;
  maxFeePerGas: bigint | null;
  maxPriorityFeePerGas: bigint | null;
  gasPrice: bigint | null;
  /** Total estimated fee in wei */
  totalFeeWei: bigint;
  /** Is EIP-1559 supported */
  isEip1559: boolean;
}

export type GasMode = 'auto' | 'low' | 'market' | 'fast';

/** Gas multipliers for each mode */
const GAS_MULTIPLIERS: Record<GasMode, number> = {
  low: 80,     // 0.8x
  auto: 100,   // 1.0x
  market: 100, // 1.0x (same as auto)
  fast: 130,   // 1.3x
};

/** Gas limit buffer (15% extra for safety) */
const GAS_LIMIT_BUFFER = 115n; // 1.15x

/**
 * Estimate gas for a transaction
 */
export async function estimateTransferFee(
  provider: BrowserProvider,
  txRequest: TransactionRequest,
  gasMode: GasMode = 'auto',
): Promise<FeeEstimate> {
  // Get gas estimate and fee data in parallel
  const [gasEstimate, feeData] = await Promise.all([
    provider.estimateGas(txRequest),
    provider.getFeeData(),
  ]);

  // Add buffer to gas limit
  const gasLimit = (gasEstimate * GAS_LIMIT_BUFFER) / 100n;

  const multiplier = BigInt(GAS_MULTIPLIERS[gasMode]);
  const isEip1559 = feeData.maxFeePerGas != null;

  let totalFeeWei: bigint;
  let maxFeePerGas: bigint | null = null;
  let maxPriorityFeePerGas: bigint | null = null;
  let gasPrice: bigint | null = null;

  if (isEip1559 && feeData.maxFeePerGas) {
    maxFeePerGas = (feeData.maxFeePerGas * multiplier) / 100n;
    maxPriorityFeePerGas = feeData.maxPriorityFeePerGas
      ? (feeData.maxPriorityFeePerGas * multiplier) / 100n
      : null;
    totalFeeWei = gasLimit * maxFeePerGas;
  } else if (feeData.gasPrice) {
    gasPrice = (feeData.gasPrice * multiplier) / 100n;
    totalFeeWei = gasLimit * gasPrice;
  } else {
    throw new Error('Unable to get gas price');
  }

  return {
    gasLimit,
    maxFeePerGas,
    maxPriorityFeePerGas,
    gasPrice,
    totalFeeWei,
    isEip1559,
  };
}

/**
 * Calculate max sendable amount for native token.
 * max = balance - (gasLimit * feePerGas * 1.15 buffer)
 */
export function calculateMaxNativeSend(
  balanceWei: bigint,
  feeEstimate: FeeEstimate,
): bigint {
  // Add 15% buffer on top of the estimated fee for safety
  const feeWithBuffer = (feeEstimate.totalFeeWei * 115n) / 100n;

  if (balanceWei <= feeWithBuffer) {
    return 0n;
  }

  return balanceWei - feeWithBuffer;
}

/**
 * Check if user can afford gas for the transaction.
 * Returns { canAfford, shortfall } in wei.
 */
export function canAffordGas(
  nativeBalanceWei: bigint,
  sendAmountWei: bigint,
  feeEstimate: FeeEstimate,
  isNativeToken: boolean,
): { canAfford: boolean; shortfallWei: bigint } {
  const totalNeeded = isNativeToken
    ? sendAmountWei + feeEstimate.totalFeeWei
    : feeEstimate.totalFeeWei;

  if (nativeBalanceWei >= totalNeeded) {
    return { canAfford: true, shortfallWei: 0n };
  }

  return {
    canAfford: false,
    shortfallWei: totalNeeded - nativeBalanceWei,
  };
}
