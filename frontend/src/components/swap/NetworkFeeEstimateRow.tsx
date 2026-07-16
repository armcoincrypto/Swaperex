/**
 * P15 — Network fee estimate row (gas units + optional native fee).
 * Separates network gas from Kobbex commission in the UI.
 */

import { useEffect, useState } from 'react';
import { SWAP_SURFACE_COPY } from '@/constants/swapSurfaceCopy';
import { formatGasLimitUnits } from '@/utils/format';
import {
  estimateNetworkFeeForDisplay,
  type NetworkFeeEstimateResult,
} from '@/utils/networkFeeEstimate';

interface NetworkFeeEstimateRowProps {
  chainId: number;
  gasEstimate: string | null | undefined;
  provider?: unknown;
  walletConnected: boolean;
  compact?: boolean;
  className?: string;
}

export function NetworkFeeEstimateRow({
  chainId,
  gasEstimate,
  provider,
  walletConnected,
  compact = false,
  className = '',
}: NetworkFeeEstimateRowProps) {
  const [result, setResult] = useState<NetworkFeeEstimateResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void estimateNetworkFeeForDisplay({
      chainId,
      gasEstimate,
      provider,
      walletConnected,
    }).then((r) => {
      if (!cancelled) setResult(r);
    });
    return () => {
      cancelled = true;
    };
  }, [chainId, gasEstimate, provider, walletConnected]);

  const gasUnitsDisplay = formatGasLimitUnits(gasEstimate) ?? result?.gasUnits ?? '—';

  return (
    <div className={`space-y-1 ${className}`}>
      <div className="flex justify-between gap-2 min-w-0 items-baseline">
        <span className="text-dark-400 shrink-0">Network fee (est.)</span>
        <span className="text-dark-300 font-mono text-right tabular-nums break-words">
          {result?.nativeFeeFormatted ?? '—'}
        </span>
      </div>
      {!compact && (
        <>
          <div className="flex justify-between gap-2 min-w-0 items-baseline text-[11px]">
            <span className="text-dark-500 shrink-0">{SWAP_SURFACE_COPY.gasLimitEstimateLabel}</span>
            <span className="text-dark-400 font-mono text-right">{gasUnitsDisplay}</span>
          </div>
          <p className="text-[11px] text-dark-500 leading-snug">
            {result?.unavailableReason ??
              (result?.isLiveEstimate
                ? 'Approximate network gas — not the Kobbex commission. Your wallet confirms the final fee.'
                : SWAP_SURFACE_COPY.networkFeeWalletFallback)}
          </p>
        </>
      )}
    </div>
  );
}

export default NetworkFeeEstimateRow;
