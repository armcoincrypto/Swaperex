/**
 * Swap Preview Modal
 *
 * Shows complete swap details before user signs.
 * Implements quote expiry, refresh, and multi-step flow.
 *
 * SECURITY: All signing happens client-side via wallet.
 * Swaperex only prepares unsigned transactions.
 */

import { useState, useEffect, useCallback } from 'react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { SWAP_SURFACE_COPY } from '@/constants/swapSurfaceCopy';
import { formatQuoteRoutePreferenceLabel } from '@/services/quoteAggregator';
import { formatBalance, formatGasLimitUnits, getPriceImpactUi, swapAggregatorProviderLabel } from '@/utils/format';
import { getMonetizationConfig, isMonetizationActiveForProvider, getUniswapWrapperConfig } from '@/config';
import { getChainById, getExplorerTxUrl } from '@/config/chains';
import type { SwapQuote } from '@/hooks/useSwap';
import type { ApprovalMode } from '@/stores/swapStore';

// Quote expires after 30 seconds
const QUOTE_EXPIRY_SECONDS = 30;

export type SwapStep = 'preview' | 'approving' | 'swapping' | 'broadcasting' | 'success' | 'error';

/** Session recovery when quote is no longer in memory but a swap tx was already sent */
export type RecoveredSwapTrace = {
  fromSymbol: string;
  toSymbol: string;
  fromAmount: string;
  toAmount: string;
  outcomeUncertain?: boolean;
};

interface SwapPreviewModalProps {
  isOpen: boolean;
  quote: SwapQuote | null;
  step: SwapStep;
  error: string | null;
  txHash: string | null;
  explorerUrl?: string | null;  // PHASE 9: Explorer URL from useSwap
  approvalMode?: ApprovalMode;
  /** Refresh/reopen after page reload with only chain + tx trace */
  recoveredTrace?: RecoveredSwapTrace | null;
  /** Clears persisted pending swap after user verifies on explorer (conservative retry) */
  onClearPendingSwap?: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onRefreshQuote: () => void;
  isRefreshing: boolean;
  /** Active chain for network label (from wallet / swap context; display-only) */
  chainId?: number | null;
}

