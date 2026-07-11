/**
 * P15 — Display-only network fee estimate from quote gas units + live gas price.
 * Does not affect transaction construction.
 */

import { BrowserProvider } from 'ethers';
import { getNetworkCapability } from '@/config/networkCapabilities';

export type NetworkFeeEstimateResult = {
  gasUnits: string | null;
  nativeSymbol: string;
  /** Approximate native-token fee; null when unavailable */
  nativeFeeFormatted: string | null;
  unavailableReason: string | null;
  /** True when estimate used live gas price from provider */
  isLiveEstimate: boolean;
};

function parseGasUnits(gasEstimate: string | null | undefined): bigint | null {
  if (gasEstimate == null || gasEstimate === '') return null;
  try {
    const units = BigInt(gasEstimate);
    return units > 0n ? units : null;
  } catch {
    return null;
  }
}

function formatNativeFee(wei: bigint, symbol: string): string {
  const eth = Number(wei) / 1e18;
  if (!Number.isFinite(eth) || eth <= 0) return `<0.000001 ${symbol}`;
  if (eth < 0.0001) return `<0.0001 ${symbol}`;
  return `~${eth.toFixed(4)} ${symbol}`;
}

/**
 * Estimate network fee for display. When `provider` is absent, returns units-only guidance.
 */
export async function estimateNetworkFeeForDisplay(params: {
  chainId: number;
  gasEstimate: string | null | undefined;
  provider?: unknown;
  walletConnected: boolean;
}): Promise<NetworkFeeEstimateResult> {
  const cap = getNetworkCapability(params.chainId);
  const nativeSymbol = cap?.nativeToken ?? 'ETH';
  const gasUnits = parseGasUnits(params.gasEstimate);

  if (!gasUnits) {
    return {
      gasUnits: null,
      nativeSymbol,
      nativeFeeFormatted: null,
      unavailableReason: params.walletConnected
        ? 'Gas estimate unavailable for this quote.'
        : 'Connect wallet to estimate the exact network fee.',
      isLiveEstimate: false,
    };
  }

  const gasUnitsStr = gasUnits.toString();

  if (!params.walletConnected || !params.provider) {
    return {
      gasUnits: gasUnitsStr,
      nativeSymbol,
      nativeFeeFormatted: null,
      unavailableReason: 'Connect wallet to estimate the exact network fee.',
      isLiveEstimate: false,
    };
  }

  try {
    const ethersProvider = new BrowserProvider(params.provider as { request: (...args: unknown[]) => Promise<unknown> });
    const feeData = await ethersProvider.getFeeData();
    const gasPrice = feeData.maxFeePerGas ?? feeData.gasPrice;
    if (gasPrice == null || gasPrice <= 0n) {
      return {
        gasUnits: gasUnitsStr,
        nativeSymbol,
        nativeFeeFormatted: null,
        unavailableReason: 'Network gas price unavailable — your wallet shows the fee before signing.',
        isLiveEstimate: false,
      };
    }
    const feeWei = gasUnits * gasPrice;
    return {
      gasUnits: gasUnitsStr,
      nativeSymbol,
      nativeFeeFormatted: formatNativeFee(feeWei, nativeSymbol),
      unavailableReason: null,
      isLiveEstimate: true,
    };
  } catch {
    return {
      gasUnits: gasUnitsStr,
      nativeSymbol,
      nativeFeeFormatted: null,
      unavailableReason: 'Could not read gas price — your wallet shows the fee before signing.',
      isLiveEstimate: false,
    };
  }
}
