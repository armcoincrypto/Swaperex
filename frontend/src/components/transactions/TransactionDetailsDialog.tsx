/**
 * Shared transaction details dialog (P17.5).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Modal } from '@/components/common/Modal';
import { Button } from '@/components/common/Button';
import { TransactionDetailSection } from '@/components/transactions/TransactionDetailSection';
import type { TransactionDetailModel } from '@/types/transactionDetails';
import { DIAGNOSTIC_PRIVACY_DISCLOSURE } from '@/types/transactionDetails';
import {
  presentActivityKind,
  presentActivityStatus,
  presentActivitySource,
  statusPresentationClass,
} from '@/utils/activityPresentation';
import { copyTextToClipboard, type ClipboardResult } from '@/utils/clipboard';
import { resolveAppVersionLabel } from '@/utils/appVersion';
import {
  buildSupportDiagnosticBundle,
  renderSupportDiagnosticJson,
  renderSupportDiagnosticText,
} from '@/services/supportDiagnosticService';
import { formatDetailHash } from '@/utils/transactionDetailFormatting';

interface TransactionDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  model: TransactionDetailModel | null;
  flowModels?: TransactionDetailModel[];
  walletProvider?: string;
}

export function TransactionDetailsDialog({
  isOpen,
  onClose,
  model,
  flowModels,
  walletProvider,
}: TransactionDetailsDialogProps) {
  const [copyState, setCopyState] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string>('unknown');

  useEffect(() => {
    if (!isOpen) return;
    void resolveAppVersionLabel().then(setAppVersion);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) setCopyState(null);
  }, [isOpen, model?.id]);

  const modelsToRender = useMemo(() => {
    if (flowModels && flowModels.length > 1) return flowModels;
    return model ? [model] : [];
  }, [flowModels, model]);

  const handleCopy = useCallback(async (label: string, text: string) => {
    const result: ClipboardResult = await copyTextToClipboard(text);
    setCopyState(result === 'success' ? `${label} copied` : `Could not copy ${label.toLowerCase()}`);
  }, []);

  const handleCopySupport = useCallback(async () => {
    if (!model) return;
    const bundle = buildSupportDiagnosticBundle(model, { appVersion, walletProvider });
    await handleCopy('Support details', renderSupportDiagnosticText(bundle));
  }, [appVersion, handleCopy, model, walletProvider]);

  const handleCopyJson = useCallback(async () => {
    if (!model) return;
    const bundle = buildSupportDiagnosticBundle(model, { appVersion, walletProvider });
    await handleCopy('Diagnostic JSON', renderSupportDiagnosticJson(bundle));
  }, [appVersion, handleCopy, model, walletProvider]);

  if (!model) {
    return (
      <Modal isOpen={isOpen} onClose={onClose} title="Transaction details" size="lg">
        <p className="text-sm text-dark-300">Transaction details are unavailable for this record.</p>
      </Modal>
    );
  }

  const statusLabel = presentActivityStatus(model.status);

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Transaction details"
      size="lg"
      footer={
        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="secondary" size="sm" onClick={() => void handleCopySupport()}>
            Copy support details
          </Button>
          <Button variant="secondary" size="sm" onClick={() => void handleCopyJson()}>
            Copy JSON
          </Button>
          <Button variant="primary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      }
    >
      <div className="space-y-5" data-testid="transaction-details-dialog">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-dark-100">{presentActivityKind(model.kind)}</span>
          <span className={`px-2 py-0.5 rounded text-[11px] ${statusPresentationClass(model.status)}`}>
            {statusLabel}
          </span>
          <span className="text-[11px] text-dark-500">{presentActivitySource(model.source)}</span>
        </div>

        <p className="text-sm text-dark-300 leading-snug">{model.statusExplanation}</p>

        {model.approvalOnlyFlow && (
          <p className="text-xs text-amber-200/85 bg-amber-950/20 border border-amber-900/30 rounded-lg p-2">
            Token approval confirmed. Swap transaction was not submitted in this flow.
          </p>
        )}

        {modelsToRender.length > 1 && (
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-dark-400">Swap flow</h4>
            {modelsToRender.map((flowModel, index) => (
              <div
                key={flowModel.id}
                className="rounded-lg border border-white/[0.06] bg-dark-800/50 p-3 space-y-3"
              >
                <p className="text-xs text-dark-400">
                  {index + 1}. {presentActivityKind(flowModel.kind)} — {presentActivityStatus(flowModel.status)}
                </p>
                <DetailBody model={flowModel} onCopy={handleCopy} />
              </div>
            ))}
          </div>
        )}

        {modelsToRender.length === 1 && <DetailBody model={model} onCopy={handleCopy} />}

        {model.limitations.length > 0 && (
          <TransactionDetailSection
            title="Limitations"
            fields={model.limitations.map((note) => ({
              label: 'Note',
              value: note,
            }))}
          />
        )}

        <p className="text-[11px] text-dark-500 leading-snug">{DIAGNOSTIC_PRIVACY_DISCLOSURE}</p>
        <p className="text-[11px] text-dark-600">
          Diagnostics are generated locally and copied only when you choose.
        </p>

        {copyState && (
          <p className="text-xs text-emerald-300/90" role="status" aria-live="polite">
            {copyState}
          </p>
        )}
      </div>
    </Modal>
  );
}

function DetailBody({
  model,
  onCopy,
}: {
  model: TransactionDetailModel;
  onCopy: (label: string, text: string) => Promise<void>;
}) {
  return (
    <div className="space-y-4">
      <TransactionDetailSection title="Summary" fields={model.summaryFields} />
      <TransactionDetailSection title="Transaction" fields={model.transactionFields}>
        <div className="flex flex-wrap gap-2 mt-1">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void onCopy('Transaction hash', model.transactionHash)}
          >
            Copy hash
          </Button>
          {model.walletAddress && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void onCopy('Wallet address', model.walletAddress!)}
            >
              Copy wallet
            </Button>
          )}
          {model.explorerUrl && (
            <a
              href={model.explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center px-3 py-1.5 text-xs rounded-lg border border-white/10 text-primary-300 hover:text-primary-200"
            >
              View in explorer
            </a>
          )}
        </div>
        <p className="text-[11px] text-dark-500 font-mono mt-2 break-all" title={model.transactionHash}>
          {formatDetailHash(model.transactionHash)}
        </p>
      </TransactionDetailSection>

      {model.approval && <TransactionDetailSection title="Approval" fields={model.approval.fields} />}
      {model.swap && <TransactionDetailSection title="Swap" fields={model.swap.fields} />}
      {model.transfer && <TransactionDetailSection title="Transfer" fields={model.transfer.fields} />}
      {model.receipt && <TransactionDetailSection title="Receipt" fields={model.receipt.fields} />}
      {model.reconciliation && (
        <TransactionDetailSection title="Reconciliation" fields={model.reconciliation.fields}>
          {model.reconciliation.explanation && (
            <p className="text-xs text-dark-400 leading-snug">{model.reconciliation.explanation}</p>
          )}
        </TransactionDetailSection>
      )}
      {model.error && <TransactionDetailSection title="Error" fields={model.error.fields} />}
    </div>
  );
}

export default TransactionDetailsDialog;
