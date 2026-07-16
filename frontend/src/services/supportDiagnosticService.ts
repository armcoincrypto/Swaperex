/**
 * P17.5 — Allowlist-only support diagnostic builder.
 */

import type { SupportDiagnosticBundle, TransactionDetailModel } from '@/types/transactionDetails';
import { SUPPORT_DIAGNOSTIC_SCHEMA_VERSION } from '@/types/transactionDetails';
import { presentActivityKind, presentActivityStatus } from '@/utils/activityPresentation';
import { getEmbeddedAppVersion } from '@/utils/appVersion';
import { boundString, getBoundedClientMetadata } from '@/utils/transactionDetailFormatting';

const MAX_SUPPORT_LINES = 40;

function pickApprovalSwapHashes(model: TransactionDetailModel): {
  approvalHash?: string;
  swapHash?: string;
} {
  const related = model.relatedTransactions ?? [];
  const approvalHash =
    model.kind === 'approval'
      ? model.transactionHash
      : related.find((r) => r.kind === 'approval')?.transactionHash;
  const swapHash =
    model.kind === 'swap'
      ? model.transactionHash
      : related.find((r) => r.kind === 'swap')?.transactionHash;
  return { approvalHash, swapHash };
}

export function buildSupportDiagnosticBundle(
  model: TransactionDetailModel,
  options?: {
    appVersion?: string;
    walletProvider?: string;
  },
): SupportDiagnosticBundle {
  const { approvalHash, swapHash } = pickApprovalSwapHashes(model);
  const tokenPair =
    model.swap
      ? `${model.swap.fromToken} → ${model.swap.toToken}`
      : model.approval
        ? model.approval.token
        : model.transfer
          ? model.transfer.token
          : undefined;

  const reconciliationState =
    model.reconciliation?.lastResult ??
    model.reconciliation?.providerErrorCategory ??
    (model.reconciliation?.attempts !== undefined ? `attempts:${model.reconciliation.attempts}` : undefined);

  const bundle: SupportDiagnosticBundle = {
    schemaVersion: SUPPORT_DIAGNOSTIC_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    appVersion: options?.appVersion ?? getEmbeddedAppVersion(),
    recordId: model.journalRecordId,
    flowId: model.flowId,
    correlationId: model.flowId,
    source: model.source,
    kind: model.kind,
    status: model.status,
    journalStatus: model.source === 'journal' ? model.status : undefined,
    walletAddressMasked: model.walletAddressMasked,
    chainId: model.chainId,
    chainName: model.chainName,
    transactionHash: model.transactionHash,
    approvalHash,
    swapHash,
    tokenPair,
    inputAmount: model.swap?.inputAmount ?? model.transfer?.amount,
    expectedOutput: model.swap?.expectedOutput,
    provider: model.swap?.provider,
    submittedAt: model.submittedAt,
    lastCheckedAt: model.lastCheckedAt,
    confirmedAt: model.confirmedAt,
    receiptStatus:
      model.receipt?.result === 'Success'
        ? 1
        : model.receipt?.result === 'Failed'
          ? 0
          : undefined,
    blockNumber: model.blockNumber,
    errorCategory: model.error?.category,
    errorStage: model.error?.stage,
    broadcastKnown: model.error?.broadcastKnown,
    retryable: model.error?.retryable,
    reconciliationAttempts: model.reconciliation?.attempts,
    reconciliationLastResult: boundString(model.reconciliation?.lastResult, 120),
    reconciliationState: boundString(reconciliationState, 120),
    browser: getBoundedClientMetadata().browser,
    walletProvider: options?.walletProvider,
    explorerUrl: model.explorerUrl,
    limitations: [...model.limitations],
  };

  return bundle;
}

