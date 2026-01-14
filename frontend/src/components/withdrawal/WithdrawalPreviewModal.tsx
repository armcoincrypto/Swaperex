/**
 * Withdrawal Preview Modal
 *
 * Shows complete withdrawal details before user signs.
 * Handles approval + send flow for ERC-20 tokens.
 *
 * SECURITY: All signing happens client-side via wallet.
 * Swaperex only prepares unsigned transactions.
 */

import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { formatBalance, shortenAddress, getChainName } from '@/utils/format';
import type { WithdrawalResponse } from '@/types/api';
import type { WithdrawalStatus } from '@/hooks/useWithdrawal';

export type WithdrawalStep = 'preview' | 'approving' | 'signing' | 'broadcasting' | 'success' | 'error';

interface WithdrawalPreviewModalProps {
  isOpen: boolean;
  template: WithdrawalResponse | null;
  status: WithdrawalStatus;
  error: string | null;
  txHash: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function WithdrawalPreviewModal({
  isOpen,
  template,
  status,
  error,
  txHash,
  onConfirm,
  onCancel,
}: WithdrawalPreviewModalProps) {
  if (!template) return null;

  const isLoading = status === 'approving' || status === 'signing' || status === 'broadcasting';
  const isSuccess = status === 'success';
  const isError = status === 'error';
  const needsApproval = template.is_token_transfer;

  // Get step display text
  const getStepDisplay = () => {
    if (!needsApproval) {
      if (status === 'signing') return 'Confirm Withdrawal';
      return null;
    }
    if (status === 'approving') return 'Step 1/2: Approve Token';
    if (status === 'signing') return 'Step 2/2: Send Withdrawal';
    return null;
  };

  const stepDisplay = getStepDisplay();

  return (
    <Modal
      isOpen={isOpen}
      onClose={status === 'previewing' || status === 'error' ? onCancel : () => {}}
      title={isSuccess ? 'Withdrawal Sent' : 'Review Withdrawal'}
      size="md"
    >
      {/* Success State */}
      {isSuccess && (
        <SuccessContent
          template={template}
          txHash={txHash}
          onClose={onCancel}
        />
      )}

      {/* Error State */}
      {isError && (
        <ErrorContent
          error={error}
          onTryAgain={onConfirm}
          onCancel={onCancel}
        />
      )}

      {/* Preview / Loading States */}
      {!isSuccess && !isError && (
        <>
          {/* Withdrawal Summary */}
          <div className="bg-dark-800 rounded-xl p-4 mb-4">
            <WithdrawalSummary template={template} />
          </div>

          {/* Step Progress */}
          {stepDisplay && (
            <div className="bg-primary-900/20 text-primary-400 rounded-lg px-3 py-2 mb-4 text-sm font-medium">
              {stepDisplay}
            </div>
          )}

          {/* Destination Address */}
          <div className="bg-dark-800/50 rounded-lg p-3 mb-4">
            <h4 className="text-xs text-dark-400 uppercase tracking-wide mb-2">
              Destination
            </h4>
            <div className="flex items-center justify-between">
              <code className="text-sm font-mono break-all">{template.destination}</code>
              <button
                onClick={() => navigator.clipboard.writeText(template.destination)}
                className="ml-2 p-1.5 rounded hover:bg-dark-700 text-dark-400 hover:text-white flex-shrink-0"
              >
                <CopyIcon />
              </button>
            </div>
          </div>

          {/* Fee Details */}
          {template.fee_estimate && (
            <div className="bg-dark-800/50 rounded-lg p-3 mb-4">
              <h4 className="text-xs text-dark-400 uppercase tracking-wide mb-2">
                Network Fee
              </h4>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-dark-400">Fee</span>
                  <div className="text-right">
                    <div>{formatBalance(template.fee_estimate.network_fee)} {template.fee_estimate.network_fee_asset}</div>
                    {template.fee_estimate.network_fee_usd && (
                      <div className="text-dark-400 text-xs">≈ ${template.fee_estimate.network_fee_usd}</div>
                    )}
                  </div>
                </div>
                {template.net_amount && (
                  <div className="flex justify-between pt-2 border-t border-dark-700">
                    <span className="text-dark-400">You'll receive</span>
                    <span className="font-medium">{formatBalance(template.net_amount)} {template.asset}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Transaction Details */}
          {template.transaction && (
            <div className="bg-dark-800/50 rounded-lg p-3 mb-4">
              <h4 className="text-xs text-dark-400 uppercase tracking-wide mb-2">
                Transaction Details
              </h4>
              <div className="space-y-1 text-sm">
                <DetailRow label="Network" value={getChainName(template.transaction.chain_id)} />
                <DetailRow label="Type" value={template.is_token_transfer ? 'Token Transfer' : 'Native Transfer'} />
                {template.token_contract && (
                  <DetailRow label="Token Contract" value={shortenAddress(template.token_contract)} mono />
                )}
              </div>
            </div>
          )}

          {/* Warnings from backend */}
          {template.transaction?.warnings && template.transaction.warnings.length > 0 && (
            <div className="flex flex-col gap-2 mb-4">
              {template.transaction.warnings.map((warning, i) => (
                <div key={i} className="flex items-center gap-2 text-yellow-400 bg-yellow-900/20 rounded-lg p-3">
                  <WarningIcon />
                  <span className="text-sm">{warning}</span>
                </div>
              ))}
            </div>
          )}

          {/* Approval Notice */}
          {needsApproval && status === 'previewing' && (
            <div className="flex items-center gap-2 text-blue-400 bg-blue-900/20 rounded-lg p-3 mb-4">
              <InfoIcon />
              <span className="text-sm">
                Token transfers may require approval. You may sign two transactions.
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

          {/* Address Verification Warning */}
          <div className="flex items-center gap-2 text-dark-400 text-xs mb-4">
            <EyeIcon />
            <span>Always verify the destination address before confirming</span>
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
              disabled={isLoading}
              fullWidth
            >
              {isLoading
                ? getLoadingText(status)
                : 'Confirm Withdrawal'}
            </Button>
          </div>
        </>
      )}
    </Modal>
  );
}

// Withdrawal Summary Component
function WithdrawalSummary({ template }: { template: WithdrawalResponse }) {
  return (
    <div className="text-center">
      <div className="text-sm text-dark-400 mb-2">You're sending</div>
      <div className="flex items-center justify-center gap-3">
        <div className="w-12 h-12 rounded-full bg-dark-700 flex items-center justify-center">
          <span className="text-xl font-bold">{template.asset[0]}</span>
        </div>
        <div className="text-left">
          <div className="text-2xl font-bold">{formatBalance(template.amount)}</div>
          <div className="text-dark-400">{template.asset}</div>
        </div>
      </div>
      <div className="flex items-center justify-center gap-2 mt-3 text-dark-400">
        <ArrowDownIcon />
        <span className="text-sm">to {shortenAddress(template.destination)}</span>
      </div>
    </div>
  );
}

// Success Content
function SuccessContent({
  template,
  txHash,
  onClose,
}: {
  template: WithdrawalResponse;
  txHash: string | null;
  onClose: () => void;
}) {
  const chainId = template.transaction?.chain_id || 1;
  const explorerUrl = getExplorerUrl(chainId, txHash || '');

  return (
    <div className="text-center">
      {/* Success Icon */}
      <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-900/30 flex items-center justify-center">
        <CheckIcon />
      </div>

      <h3 className="text-xl font-bold mb-2">Withdrawal Sent!</h3>

      <div className="bg-dark-800 rounded-xl p-4 mb-4">
        <div className="text-lg font-bold">{formatBalance(template.amount)} {template.asset}</div>
        <div className="text-dark-400 text-sm">to {shortenAddress(template.destination)}</div>
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
        {isUserRejection ? 'Transaction Cancelled' : 'Withdrawal Failed'}
      </h3>

      <p className="text-dark-400 mb-4">
        {isUserRejection
          ? 'You cancelled the transaction in your wallet.'
          : error || 'An error occurred while processing your withdrawal.'}
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
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-dark-400">{label}</span>
      <span className={mono ? 'font-mono' : ''}>
        {value}
      </span>
    </div>
  );
}

// Helper functions
function getLoadingText(status: WithdrawalStatus): string {
  switch (status) {
    case 'approving':
      return 'Approving...';
    case 'signing':
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
function ArrowDownIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
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

function EyeIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
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

export default WithdrawalPreviewModal;