export function SwapPreviewModal({
  isOpen,
  quote,
  step,
  error,
  txHash,
  explorerUrl,
  approvalMode = 'exact',
  recoveredTrace = null,
  onClearPendingSwap,
  onConfirm,
  onCancel,
  onRefreshQuote,
  isRefreshing,
  chainId = null,
}: SwapPreviewModalProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(QUOTE_EXPIRY_SECONDS);
  const [isExpired, setIsExpired] = useState(false);

  // Compute remaining time from actual quoteTimestamp (not just reset to 30s)
  useEffect(() => {
    if (isOpen && quote) {
      const elapsed = Math.floor((Date.now() - quote.quoteTimestamp) / 1000);
      const remaining = Math.max(0, QUOTE_EXPIRY_SECONDS - elapsed);
      setSecondsRemaining(remaining);
      setIsExpired(remaining <= 0);
    }
  }, [isOpen, quote]);

  // Countdown timer
  useEffect(() => {
    if (!isOpen || step !== 'preview' || isExpired) return;

    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          setIsExpired(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, step, isExpired]);

  // Handle refresh
  const handleRefresh = useCallback(() => {
    onRefreshQuote();
    setSecondsRemaining(QUOTE_EXPIRY_SECONDS);
    setIsExpired(false);
  }, [onRefreshQuote]);

  const recoveredOnly =
    !quote &&
    recoveredTrace &&
    isOpen &&
    (step === 'broadcasting' || step === 'error');

  if (recoveredOnly && recoveredTrace) {
    const title =
      step === 'error' && recoveredTrace.outcomeUncertain
        ? 'Outcome unclear'
        : step === 'error'
          ? 'Swap failed'
          : 'Confirming swap';
    return (
      <Modal
        isOpen={isOpen}
        onClose={step === 'error' ? onCancel : () => {}}
        title={title}
        size="md"
      >
        <RecoveredSwapTraceBody
          trace={recoveredTrace}
          step={step}
          error={error}
          txHash={txHash}
          explorerUrl={explorerUrl}
          onClose={onCancel}
          onClearPendingSwap={onClearPendingSwap}
        />
      </Modal>
    );
  }

  if (!quote) return null;

  const priceImpact = parseFloat(quote.price_impact || '0');
  const priceImpactUi = getPriceImpactUi(quote.price_impact);
  const priceImpactRowVariant =
    priceImpactUi.severity === 'critical' || priceImpactUi.severity === 'high'
      ? 'danger'
      : priceImpactUi.severity === 'medium'
      ? 'warning'
      : 'normal';
  const isHighImpact = priceImpact > 3;
  const isVeryHighImpact = priceImpact > 10;
  const gasUnitsDisplay = formatGasLimitUnits(quote.gasEstimate);
  const isLoading = step === 'approving' || step === 'swapping' || step === 'broadcasting';
  const needsApproval = quote.needsApproval;

  // Determine step number for multi-step display
  const getStepDisplay = () => {
    // Broadcasting: single sentence in wallet notice below (avoid duplicating "confirming" copy)
    if (step === 'broadcasting') {
      return null;
    }
    if (!needsApproval) {
      if (step === 'swapping') return 'Step 1/1: Confirm in wallet';
      return null;
    }
    if (step === 'approving') return 'Step 1/2: Approve in wallet';
    if (step === 'swapping') return 'Step 2/2: Confirm swap in wallet';
    return null;
  };

  const stepDisplay = getStepDisplay();

  const walletNotice =
    step === 'broadcasting'
      ? {
          boxClass: 'text-blue-300 bg-blue-900/20 border border-blue-800/40',
          text: 'Submitted to the network. Waiting for confirmation.',
        }
      : step === 'approving' || step === 'swapping'
        ? {
            boxClass: 'text-yellow-400 bg-yellow-900/20',
            text: 'Check your wallet and approve this request.',
          }
        : {
            boxClass: 'text-yellow-400 bg-yellow-900/20',
            text: 'Your wallet will open to confirm this transaction.',
          };

  return (
    <Modal
      isOpen={isOpen}
      onClose={step === 'preview' || step === 'error' ? onCancel : () => {}}
      title={
        step === 'success'
          ? 'Swap Completed'
          : step === 'broadcasting'
            ? 'Confirming swap'
            : 'Review Swap'
      }
      size="md"
    >
      {/* Success State */}
      {step === 'success' && (
        <SuccessContent
          quote={quote}
          txHash={txHash}
          explorerUrl={explorerUrl}
          onClose={onCancel}
        />
      )}

      {/* Error State */}
      {step === 'error' && (
        <ErrorContent
          error={error}
          txHash={txHash}
          explorerUrl={explorerUrl}
          onTryAgain={handleRefresh}
          onCancel={onCancel}
        />
      )}

      {/* Preview / Loading States */}
      {step !== 'success' && step !== 'error' && (
        <>
          {/* Swap Summary */}
          <div className="bg-dark-800 rounded-xl p-4 mb-4">
            <SwapSummary quote={quote} />
          </div>

          <p className="text-[11px] text-dark-500 leading-snug mb-4">
            {SWAP_SURFACE_COPY.trustLineQuoteEstimate}
          </p>

          {/* Pre-sign confidence summary (preview only; display-only; no new quote math) */}
          {step === 'preview' && (
            <PreSignConfidenceBlock
              quote={quote}
              chainId={chainId}
              secondsRemaining={secondsRemaining}
              isExpired={isExpired}
              gasUnitsDisplay={gasUnitsDisplay}
            />
          )}

          {/* Quote Expiry Timer */}
          {step === 'preview' && (
            <QuoteExpiryBanner
              secondsRemaining={secondsRemaining}
              isExpired={isExpired}
              onRefresh={handleRefresh}
              isRefreshing={isRefreshing}
            />
          )}

          {/* Step Progress (for multi-step) */}
          {stepDisplay && (
            <div className="bg-primary-900/20 text-primary-400 rounded-lg px-3 py-2 mb-4 text-sm font-medium">
              {stepDisplay}
            </div>
          )}

          {/* Quote Details */}
          <div className="space-y-2 text-sm mb-4">
            <DetailRow
              label="Exchange rate"
              value={`1 ${quote.from_asset} = ${formatBalance(quote.rate)} ${quote.to_asset}`}
            />
            <DetailRow
              label="Price impact"
              value={priceImpactUi.label}
              variant={priceImpactRowVariant}
              title="Estimated vs. mid price before fees — not your slippage setting"
            />
            <DetailRow
              label={quote.provider === '1inch' ? 'Route fees' : 'Pool Fee'}
              value={
                quote.provider === '1inch'
                  ? 'Included in quote (multi-pool)'
                  : quote.provider === 'uniswap-v3-wrapper'
                    ? `${formatSwapFeeTierDisplay(quote.feeTier)} pool (wrapper route)`
                    : `${formatSwapFeeTierDisplay(quote.feeTier)} fee tier`
              }
            />
            {quote.provider === '1inch' && isMonetizationActiveForProvider('1inch') && (
              <>
                <DetailRow
                  label="Platform fee"
                  value={`${(getMonetizationConfig().feeBps / 100).toFixed(2)}%`}
                  title="Swaperex platform fee via 1inch — taken from the output token when the swap executes"
                />
                <p className="text-[11px] text-dark-500 leading-snug -mt-1 pl-0">
                  Not a network (gas) fee. Quote amounts and route fees above are estimated before this fee.
                </p>
              </>
            )}
            {quote.provider === 'uniswap-v3-wrapper' && (
              <>
                <DetailRow
                  label="Wrapper protocol fee"
                  value={`${(getUniswapWrapperConfig().feeBpsDisplay / 100).toFixed(2)}%`}
                  title="Swaperex Uniswap wrapper — taken from gross output on-chain; quoted receive amount is net."
                />
                <p className="text-[11px] text-dark-500 leading-snug -mt-1 pl-0">
                  Not a network (gas) fee. Expected and minimum received reflect net output after this fee.
                </p>
              </>
            )}
            {step !== 'preview' && (
              <>
                <DetailRow
                  label="Minimum received"
                  value={`${formatBalance(quote.minimum_received)} ${quote.to_asset}`}
                />
                <DetailRow
                  label="Slippage tolerance"
                  value={`${quote.slippage}%`}
                />
                <DetailRow
                  label={SWAP_SURFACE_COPY.routePreferenceLabel}
                  value={formatQuoteRoutePreferenceLabel(quote.routeMode ?? 'best')}
                />
                <DetailRow
                  label={SWAP_SURFACE_COPY.routeViaLabel}
                  value={swapAggregatorProviderLabel(quote.provider)}
                  title="Venue that will execute this swap"
                />
              </>
            )}
            {quote.quoteSelectionReason && (
              <DetailRow
                label="Quote selection"
                value={quote.quoteSelectionReason}
              />
            )}
            {quote.runnerUpAggregatedQuote ? (
              <DetailRow
                label={`Runner-up (not selected) · ${swapAggregatorProviderLabel(quote.runnerUpAggregatedQuote.provider)}`}
                value={`${formatBalance(quote.runnerUpAggregatedQuote.amountOut)} ${quote.to_asset}`}
              />
            ) : null}
            {needsApproval && (
              <DetailRow
                label="Approval"
                value={approvalMode === 'exact' ? 'Exact amount' : 'Unlimited'}
                variant={approvalMode === 'unlimited' ? 'warning' : 'normal'}
              />
            )}
          </div>

          {/* High Impact Warning */}
          {isHighImpact && (
            <div className={`flex items-center gap-2 rounded-lg p-3 mb-4 ${
              isVeryHighImpact
                ? 'bg-red-900/30 text-red-400 border border-red-800'
                : 'bg-yellow-900/30 text-yellow-400 border border-yellow-800'
            }`}>
              <WarningIcon />
              <span className="text-sm">
                {isVeryHighImpact
                  ? 'Very high price impact! You may receive significantly less than expected.'
                  : 'High price impact. Consider reducing your swap amount.'}
              </span>
            </div>
          )}

          {/* Gas limit (quote) + fee note — preview step: summarized in PreSignConfidenceBlock */}
          {step !== 'preview' && (
            <div className="bg-dark-800/50 rounded-lg p-3 mb-4 space-y-1">
              <div className="flex justify-between text-sm gap-2">
                <span className="text-dark-400 shrink-0">Est. gas (units)</span>
                <span className="text-dark-300 font-mono text-right">{gasUnitsDisplay ?? '—'}</span>
              </div>
              <div className="flex justify-between text-sm gap-2">
                <span className="text-dark-400 shrink-0">Network fee</span>
                <span className="text-dark-400 text-right">Set by wallet at signing</span>
              </div>
              <p className="text-[11px] text-dark-500 leading-snug pt-1">
                The limit above is from the quote simulation; gas price and total fee are finalized in your wallet.
              </p>
            </div>
          )}

          {/* Approval Notice */}
          {needsApproval && step === 'preview' && (
            <div className={`flex items-center gap-2 rounded-lg p-3 mb-4 ${
              approvalMode === 'unlimited'
                ? 'text-yellow-400 bg-yellow-900/20'
                : 'text-blue-400 bg-blue-900/20'
            }`}>
              <InfoIcon />
              <span className="text-sm">
                {approvalMode === 'unlimited'
                  ? 'This swap requires unlimited token approval. You\'ll sign two transactions. The router will have permanent access to this token.'
                  : 'This swap requires token approval for the exact amount. You\'ll sign two transactions.'}
              </span>
            </div>
          )}

          {/* Wallet / confirmation notice */}
          <div className={`flex items-start gap-2 rounded-lg p-3 mb-4 ${walletNotice.boxClass}`}>
            <WalletIcon />
            <span className="text-sm leading-snug">{walletNotice.text}</span>
          </div>

          {step === 'broadcasting' && txHash && explorerUrl && (
            <div className="bg-dark-800 rounded-lg p-3 mb-4 space-y-2">
              <div className="text-xs text-dark-400">Transaction hash</div>
              <div className="font-mono text-xs text-dark-300 break-all">{txHash}</div>
              <a
                href={explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary-400 hover:text-primary-300"
              >
                View on block explorer
                <ExternalLinkIcon />
              </a>
            </div>
          )}

          {/* Security Notice */}
          <div className="flex items-center gap-2 text-dark-400 text-xs mb-4">
            <ShieldIcon />
            <span>Transaction signed locally in your wallet, never on our servers</span>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="secondary"
              onClick={onCancel}
              fullWidth
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={onConfirm}
              loading={isLoading}
              disabled={isExpired || isLoading}
              fullWidth
            >
              {isExpired
                ? SWAP_SURFACE_COPY.quoteExpiredTitle
                : isLoading
                ? getLoadingText(step)
                : needsApproval
                ? 'Approve & Swap'
                : 'Confirm Swap'}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

function RecoveredSwapTraceBody({
  trace,
  step,
  error,
  txHash,
  explorerUrl,
  onClose,
  onClearPendingSwap,
}: {
  trace: RecoveredSwapTrace;
  step: SwapStep;
  error: string | null;
  txHash: string | null;
  explorerUrl?: string | null;
  onClose: () => void;
  onClearPendingSwap?: () => void;
}) {
  const isBroadcasting = step === 'broadcasting';

  return (
    <div className="text-left">
      <div className="bg-dark-800 rounded-xl p-4 mb-4">
        <p className="text-sm text-dark-400 mb-2">Swap in progress (recovered from this browser)</p>
        <p className="text-center text-lg font-semibold text-white">
          {formatBalance(trace.fromAmount)} {trace.fromSymbol}
          <span className="text-dark-500 mx-2">→</span>
          <span className="text-primary-400">{formatBalance(trace.toAmount)} {trace.toSymbol}</span>
        </p>
        <p className="text-xs text-dark-500 mt-2 text-center">
          Amounts are from when you confirmed; final balances depend on on-chain execution.
        </p>
      </div>

      {trace.outcomeUncertain && (
        <div className="bg-amber-900/15 border border-amber-800/40 rounded-lg p-3 mb-4 text-sm text-dark-300 leading-snug">
          This device could not finish waiting for confirmation. The explorer is the source of truth — do not assume failure from this screen alone.
        </div>
      )}

      {isBroadcasting && (
        <div className="text-blue-300 bg-blue-900/20 border border-blue-800/40 rounded-lg p-3 mb-4 text-sm leading-snug">
          Waiting for block confirmations. If this takes unusually long, check gas and network status on the explorer.
        </div>
      )}

      {step === 'error' && error && (
        <div className="bg-red-900/15 border border-red-800/40 rounded-lg p-3 mb-4 text-sm text-red-200/90 leading-snug">
          {error}
        </div>
      )}

      {txHash && (
        <div className="bg-dark-800 rounded-lg p-3 mb-4 space-y-2">
          <div className="text-xs text-dark-400">Transaction hash</div>
          <div className="font-mono text-xs text-dark-300 break-all">{txHash}</div>
          {explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary-400 hover:text-primary-300"
            >
              View on block explorer
              <ExternalLinkIcon />
            </a>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3">
        <div className="flex gap-3">
          <Button variant="secondary" onClick={onClose} fullWidth>
            Close
          </Button>
        </div>
        {onClearPendingSwap && (
          <Button variant="secondary" onClick={onClearPendingSwap} fullWidth className="text-xs">
            I verified on the explorer — clear pending and allow a new swap
          </Button>
        )}
      </div>
    </div>
  );
}

/** Single scannable block before first wallet confirmation; uses existing quote + countdown only. */
function PreSignConfidenceBlock({
  quote,
  chainId,
  secondsRemaining,
  isExpired,
  gasUnitsDisplay,
}: {
  quote: SwapQuote;
  chainId: number | null | undefined;
  secondsRemaining: number;
  isExpired: boolean;
  gasUnitsDisplay: string | null;
}) {
  const chainCfg = chainId != null ? getChainById(chainId) : undefined;
  const networkDisplay =
    chainCfg != null && chainId != null
      ? `${chainCfg.name} · ${chainId}`
      : chainId != null
        ? `Chain ID ${chainId}`
        : '—';

  const freshnessDisplay = isExpired
    ? SWAP_SURFACE_COPY.quoteFreshnessStale
    : `Fresh · ${secondsRemaining}s left on quote`;

  return (
    <div
      className="rounded-xl border border-white/[0.08] bg-dark-900/40 p-4 mb-4"
      role="region"
      aria-label={SWAP_SURFACE_COPY.reviewBeforeSignTitle}
    >
      <h3 className="text-sm font-semibold text-white mb-3">{SWAP_SURFACE_COPY.reviewBeforeSignTitle}</h3>
      <dl className="space-y-2.5 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-dark-400 shrink-0">{SWAP_SURFACE_COPY.networkLabel}</dt>
          <dd className="text-right text-dark-100">{networkDisplay}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-dark-400 shrink-0">{SWAP_SURFACE_COPY.quoteFreshnessLabel}</dt>
          <dd className={`text-right ${isExpired ? 'text-red-400' : 'text-dark-100'}`}>{freshnessDisplay}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-dark-400 shrink-0">{SWAP_SURFACE_COPY.routePreferenceLabel}</dt>
          <dd className="text-right text-dark-100">{formatQuoteRoutePreferenceLabel(quote.routeMode ?? 'best')}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-dark-400 shrink-0">{SWAP_SURFACE_COPY.routeExecutionLabel}</dt>
          <dd className="text-right text-dark-100">{swapAggregatorProviderLabel(quote.provider)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-dark-400 shrink-0">{SWAP_SURFACE_COPY.minimumReceivedLabel}</dt>
          <dd className="text-right text-dark-100">
            {formatBalance(quote.minimum_received)} {quote.to_asset}
          </dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-dark-400 shrink-0">{SWAP_SURFACE_COPY.slippageToleranceLabel}</dt>
          <dd className="text-right text-dark-100">{quote.slippage}%</dd>
        </div>
        {quote.provider === '1inch' && isMonetizationActiveForProvider('1inch') && (
          <div className="flex justify-between gap-3">
            <dt className="text-dark-400 shrink-0">Platform fee</dt>
            <dd className="text-right text-dark-100" title="Output-token fee via 1inch; quote line is before this fee">
              {(getMonetizationConfig().feeBps / 100).toFixed(2)}%
            </dd>
          </div>
        )}
        {quote.provider === 'uniswap-v3-wrapper' && (
          <div className="flex justify-between gap-3">
            <dt className="text-dark-400 shrink-0">Wrapper protocol fee</dt>
            <dd className="text-right text-dark-100" title="Output-side fee via Swaperex wrapper; amounts shown are net">
              {(getUniswapWrapperConfig().feeBpsDisplay / 100).toFixed(2)}%
            </dd>
          </div>
        )}
        <div className="flex justify-between gap-3">
          <dt className="text-dark-400 shrink-0">{SWAP_SURFACE_COPY.gasLimitEstimateLabel}</dt>
          <dd className="text-right font-mono text-dark-100">{gasUnitsDisplay ?? '—'}</dd>
        </div>
        <div className="pt-2 border-t border-white/[0.06] mt-1">
          <p className="text-[11px] text-dark-500 leading-snug">{SWAP_SURFACE_COPY.networkFeeWalletFallback}</p>
        </div>
      </dl>
    </div>
  );
}

// Swap Summary Component
function SwapSummary({ quote }: { quote: SwapQuote }) {
  return (
    <div className="text-center">
      <div className="text-sm text-dark-400 mb-2">You're swapping</div>
      <div className="flex items-center justify-center gap-4">
        {/* From */}
        <div className="text-center">
          <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-dark-700 flex items-center justify-center">
            <span className="text-lg font-bold">{quote.from_asset[0]}</span>
          </div>
          <div className="text-xl font-bold">{formatBalance(quote.from_amount)}</div>
          <div className="text-dark-400 text-sm">{quote.from_asset}</div>
        </div>

        {/* Arrow */}
        <div className="flex-shrink-0">
          <ArrowRightIcon />
        </div>

        {/* To */}
        <div className="text-center">
          <div className="w-10 h-10 mx-auto mb-2 rounded-full bg-primary-900/50 flex items-center justify-center">
            <span className="text-lg font-bold text-primary-400">{quote.to_asset[0]}</span>
          </div>
          <div className="text-xl font-bold text-primary-400">{formatBalance(quote.to_amount)}</div>
          <div className="text-dark-400 text-sm">{quote.to_asset}</div>
        </div>
      </div>
    </div>
  );
}

// Quote Expiry Banner
function QuoteExpiryBanner({
  secondsRemaining,
  isExpired,
  onRefresh,
  isRefreshing,
}: {
  secondsRemaining: number;
  isExpired: boolean;
  onRefresh: () => void;
  isRefreshing: boolean;
}) {
  if (isExpired) {
    return (
      <div className="flex items-center justify-between bg-red-900/20 border border-red-800 rounded-lg px-3 py-2 mb-4">
        <div className="flex items-center gap-2 text-red-400">
          <ClockIcon />
          <span className="text-sm font-medium">{SWAP_SURFACE_COPY.quoteExpiredTitle}</span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={onRefresh}
          loading={isRefreshing}
        >
          {SWAP_SURFACE_COPY.refreshQuoteCta}
        </Button>
      </div>
    );
  }

  const isUrgent = secondsRemaining <= 10;
  const isCritical = secondsRemaining <= 5;

  return (
    <div className={`flex items-center justify-between rounded-lg px-3 py-2 mb-4 ${
      isCritical
        ? 'bg-red-900/20 border border-red-800'
        : isUrgent
        ? 'bg-yellow-900/20 border border-yellow-800'
        : 'bg-dark-800'
    }`}>
      <div className={`flex items-center gap-2 ${
        isCritical ? 'text-red-400' : isUrgent ? 'text-yellow-400' : 'text-dark-400'
      }`}>
        <ClockIcon />
        <span className="text-sm">
          Quote expires in <span className="font-mono font-medium">{secondsRemaining}s</span>
        </span>
      </div>
      <button
        onClick={onRefresh}
        disabled={isRefreshing}
        className="text-xs text-primary-400 hover:text-primary-300"
      >
        {isRefreshing ? SWAP_SURFACE_COPY.refreshing : SWAP_SURFACE_COPY.refreshQuoteCta}
      </button>
    </div>
  );
}

// Success Content - Enhanced receipt with detailed info
function SuccessContent({
  quote,
  txHash,
  explorerUrl: providedExplorerUrl,
  onClose,
}: {
  quote: SwapQuote;
  txHash: string | null;
  explorerUrl?: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const explorerUrl = providedExplorerUrl || getExplorerTxUrl(1, txHash || '');
  const timestamp = new Date().toLocaleString();

  const handleCopyTxHash = async () => {
    if (txHash) {
      await navigator.clipboard.writeText(txHash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="text-center">
      {/* Success Icon with animated check */}
      <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-green-900/30 flex items-center justify-center animate-pulse-once">
        <CheckIcon />
      </div>

      <h3 className="text-2xl font-bold mb-1 text-green-400">Swap Successful!</h3>
      <p className="text-dark-400 text-sm mb-4">{timestamp}</p>

      {/* Receipt Card */}
      <div className="bg-dark-800 rounded-xl p-4 mb-4 text-left">
        {/* Swap Summary */}
        <div className="flex items-center justify-center gap-4 pb-4 border-b border-dark-700 mb-3">
          <div className="text-center">
            <div className="w-10 h-10 mx-auto mb-1.5 rounded-full bg-dark-700 flex items-center justify-center">
              <span className="text-lg font-bold">{quote.from_asset[0]}</span>
            </div>
            <div className="text-lg font-bold">{formatBalance(quote.from_amount)}</div>
            <div className="text-dark-400 text-xs">{quote.from_asset}</div>
          </div>
          <div className="flex-shrink-0">
            <ArrowRightIcon />
          </div>
          <div className="text-center">
            <div className="w-10 h-10 mx-auto mb-1.5 rounded-full bg-green-900/50 flex items-center justify-center">
              <span className="text-lg font-bold text-green-400">{quote.to_asset[0]}</span>
            </div>
            <div className="text-lg font-bold text-green-400">{formatBalance(quote.to_amount)}</div>
            <div className="text-dark-400 text-xs">{quote.to_asset}</div>
          </div>
        </div>
        <p className="text-[11px] text-dark-500 text-center mb-3 leading-snug">
          Amounts shown are from the quote at signing. They are not parsed from on-chain token transfers.
        </p>

        {/* Receipt Details */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-dark-400 shrink-0">Quoted output</span>
            <span className="text-right">{formatBalance(quote.to_amount)} {quote.to_asset}</span>
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-dark-400 shrink-0" title="Floor implied by your slippage at send time">
              Minimum received
            </span>
            <span className="text-right">{formatBalance(quote.minimum_received)} {quote.to_asset}</span>
          </div>
          <div className="rounded-lg bg-blue-900/15 border border-blue-800/30 px-3 py-2 text-[11px] text-dark-300 leading-snug">
            <span className="text-blue-200/90 font-medium">Confirmed on-chain</span>
            {' '}
            — This receipt reflects a successful transaction, not a decoded exact received amount. For definitive
            settlement, use your wallet balances or the block explorer.
          </div>
          <div className="flex justify-between">
            <span className="text-dark-400">{SWAP_SURFACE_COPY.routeViaLabel}</span>
            <span className="text-primary-400">{swapAggregatorProviderLabel(quote.provider)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-dark-400">Exchange rate</span>
            <span>1 {quote.from_asset} = {formatBalance(quote.rate)} {quote.to_asset}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-dark-400">Slippage tolerance</span>
            <span>{quote.slippage}%</span>
          </div>
          {quote.price_impact && parseFloat(quote.price_impact) > 0 && (
            <div className="flex justify-between">
              <span className="text-dark-400">Price impact</span>
              <span className={parseFloat(quote.price_impact) > 3 ? 'text-yellow-400' : 'text-green-400'}>
                {quote.price_impact}%
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Transaction Hash with Copy */}
      {txHash && (
        <div className="bg-dark-800 rounded-lg p-3 mb-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="text-xs text-dark-400 mb-1">Transaction Hash</div>
              <div className="font-mono text-xs truncate text-dark-300">
                {txHash}
              </div>
            </div>
            <button
              onClick={handleCopyTxHash}
              className={`p-2 rounded-lg transition-colors ${
                copied ? 'bg-green-900/30 text-green-400' : 'bg-dark-700 hover:bg-dark-600 text-dark-400'
              }`}
              title={copied ? 'Copied!' : 'Copy hash'}
            >
              {copied ? <CheckSmallIcon /> : <CopyIcon />}
            </button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3">
        {txHash && (
          <a
            href={explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1"
          >
            <Button variant="secondary" fullWidth>
              <span className="flex items-center justify-center gap-2">
                View explorer
                <ExternalLinkIcon />
              </span>
            </Button>
          </a>
        )}
        <Button onClick={onClose} fullWidth>
          Done
        </Button>
      </div>
    </div>
  );
}

// Error categorization helper
interface ErrorInfo {
  type: 'rejection' | 'slippage' | 'gas' | 'balance' | 'network' | 'unknown';
  title: string;
  message: string;
  suggestion?: string;
  canRetry: boolean;
}

function categorizeError(error: string | null): ErrorInfo {
  const errorLower = error?.toLowerCase() || '';

  if (error === 'QUOTE_EXPIRED' || errorLower.includes('quote expired')) {
    return {
      type: 'unknown',
      title: SWAP_SURFACE_COPY.quoteExpiredTitle,
      message: SWAP_SURFACE_COPY.quoteExpiredDetail,
      suggestion: SWAP_SURFACE_COPY.quoteExpiredSuggestion,
      canRetry: true,
    };
  }

  // 1inch swap build / API (keep full message — do not collapse to generic "network")
  if (errorLower.includes('1inch:')) {
    return {
      type: 'unknown',
      title: '1inch could not build this swap',
      message: error || 'The 1inch swap service returned an error when building the transaction.',
      suggestion: 'Refresh the quote and try again. If it keeps happening, the 1inch API or your connection may be the cause — not always your wallet.',
      canRetry: true,
    };
  }

  // User rejected transaction
  if (errorLower.includes('rejected') || errorLower.includes('denied') || errorLower.includes('cancelled') || errorLower.includes('user refused')) {
    return {
      type: 'rejection',
      title: 'Transaction cancelled',
      message: 'Transaction cancelled in your wallet. No funds were moved.',
      suggestion: 'You can try again when you are ready.',
      canRetry: false,
    };
  }

  // Slippage issues
  if (errorLower.includes('slippage') || errorLower.includes('price moved') || errorLower.includes('insufficient output')) {
    return {
      type: 'slippage',
      title: 'Price moved too much',
      message: 'Swap failed: price moved beyond your slippage tolerance.',
      suggestion: 'Increase slippage in settings or try a smaller amount.',
      canRetry: true,
    };
  }

  // Gas/fee issues
  if (errorLower.includes('gas') || errorLower.includes('fee') || errorLower.includes('underpriced')) {
    return {
      type: 'gas',
      title: 'Gas or fee issue',
      message: 'Insufficient funds for transaction fees or gas estimation failed.',
      suggestion: 'Wait and try again, or adjust gas in your wallet.',
      canRetry: true,
    };
  }

  // Insufficient balance
  if (errorLower.includes('insufficient') || errorLower.includes('balance') || errorLower.includes('not enough')) {
    return {
      type: 'balance',
      title: 'Insufficient balance',
      message: 'Insufficient balance to complete this swap. Check your wallet balance and try a smaller amount.',
      suggestion: 'Include enough for the swap amount plus network fees.',
      canRetry: false,
    };
  }

  // Network / RPC / provider (show the real parsed message; title stays generic for grouping)
  if (
    errorLower.includes('network') ||
    errorLower.includes('timeout') ||
    errorLower.includes('connection') ||
    errorLower.includes('failed to fetch') ||
    errorLower.includes('json-rpc') ||
    errorLower.includes('rpc error') ||
    errorLower.includes('cannot connect to network') ||
    errorLower.includes('wallet provider')
  ) {
    return {
      type: 'network',
      title: 'Network or wallet RPC',
      message:
        (error && error.trim().length > 0
          ? error
          : 'Network connection lost or the wallet provider could not be reached.'),
      suggestion:
        'If you use WalletConnect, keep the session open. Try again or switch RPC in your wallet if the problem continues.',
      canRetry: true,
    };
  }

  if (
    errorLower.includes('revert') ||
    errorLower.includes('transaction was not successful') ||
    errorLower.includes('blockchain rejected')
  ) {
    return {
      type: 'unknown',
      title: 'Transaction failed on-chain',
      message: 'The transaction was included, but the swap did not succeed.',
      suggestion: 'Open the explorer for details. You may need different slippage, a smaller amount, or to retry later.',
      canRetry: true,
    };
  }

  // Unknown error
  return {
    type: 'unknown',
    title: 'Something went wrong',
    message: error || 'We could not classify this error. Your funds may be unchanged.',
    suggestion: 'If you have a transaction hash, check the explorer. Otherwise try again.',
    canRetry: true,
  };
}

// Error Content - Enhanced with categorization and helpful suggestions
function ErrorContent({
  error,
  txHash,
  explorerUrl,
  onTryAgain,
  onCancel,
}: {
  error: string | null;
  txHash?: string | null;
  explorerUrl?: string | null;
  onTryAgain: () => void;
  onCancel: () => void;
}) {
  const errorInfo = categorizeError(error);
  const explorerLink = explorerUrl ?? null;

  const getErrorIcon = () => {
    switch (errorInfo.type) {
      case 'rejection':
        return <CancelledIcon />;
      case 'slippage':
        return <SlippageErrorIcon />;
      case 'gas':
        return <GasErrorIcon />;
      case 'balance':
        return <BalanceErrorIcon />;
      default:
        return <ErrorIcon />;
    }
  };

  const getIconBg = () => {
    switch (errorInfo.type) {
      case 'rejection':
        return 'bg-yellow-900/30';
      case 'slippage':
        return 'bg-orange-900/30';
      case 'gas':
        return 'bg-purple-900/30';
      case 'balance':
        return 'bg-red-900/30';
      default:
        return 'bg-red-900/30';
    }
  };

  return (
    <div className="text-center">
      {/* Error Icon */}
      <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${getIconBg()}`}>
        {getErrorIcon()}
      </div>

      <h3 className="text-xl font-bold mb-2">
        {errorInfo.title}
      </h3>

      <p className="text-dark-300 mb-2">
        {errorInfo.message}
      </p>

      {/* Suggestion box */}
      {errorInfo.suggestion && (
        <div className="bg-dark-800 rounded-lg p-3 mb-4 text-left">
          <div className="flex items-start gap-2">
            <LightbulbIcon />
            <div>
              <div className="text-xs text-dark-400 mb-1">Suggestion</div>
              <p className="text-sm text-dark-300">{errorInfo.suggestion}</p>
            </div>
          </div>
        </div>
      )}

      {txHash && (
        <div className="bg-amber-900/15 border border-amber-800/40 rounded-lg p-3 mb-4 text-left">
          <div className="text-xs text-amber-200/90 font-medium mb-1">Check on-chain status</div>
          <p className="text-sm text-dark-300 mb-2 leading-snug">
            This hash was broadcast from your wallet. The explorer shows pending, success, or revert — not only this message.
          </p>
          <div className="font-mono text-[11px] text-dark-400 break-all mb-2">{txHash}</div>
          {explorerLink && (
            <a
              href={explorerLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-primary-400 hover:text-primary-300"
            >
              View on block explorer
              <ExternalLinkIcon />
            </a>
          )}
        </div>
      )}

      {/* Technical details (collapsible) */}
      {error && errorInfo.type === 'unknown' && (
        <details className="text-left mb-4">
          <summary className="text-xs text-dark-500 cursor-pointer hover:text-dark-400">
            Technical details
          </summary>
          <div className="mt-2 p-2 bg-dark-800 rounded text-xs font-mono text-dark-400 break-all">
            {error}
          </div>
        </details>
      )}

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onCancel} fullWidth>
          Close
        </Button>
        {errorInfo.canRetry && (
          <Button onClick={onTryAgain} fullWidth>
            Try Again
          </Button>
        )}
      </div>
    </div>
  );
}

// Detail Row Component
function DetailRow({
  label,
  value,
  variant = 'normal',
  mono = false,
  title,
}: {
  label: string;
  value: string;
  variant?: 'normal' | 'warning' | 'danger';
  mono?: boolean;
  title?: string;
}) {
  const valueClass = {
    normal: '',
    warning: 'text-yellow-400',
    danger: 'text-red-400',
  }[variant];

  return (
    <div className="flex justify-between items-center gap-2">
      <span className="text-dark-400 shrink-0">{label}</span>
      <span className={`${valueClass} ${mono ? 'font-mono' : ''} text-right`} title={title}>
        {value}
      </span>
    </div>
  );
}

/** Match SwapInterface fee tier labels for direct V3 routes */
function formatSwapFeeTierDisplay(feeTier: number): string {
  const tiers: Record<number, string> = {
    100: '0.01%',
    500: '0.05%',
    3000: '0.3%',
    10000: '1%',
  };
  return tiers[feeTier] || `${(feeTier / 10000).toFixed(2)}%`;
}

// Helper functions
function getLoadingText(step: SwapStep): string {
  switch (step) {
    case 'approving':
      return 'Confirm approval in wallet…';
    case 'swapping':
      return 'Confirm swap in wallet…';
    case 'broadcasting':
      return 'Waiting for on-chain confirmation…';
    default:
      return 'Processing…';
  }
}

// Icons
function ArrowRightIcon() {
  return (
    <svg className="w-6 h-6 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function ErrorIcon() {
  return (
    <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  );
}

function CancelledIcon() {
  return (
    <svg className="w-8 h-8 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function CheckSmallIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function SlippageErrorIcon() {
  return (
    <svg className="w-8 h-8 text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 17h8m0 0V9m0 8l-8-8-4 4-6-6" />
    </svg>
  );
}

function GasErrorIcon() {
  return (
    <svg className="w-8 h-8 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
    </svg>
  );
}

function BalanceErrorIcon() {
  return (
    <svg className="w-8 h-8 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
    </svg>
  );
}

function LightbulbIcon() {
  return (
    <svg className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
    </svg>
  );
}

export default SwapPreviewModal;