export function renderSupportDiagnosticText(bundle: SupportDiagnosticBundle): string {
  const lines: string[] = [
    'Kobbex transaction diagnostic',
    `Version: ${bundle.appVersion ?? 'unknown'}`,
    `Type: ${presentActivityKind(bundle.kind as TransactionDetailModel['kind'])}`,
    `Status: ${presentActivityStatus(bundle.status as TransactionDetailModel['status'])}`,
    `Chain: ${bundle.chainName}`,
    `Transaction: ${bundle.transactionHash}`,
  ];

  if (bundle.correlationId) lines.push(`Correlation: ${bundle.correlationId}`);
  if (bundle.flowId && bundle.flowId !== bundle.correlationId) {
    lines.push(`Flow: ${bundle.flowId}`);
  }
  if (bundle.journalStatus) lines.push(`Journal status: ${presentActivityStatus(bundle.journalStatus as TransactionDetailModel['status'])}`);
  if (bundle.submittedAt) lines.push(`Submitted: ${bundle.submittedAt}`);
  if (bundle.lastCheckedAt) lines.push(`Last checked: ${bundle.lastCheckedAt}`);
  if (bundle.tokenPair) lines.push(`Pair: ${bundle.tokenPair}`);
  if (bundle.inputAmount) lines.push(`Input: ${bundle.inputAmount}`);
  if (bundle.expectedOutput) lines.push(`Expected output: ${bundle.expectedOutput}`);
  if (bundle.provider) lines.push(`Provider: ${bundle.provider}`);
  if (bundle.approvalHash && bundle.approvalHash !== bundle.transactionHash) {
    lines.push(`Approval hash: ${bundle.approvalHash}`);
  }
  if (bundle.swapHash && bundle.swapHash !== bundle.transactionHash) {
    lines.push(`Swap hash: ${bundle.swapHash}`);
  }
  if (bundle.errorCategory) lines.push(`Error category: ${bundle.errorCategory}`);
  if (bundle.errorStage) lines.push(`Error stage: ${bundle.errorStage}`);
  if (bundle.reconciliationState) lines.push(`Reconciliation: ${bundle.reconciliationState}`);
  if (bundle.explorerUrl) lines.push(`Explorer: ${bundle.explorerUrl}`);
  if (bundle.browser) lines.push(`Browser: ${bundle.browser}`);
  if (bundle.walletProvider) lines.push(`Wallet: ${bundle.walletProvider}`);

  if (bundle.limitations.length > 0) {
    lines.push('Notes:');
    for (const note of bundle.limitations.slice(0, 8)) {
      lines.push(`- ${boundString(note, 200)}`);
    }
  }

  return lines.slice(0, MAX_SUPPORT_LINES).join('\n');
}

export function renderSupportDiagnosticJson(bundle: SupportDiagnosticBundle): string {
  return JSON.stringify(bundle, null, 2);
}

/** Adversarial-safe: only allowlisted keys from a constructed bundle. */
export function assertDiagnosticAllowlist(bundle: SupportDiagnosticBundle): SupportDiagnosticBundle {
  const allowed: SupportDiagnosticBundle = {
    schemaVersion: SUPPORT_DIAGNOSTIC_SCHEMA_VERSION,
    generatedAt: bundle.generatedAt,
    source: String(bundle.source),
    kind: String(bundle.kind),
    status: String(bundle.status),
    chainId: Number(bundle.chainId),
    chainName: String(bundle.chainName),
    transactionHash: String(bundle.transactionHash),
    limitations: Array.isArray(bundle.limitations)
      ? bundle.limitations.map((l) => boundString(String(l), 200) ?? '').filter(Boolean)
      : [],
  };

  const optionalKeys = [
    'appVersion',
    'recordId',
    'flowId',
    'correlationId',
    'journalStatus',
    'walletAddressMasked',
    'approvalHash',
    'swapHash',
    'tokenPair',
    'inputAmount',
    'expectedOutput',
    'provider',
    'submittedAt',
    'lastCheckedAt',
    'confirmedAt',
    'receiptStatus',
    'blockNumber',
    'errorCategory',
    'errorStage',
    'broadcastKnown',
    'retryable',
    'reconciliationAttempts',
    'reconciliationLastResult',
    'reconciliationState',
    'browser',
    'walletProvider',
    'explorerUrl',
  ] as const;

  for (const key of optionalKeys) {
    const value = bundle[key];
    if (value === undefined || value === null) continue;
    if (typeof value === 'boolean' || typeof value === 'number') {
      (allowed as unknown as Record<string, unknown>)[key] = value;
    } else {
      (allowed as unknown as Record<string, unknown>)[key] = boundString(String(value), 500);
    }
  }

  return allowed;
}
