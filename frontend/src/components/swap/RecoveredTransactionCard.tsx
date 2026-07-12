/**
 * Durable recovery card for journal-backed pending/unknown/stale transactions.
 */

import { Button } from '@/components/common/Button';
import { getChainById } from '@/config/chains';
import {
  getRecoveryStatusCopy,
  type RecoveredSwapTrace,
} from '@/utils/recoveredSwapTrace';
import { formatBalance } from '@/utils/format';

interface RecoveredTransactionCardProps {
  trace: RecoveredSwapTrace;
  onOpenDetails?: () => void;
  onManualRecheck?: () => void;
  manualRecheckDisabled?: boolean;
  isReconciling?: boolean;
  className?: string;
}

export function RecoveredTransactionCard({
  trace,
  onOpenDetails,
  onManualRecheck,
  manualRecheckDisabled = false,
  isReconciling = false,
  className = '',
}: RecoveredTransactionCardProps) {
  const copy = getRecoveryStatusCopy(trace.phase);
  const chain = getChainById(trace.chainId);
  const kindLabel = trace.kind === 'approval' ? 'Approval' : 'Swap';

  return (
    <section
      className={`rounded-xl border border-amber-800/40 bg-amber-950/20 p-4 ${className}`}
      aria-live="polite"
      aria-label={`${kindLabel} recovery status`}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs uppercase tracking-wide text-amber-300/90">{kindLabel} recovery</p>
          <h3 className="text-sm font-semibold text-white mt-1">{copy.title}</h3>
          <p className="text-xs text-dark-300 mt-1 leading-snug">{copy.description}</p>
        </div>
        {chain && (
          <span className="text-[11px] px-2 py-1 rounded-md bg-dark-800 text-dark-300 border border-white/10">
            {chain.name}
          </span>
        )}
      </div>

      <div className="mt-3 text-sm text-white">
        {trace.kind === 'swap' ? (
          <p>
            {formatBalance(trace.fromAmount)} {trace.fromSymbol}
            <span className="text-dark-500 mx-2">→</span>
            {formatBalance(trace.toAmount)} {trace.toSymbol}
          </p>
        ) : (
          <p>
            {formatBalance(trace.fromAmount)} {trace.fromSymbol}
            <span className="text-dark-500 ml-2">(approval)</span>
          </p>
        )}
      </div>

      <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-dark-400">
        <div>
          <dt className="text-dark-500">Submitted</dt>
          <dd>{new Date(trace.submittedAt).toLocaleString()}</dd>
        </div>
        {trace.lastCheckedAt && (
          <div>
            <dt className="text-dark-500">Last checked</dt>
            <dd>{new Date(trace.lastCheckedAt).toLocaleString()}</dd>
          </div>
        )}
      </dl>

      {trace.explorerUrl && (
        <a
          href={trace.explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-sm text-primary-400 hover:text-primary-300 mt-3"
        >
          View on block explorer
        </a>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {onManualRecheck && (
          <Button
            variant="secondary"
            size="sm"
            onClick={onManualRecheck}
            disabled={manualRecheckDisabled || isReconciling}
            aria-busy={isReconciling}
          >
            {isReconciling ? 'Checking status…' : 'Check status again'}
          </Button>
        )}
        {onOpenDetails && (
          <Button variant="secondary" size="sm" onClick={onOpenDetails}>
            View details
          </Button>
        )}
      </div>
    </section>
  );
}
