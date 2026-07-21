/**
 * Canonical, integer-only quote accounting.
 *
 * Token amounts are raw bigint units. USD comparisons use integer micro-dollars
 * so route ranking never depends on JavaScript floating-point arithmetic.
 */

export type TokenIdentity = {
  symbol: string;
  address: string | null;
  decimals: number;
  isNative: boolean;
};

export type QuoteQualityStatus = 'NORMAL' | 'ELEVATED' | 'HIGH' | 'BLOCKED' | 'UNKNOWN';

export type QuoteQualityWarning =
  | 'LOW_LIQUIDITY'
  | 'HIGH_PRICE_IMPACT'
  | 'MULTI_HOP'
  | 'HIGH_GAS'
  | 'STALE_QUOTE'
  | 'QUOTE_EXPIRING'
  | 'NO_GAS_ESTIMATE'
  | 'NO_PRICE_IMPACT_DATA'
  | 'WRAPPER_DEGRADED'
  | 'RPC_DEGRADED';

export type QuoteEconomics = {
  chainId: number;
  routeFingerprint: string;
  tokenIn: TokenIdentity;
  tokenOut: TokenIdentity;
  amountIn: bigint;

  grossAmountOut: bigint;
  commissionBps: number;
  commissionAmount: bigint;
  netAmountOut: bigint;

  estimatedGasUnits?: bigint;
  estimatedGasNative?: bigint;
  estimatedGasUsdMicros?: bigint;
  netValueUsdMicros?: bigint;
  effectiveValueAfterGasUsdMicros?: bigint;

  priceImpactBps?: number;
  liquidityUsdMicros?: bigint;
  slippageBps: number;
  minimumReceived: bigint;

  hopCount: number;
  routeType: string;
  wrapperAddress: string;
  certified: boolean;
  directRouter: boolean;

  quotedAt: number;
  expiresAt?: number;
  qualityStatus: QuoteQualityStatus;
  warnings: QuoteQualityWarning[];
};

export type QuoteEconomicsInput = Omit<
  QuoteEconomics,
  | 'minimumReceived'
  | 'effectiveValueAfterGasUsdMicros'
  | 'qualityStatus'
  | 'warnings'
>;

export class QuoteAccountingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'QuoteAccountingError';
  }
}

export function expectedCommissionBpsForChain(chainId: number): number {
  if (chainId === 1) return 20;
  if (chainId === 56) return 50;
  throw new QuoteAccountingError(`No certified commission policy for chain ${chainId}`);
}

export function calculateCommissionAmount(grossAmountOut: bigint, commissionBps: number): bigint {
  if (grossAmountOut < 0n) throw new QuoteAccountingError('Gross output cannot be negative');
  if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps >= 10_000) {
    throw new QuoteAccountingError('Commission bps is outside the valid range');
  }
  return (grossAmountOut * BigInt(commissionBps)) / 10_000n;
}

export function calculateMinimumReceived(netAmountOut: bigint, slippageBps: number): bigint {
  if (netAmountOut < 0n) throw new QuoteAccountingError('Net output cannot be negative');
  if (!Number.isInteger(slippageBps) || slippageBps < 0 || slippageBps > 10_000) {
    throw new QuoteAccountingError('Slippage bps is outside the valid range');
  }
  return netAmountOut - (netAmountOut * BigInt(slippageBps)) / 10_000n;
}

export function assertQuoteAccounting(input: {
  chainId: number;
  grossAmountOut: bigint;
  commissionBps: number;
  commissionAmount: bigint;
  netAmountOut: bigint;
  minimumReceived: bigint;
}): void {
  const expectedBps = expectedCommissionBpsForChain(input.chainId);
  if (input.commissionBps !== expectedBps) {
    throw new QuoteAccountingError(
      `Commission mismatch: expected ${expectedBps} bps, received ${input.commissionBps}`,
    );
  }
  if (input.commissionAmount < 0n || input.commissionAmount > input.grossAmountOut) {
    throw new QuoteAccountingError('Commission amount is invalid');
  }
  const expectedCommission = calculateCommissionAmount(
    input.grossAmountOut,
    input.commissionBps,
  );
  if (input.commissionAmount !== expectedCommission) {
    throw new QuoteAccountingError('Provider commission accounting is inconsistent');
  }
  if (input.netAmountOut !== input.grossAmountOut - input.commissionAmount) {
    throw new QuoteAccountingError('Net output does not equal gross output minus commission');
  }
  if (input.minimumReceived < 0n || input.minimumReceived > input.netAmountOut) {
    throw new QuoteAccountingError('Minimum received is outside the valid net-output range');
  }
}

export function buildQuoteEconomics(
  input: QuoteEconomicsInput,
  classify: (quote: QuoteEconomics) => Pick<QuoteEconomics, 'qualityStatus' | 'warnings'>,
): QuoteEconomics {
  const minimumReceived = calculateMinimumReceived(input.netAmountOut, input.slippageBps);
  assertQuoteAccounting({ ...input, minimumReceived });

  const effectiveValueAfterGasUsdMicros =
    input.netValueUsdMicros != null && input.estimatedGasUsdMicros != null
      ? input.netValueUsdMicros - input.estimatedGasUsdMicros
      : undefined;

  const unclassified: QuoteEconomics = {
    ...input,
    minimumReceived,
    effectiveValueAfterGasUsdMicros,
    qualityStatus: 'UNKNOWN',
    warnings: [],
  };
  return { ...unclassified, ...classify(unclassified) };
}
