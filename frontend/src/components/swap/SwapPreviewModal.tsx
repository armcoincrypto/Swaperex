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
import { formatBalance } from '@/utils/format';
import type { SwapQuote } from '@/hooks/useSwap';

// Quote expires after 30 seconds
const QUOTE_EXPIRY_SECONDS = 30;

export type SwapStep = 'preview' | 'approving' | 'swapping' | 'broadcasting' | 'success' | 'error';

interface SwapPreviewModalProps {
  isOpen: boolean;
  quote: SwapQuote | null;
  step: SwapStep;
  error: string | null;
  txHash: string | null;
  explorerUrl?: string | null;  // PHASE 9: Explorer URL from useSwap
  onConfirm: () => void;
  onCancel: () => void;
  onRefreshQuote: () => void;
  isRefreshing: boolean;
}

export function SwapPreviewModal({
  isOpen,
  quote,
  step,
  error,
  txHash,
  explorerUrl,
  onConfirm,
  onCancel,
  onRefreshQuote,
  isRefreshing,
}: SwapPreviewModalProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(QUOTE_EXPIRY_SECONDS);
  const [isExpired, setIsExpired] = useState(false);

  // Reset timer when quote changes or modal opens
  useEffect(() => {
    if (isOpen && quote) {
      setSecondsRemaining(QUOTE_EXPIRY_SECONDS);
      setIsExpired(false);
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

  if (!quote) return null;

  const priceImpact = parseFloat(quote.price_impact || '0');
  const isHighImpact = priceImpact > 3;
  const isVeryHighImpact = priceImpact > 10;
  const isLoading = step === 'approving' || step === 'swapping' || step === 'broadcasting';
  const needsApproval = quote.needsApproval;

  // Determine step number for multi-step display
  const getStepDisplay = () => {
    if (!needsApproval) {
      if (step === 'swapping') return 'Step 1/1: Confirm Swap';
      return null;
    }
    if (step === 'approving') return 'Step 1/2: Approve Token';
    if (step === 'swapping') return 'Step 2/2: Confirm Swap';
    return null;
  };

  const stepDisplay = getStepDisplay();

  return (
    <Modal
      isOpen={isOpen}
      onClose={step === 'preview' || step === 'error' ? onCancel : () => {}}
      title={step === 'success' ? 'Swap Completed' : 'Review Swap'}
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
              label="Exchange Rate"
              value={`1 ${quote.from_asset} = ${formatBalance(quote.rate)} ${quote.to_asset}`}
            />
            <DetailRow
              label="Minimum Received"
              value={`${formatBalance(quote.minimum_received)} ${quote.to_asset}`}
            />
            <DetailRow
              label="Price Impact"
              value={`${quote.price_impact}%`}
              variant={isVeryHighImpact ? 'danger' : isHighImpact ? 'warning' : 'normal'}
            />
            <DetailRow
              label="Slippage Tolerance"
              value={`${quote.slippage}%`}
            />
            <DetailRow
              label="Provider"
              value={quote.provider}
            />
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

          {/* Gas Estimate Note */}
          <div className="bg-dark-800/50 rounded-lg p-3 mb-4">
            <div className="flex justify-between text-sm">
              <span className="text-dark-400">Network Fee</span>
              <span className="text-dark-400">Estimated by wallet</span>
            </div>
          </div>

          {/* Approval Notice */}
          {needsApproval && step === 'preview' && (
            <div className="flex items-center gap-2 text-blue-400 bg-blue-900/20 rounded-lg p-3 mb-4">
              <InfoIcon />
              <span className="text-sm">
                This swap requires token approval. You'll sign two transactions.
              </span>
            </div>
          )}

          {/* Wallet Notice */}
          <div className="flex items-center gap-2 text-yellow-400 bg-yellow-900/20 rounded-lg p-3 mb-4">
            <WalletIcon />
            <span className="text-sm">
              {isLoading
                ? 'Waiting for wallet confirmation...'
                : 'Your wallet will open to confirm this transaction'}
            </span>
          </div>

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
                ? 'Quote Expired'
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
          <span className="text-sm font-medium">Quote expired</span>
        </div>
        <Button
          size="sm"
          variant="secondary"
          onClick={onRefresh}
          loading={isRefreshing}
        >
          Refresh
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
        {isRefreshing ? 'Refreshing...' : 'Refresh'}
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
  const explorerUrl = providedExplorerUrl || getExplorerUrl(1, txHash || '');
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

        {/* Receipt Details */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-dark-400">Rate</span>
            <span>1 {quote.from_asset} = {formatBalance(quote.rate)} {quote.to_asset}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-dark-400">Provider</span>
            <span className="text-primary-400">{quote.provider}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-dark-400">Slippage</span>
            <span>{quote.slippage}%</span>
          </div>
          {quote.price_impact && parseFloat(quote.price_impact) > 0 && (
            <div className="flex justify-between">
              <span className="text-dark-400">Price Impact</span>
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
                View Explorer
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

  // User rejected transaction
  if (errorLower.includes('rejected') || errorLower.includes('denied') || errorLower.includes('cancelled') || errorLower.includes('user refused')) {
    return {
      type: 'rejection',
      title: 'Transaction Cancelled',
      message: 'You cancelled the transaction in your wallet.',
      suggestion: 'No funds were moved. You can try again when ready.',
      canRetry: false,
    };
  }

  // Slippage issues
  if (errorLower.includes('slippage') || errorLower.includes('price moved') || errorLower.includes('insufficient output')) {
    return {
      type: 'slippage',
      title: 'Price Changed Too Much',
      message: 'The price moved beyond your slippage tolerance while the transaction was pending.',
      suggestion: 'Try increasing your slippage tolerance in settings, or try a smaller amount.',
      canRetry: true,
    };
  }

  // Gas/fee issues
  if (errorLower.includes('gas') || errorLower.includes('fee') || errorLower.includes('underpriced')) {
    return {
      type: 'gas',
      title: 'Gas Fee Issue',
      message: 'The transaction failed due to gas estimation or fee issues.',
      suggestion: 'Network may be congested. Wait a moment and try again, or increase gas in your wallet.',
      canRetry: true,
    };
  }

  // Insufficient balance
  if (errorLower.includes('insufficient') || errorLower.includes('balance') || errorLower.includes('not enough')) {
    return {
      type: 'balance',
      title: 'Insufficient Balance',
      message: 'You don\'t have enough tokens to complete this swap.',
      suggestion: 'Check your balance includes enough for the swap amount plus gas fees.',
      canRetry: false,
    };
  }

  // Network issues
  if (errorLower.includes('network') || errorLower.includes('timeout') || errorLower.includes('connection')) {
    return {
      type: 'network',
      title: 'Network Error',
      message: 'There was a problem connecting to the network.',
      suggestion: 'Check your internet connection and try again.',
      canRetry: true,
    };
  }

  // Unknown error
  return {
    type: 'unknown',
    title: 'Swap Failed',
    message: error || 'An unexpected error occurred.',
    suggestion: 'Please try again. If the issue persists, the token or pool may have restrictions.',
    canRetry: true,
  };
}

// Error Content - Enhanced with categorization and helpful suggestions
function ErrorContent({
  error,
  onTryAgain,
  onCancel,
}: {
  error: string | null;
  onTryAgain: () => void;
  onCancel: () => void;
}) {
  const errorInfo = categorizeError(error);

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
}: {
  label: string;
  value: string;
  variant?: 'normal' | 'warning' | 'danger';
  mono?: boolean;
}) {
  const valueClass = {
    normal: '',
    warning: 'text-yellow-400',
    danger: 'text-red-400',
  }[variant];

  return (
    <div className="flex justify-between items-center">
      <span className="text-dark-400">{label}</span>
      <span className={`${valueClass} ${mono ? 'font-mono' : ''}`}>
        {value}
      </span>
    </div>
  );
}

// Helper functions
function getLoadingText(step: SwapStep): string {
  switch (step) {
    case 'approving':
      return 'Approving...';
    case 'swapping':
      return 'Confirm in Wallet...';
    case 'broadcasting':
      return 'Broadcasting...';
    default:
      return 'Processing...';
  }
}

function getExplorerUrl(chainId: number, txHash: string): string {
  const explorers: Record<number, string> = {
    1: 'https://etherscan.io/tx/',
    56: 'https://bscscan.com/tx/',
    137: 'https://polygonscan.com/tx/',
    42161: 'https://arbiscan.io/tx/',
    10: 'https://optimistic.etherscan.io/tx/',
    43114: 'https://snowtrace.io/tx/',
  };
  return `${explorers[chainId] || 'https://etherscan.io/tx/'}${txHash}`;
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
