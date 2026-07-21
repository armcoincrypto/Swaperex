import { getNetworkCapability } from '@/config/networkCapabilities';

export type ExecutionGasBudget = {
  requiredNativeWei: bigint;
  shortfallWei: bigint;
  sufficient: boolean;
  nativeSymbol: string;
};

export function evaluateExecutionGasBudget(input: {
  chainId: number;
  nativeBalanceWei: bigint;
  transactionValueWei: bigint;
  gasUnits: bigint;
  maxFeePerGasWei: bigint;
}): ExecutionGasBudget {
  if (input.nativeBalanceWei < 0n || input.transactionValueWei < 0n) {
    throw new Error('Native balance and transaction value must be non-negative');
  }
  if (input.gasUnits <= 0n || input.maxFeePerGasWei <= 0n) {
    throw new Error('Current network fee estimate is unavailable');
  }
  const nativeSymbol = getNetworkCapability(input.chainId)?.nativeToken ?? 'ETH';
  const requiredNativeWei =
    input.transactionValueWei + input.gasUnits * input.maxFeePerGasWei;
  const shortfallWei =
    requiredNativeWei > input.nativeBalanceWei
      ? requiredNativeWei - input.nativeBalanceWei
      : 0n;
  return {
    requiredNativeWei,
    shortfallWei,
    sufficient: shortfallWei === 0n,
    nativeSymbol,
  };
}

export function assertExecutionGasBudget(
  input: Parameters<typeof evaluateExecutionGasBudget>[0],
): ExecutionGasBudget {
  const result = evaluateExecutionGasBudget(input);
  if (!result.sufficient) {
    throw new Error(
      `Insufficient ${result.nativeSymbol} for network fees. Reduce the swap amount or add more ${result.nativeSymbol}.`,
    );
  }
  return result;
}
