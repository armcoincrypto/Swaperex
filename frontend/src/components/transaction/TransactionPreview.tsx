/**
 * Transaction Preview Component
 *
 * Shows transaction details before user signs.
 * CRITICAL: All signing happens client-side via wallet popup.
 */

import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { formatBalance, formatUsd, shortenAddress, getChainName } from '@/utils/format';
import type { UnsignedTransaction, SwapQuote } from '@/types/api';

type TransactionType = 'swap' | 'transfer' | 'approve';

interface TransactionPreviewProps {
  isOpen: boolean;
  type: TransactionType;
  transaction: UnsignedTransaction;
  quote?: SwapQuote;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading: boolean;
}

export function TransactionPreview({
  isOpen,
  type,
  transaction,
  quote,
  onConfirm,
  onCancel,
  isLoading,
}: TransactionPreviewProps) {
  return (
    <Modal isOpen={isOpen} onClose={onCancel} title="Confirm Transaction">
      {/* Transaction Summary */}
      <div className="bg-dark-800 rounded-xl p-4 mb-4">
        <TransactionSummary type={type} quote={quote} transaction={transaction} />
      </div>

      {/* Quote Details (for swaps) */}
      {type === 'swap' && quote && (
        <div className="space-y-2 text-sm mb-4">
          <DetailRow
            label="Rate"
            value={`1 ${quote.from_asset} = ${formatBalance(quote.rate)} ${quote.to_asset}`}
          />
          <DetailRow
            label="Minimum Received"
            value={`${formatBalance(quote.minimum_received)} ${quote.to_asset}`}
          />
          <DetailRow
            label="Price Impact"
            value={`${quote.price_impact}%`}
            warning={parseFloat(quote.price_impact) > 1}
          />
          {quote.route && (
            <DetailRow label="Route" value={quote.route.join(' → ')} />
          )}
        </div>
      )}

      {/* Contract Details */}
      <div className="bg-dark-800/50 rounded-lg p-3 mb-4">
        <h4 className="text-xs text-dark-400 uppercase tracking-wide mb-2">
          Contract Interaction
        </h4>
        <div className="space-y-1 text-sm">
          <DetailRow label="Network" value={getChainName(transaction.chain_id)} />
          <DetailRow
            label="To"
            value={shortenAddress(transaction.to)}
            mono
          />
          {transaction.value && transaction.value !== '0' && (
            <DetailRow label="Value" value={`${formatBalance(transaction.value)} ETH`} />
          )}
          <DetailRow label="Gas Limit" value={transaction.gas_limit.toLocaleString()} />
        </div>
      </div>

      {/* Warning Banner */}
      <div className="flex items-center gap-2 text-yellow-400 bg-yellow-900/20 rounded-lg p-3 mb-4">
        <WalletIcon />
        <span className="text-sm">Your wallet will open to confirm this transaction</span>
      </div>

      {/* Security Notice */}
      <div className="flex items-center gap-2 text-dark-400 text-xs mb-4">
        <ShieldIcon />
        <span>Transaction signed locally in your wallet, never on our servers</span>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onCancel} fullWidth disabled={isLoading}>
          Cancel
        </Button>
        <Button onClick={onConfirm} loading={isLoading} fullWidth>
          {isLoading ? 'Waiting for Wallet...' : 'Confirm'}
        </Button>
      </div>
    </Modal>
  );
}

function TransactionSummary({
  type,
  quote,
  transaction,
}: {
  type: TransactionType;
  quote?: SwapQuote;
  transaction: UnsignedTransaction;
}) {
  if (type === 'swap' && quote) {
    return (
      <div className="text-center">
        <div className="text-sm text-dark-400 mb-1">You're swapping</div>
        <div className="flex items-center justify-center gap-3">
          <div>
            <div className="text-2xl font-bold">{formatBalance(quote.from_amount)}</div>
            <div className="text-dark-400">{quote.from_asset}</div>
          </div>
          <ArrowRightIcon />
          <div>
            <div className="text-2xl font-bold text-primary-400">
              {formatBalance(quote.to_amount)}
            </div>
            <div className="text-dark-400">{quote.to_asset}</div>
          </div>
        </div>
      </div>
    );
  }

  if (type === 'approve') {
    return (
      <div className="text-center">
        <div className="text-sm text-dark-400 mb-1">You're approving</div>
        <div className="text-2xl font-bold">Token Approval</div>
        <div className="text-dark-400">for {shortenAddress(transaction.to)}</div>
      </div>
    );
  }

  // Transfer
  return (
    <div className="text-center">
      <div className="text-sm text-dark-400 mb-1">You're sending</div>
      <div className="text-2xl font-bold">
        {formatBalance(transaction.value || '0')} ETH
      </div>
      <div className="text-dark-400">to {shortenAddress(transaction.to)}</div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  warning = false,
  mono = false,
}: {
  label: string;
  value: string;
  warning?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-dark-400">{label}</span>
      <span
        className={`${warning ? 'text-yellow-400' : ''} ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

// Icons
function ArrowRightIcon() {
  return (
    <svg className="w-6 h-6 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
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

export default TransactionPreview;
