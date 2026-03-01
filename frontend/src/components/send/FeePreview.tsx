/**
 * Fee Preview Card for Send v2
 *
 * Shows estimated gas fee, total cost, and advanced gas options.
 * Displays clear "insufficient gas" warnings.
 */

import { useState } from 'react';
import { formatEther } from 'ethers';
import { getNativeSymbol } from '@/tokens';
import { formatUsd } from '@/utils/format';
import type { FeeEstimate, GasMode } from '@/services/send/sendService';

interface Props {
  feeEstimate: FeeEstimate | null;
  isEstimating: boolean;
  estimateError: string | null;
  /** Send amount in human-readable form */
  sendAmount: string;
  /** Token symbol being sent */
  tokenSymbol: string;
  /** Is the token the native chain token? */
  isNativeToken: boolean;
  /** Chain ID for native symbol */
  chainId: number;
  /** Can user afford gas? */
  canAffordGas: boolean;
  /** Gas shortfall in wei (if can't afford) */
  shortfallWei: bigint;
  /** Current gas mode */
  gasMode: GasMode;
  /** Callback to change gas mode */
  onGasModeChange: (mode: GasMode) => void;
  /** Retry estimation */
  onRetry: () => void;
  /** Native token price in USD (optional) */
  nativeUsdPrice?: number;
}

const GAS_MODE_LABELS: Record<GasMode, string> = {
  low: 'Low',
  auto: 'Auto',
  market: 'Market',
  fast: 'Fast',
};

export function FeePreview({
  feeEstimate,
  isEstimating,
  estimateError,
  sendAmount,
  tokenSymbol,
  isNativeToken,
  chainId,
  canAffordGas,
  shortfallWei,
  gasMode,
  onGasModeChange,
  onRetry,
  nativeUsdPrice,
}: Props) {
  const [showAdvanced, setShowAdvanced] = useState(false);
  const nativeSymbol = getNativeSymbol(chainId);

  const feeDisplay = feeEstimate
    ? formatEther(feeEstimate.totalFeeWei)
    : null;

  const feeUsd = feeEstimate && nativeUsdPrice
    ? parseFloat(formatEther(feeEstimate.totalFeeWei)) * nativeUsdPrice
    : null;

  return (
    <div className="bg-dark-800 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-dark-300">Transaction Preview</span>
        {feeEstimate && (
          <span className="text-[10px] text-dark-500 uppercase">
            {feeEstimate.isEip1559 ? 'EIP-1559' : 'Legacy'}
          </span>
        )}
      </div>

      {/* Loading */}
      {isEstimating && (
        <div className="flex items-center gap-2 text-sm text-dark-400 py-2">
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Estimating gas...
        </div>
      )}

      {/* Waiting for estimate (no error, not loading, no result) */}
      {!feeEstimate && !isEstimating && !estimateError && (
        <div className="flex items-center gap-2 text-sm text-dark-400 py-2">
          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Preparing gas estimate...
        </div>
      )}

      {/* Error */}
      {estimateError && !isEstimating && (
        <div className="text-sm text-red-400 py-2">
          <p>{estimateError}</p>
          <button
            onClick={onRetry}
            className="text-xs text-primary-400 hover:text-primary-300 underline mt-1"
          >
            Retry estimation
          </button>
        </div>
      )}

      {/* Fee details */}
      {feeEstimate && !isEstimating && (
        <div className="space-y-2">
          {/* Send amount */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-dark-400">
              {isNativeToken ? 'Transfer' : 'Token Transfer'}
            </span>
            <span className="text-white">
              {sendAmount} {tokenSymbol}
            </span>
          </div>

          {/* Network fee */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-dark-400">Network Fee</span>
            <span className="text-white">
              {parseFloat(feeDisplay!).toFixed(6)} {nativeSymbol}
              {feeUsd != null && (
                <span className="text-dark-500 ml-1">
                  ({formatUsd(feeUsd)})
                </span>
              )}
            </span>
          </div>

          {/* Divider */}
          <div className="border-t border-dark-700 my-1" />

          {/* Total */}
          {isNativeToken ? (
            <div className="flex items-center justify-between text-sm font-medium">
              <span className="text-dark-300">Total Cost</span>
              <span className="text-white">
                {(parseFloat(sendAmount || '0') + parseFloat(feeDisplay!)).toFixed(6)} {nativeSymbol}
              </span>
            </div>
          ) : (
            <div className="text-sm">
              <div className="flex items-center justify-between">
                <span className="text-dark-300 font-medium">Total</span>
                <span className="text-white">
                  {sendAmount} {tokenSymbol} + {parseFloat(feeDisplay!).toFixed(6)} {nativeSymbol}
                </span>
              </div>
            </div>
          )}

          {/* Gas insufficient warning */}
          {!canAffordGas && (
            <div className="mt-2 p-2 bg-red-900/20 border border-red-800 rounded-lg text-xs text-red-400">
              Insufficient {nativeSymbol} for gas.
              {shortfallWei > 0n && (
                <span className="ml-1">
                  Need ~{parseFloat(formatEther(shortfallWei)).toFixed(6)} more {nativeSymbol}.
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* Advanced options */}
      {feeEstimate && (
        <div className="mt-3 pt-2 border-t border-dark-700">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1 text-xs text-dark-400 hover:text-white transition-colors"
          >
            <svg
              className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-90' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Advanced
          </button>

          {showAdvanced && (
            <div className="mt-2 space-y-2">
              {/* Gas mode */}
              <div>
                <label className="text-xs text-dark-500 mb-1 block">Gas Speed</label>
                <div className="flex gap-1">
                  {(Object.keys(GAS_MODE_LABELS) as GasMode[]).map((mode) => (
                    <button
                      key={mode}
                      onClick={() => onGasModeChange(mode)}
                      className={`flex-1 px-2 py-1 text-xs rounded-lg transition-colors ${
                        gasMode === mode
                          ? 'bg-primary-600 text-white'
                          : 'bg-dark-700 text-dark-400 hover:text-white'
                      }`}
                    >
                      {GAS_MODE_LABELS[mode]}
                    </button>
                  ))}
                </div>
              </div>

              {/* Gas details */}
              <div className="text-[11px] text-dark-500 space-y-0.5">
                <div className="flex justify-between">
                  <span>Gas Limit</span>
                  <span>{feeEstimate.gasLimit.toString()}</span>
                </div>
                {feeEstimate.maxFeePerGas != null ? (
                  <div className="flex justify-between">
                    <span>Max Fee</span>
                    <span>{(Number(feeEstimate.maxFeePerGas) / 1e9).toFixed(2)} Gwei</span>
                  </div>
                ) : null}
                {feeEstimate.gasPrice != null ? (
                  <div className="flex justify-between">
                    <span>Gas Price</span>
                    <span>{(Number(feeEstimate.gasPrice) / 1e9).toFixed(2)} Gwei</span>
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default FeePreview;
