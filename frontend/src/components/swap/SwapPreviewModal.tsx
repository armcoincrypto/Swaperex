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

// Success Content
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
  // PHASE 9: Use provided explorer URL or fallback to Ethereum mainnet
  const explorerUrl = providedExplorerUrl || getExplorerUrl(1, txHash || '');

  return (
    <div className="text-center">
      {/* Success Icon */}
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-900/30 flex items-center justify-center">
        <CheckIcon />
      </div>

      <h3 className="text-xl font-bold mb-2">Swap Completed!</h3>

      <div className="bg-dark-800 rounded-xl p-4 mb-4">
        <div className="flex items-center justify-center gap-3">
          <div>
            <div className="text-lg font-bold">{formatBalance(quote.from_amount)}</div>
            <div className="text-dark-400 text-sm">{quote.from_asset}</div>
          </div>
          <ArrowRightIcon />
          <div>
            <div className="text-lg font-bold text-green-400">{formatBalance(quote.to_amount)}</div>
            <div className="text-dark-400 text-sm">{quote.to_asset}</div>
          </div>
        </div>
      </div>

      {txHash && (
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300 mb-4"
        >
          View on Explorer
          <ExternalLinkIcon />
        </a>
      )}

      <Button onClick={onClose} fullWidth>
        Done
      </Button>
    </div>
  );
}

// Error Content
function ErrorContent({
  error,
  onTryAgain,
  onCancel,
}: {
  error: string | null;
  onTryAgain: () => void;
  onCancel: () => void;
}) {
  const isUserRejection = error?.toLowerCase().includes('rejected') ||
                          error?.toLowerCase().includes('denied') ||
                          error?.toLowerCase().includes('cancelled');

  return (
    <div className="text-center">
      {/* Error Icon */}
      <div className={`w-16 h-16 mx-auto mb-4 rounded-full flex items-center justify-center ${
        isUserRejection ? 'bg-yellow-900/30' : 'bg-red-900/30'
      }`}>
        {isUserRejection ? <CancelledIcon /> : <ErrorIcon />}
      </div>

      <h3 className="text-xl font-bold mb-2">
        {isUserRejection ? 'Transaction Cancelled' : 'Swap Failed'}
      </h3>

      <p className="text-dark-400 mb-4">
        {isUserRejection
          ? 'You cancelled the transaction in your wallet.'
          : error || 'An error occurred while processing your swap.'}
      </p>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={onCancel} fullWidth>
          Close
        </Button>
        {!isUserRejection && (
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

export default SwapPreviewModal;
