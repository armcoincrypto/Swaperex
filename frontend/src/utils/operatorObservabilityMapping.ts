/**
 * P17.7 — Operator terminology and status mapping (read-only reference).
 *
 * Client receipt reconciliation ≠ admin revenue/commission reconciliation.
 */

import type { JournalTransactionStatus } from '@/types/transactionJournal';

export const CLIENT_RECEIPT_RECONCILIATION_LABEL = 'Client receipt reconciliation';
export const ADMIN_REVENUE_RECONCILIATION_LABEL = 'Revenue / commission reconciliation';

export type OperatorJournalStatus = JournalTransactionStatus;

export interface OperatorStatusMappingRow {
  journalStatus: OperatorJournalStatus;
  userMeaning: string;
  telemetryStages: string[];
  adminLifecyclePhases: string[];
  supportDiagnosticFields: string[];
}

export const OPERATOR_JOURNAL_STATUS_MATRIX: OperatorStatusMappingRow[] = [
  {
    journalStatus: 'submitted',
    userMeaning: 'Hash received; no final receipt yet',
    telemetryStages: ['tx_broadcasted', 'swap_signed'],
    adminLifecyclePhases: ['tx_broadcast'],
    supportDiagnosticFields: ['journalStatus', 'correlationId', 'transactionHash', 'lastCheckedAt'],
  },
  {
    journalStatus: 'pending',
    userMeaning: 'Awaiting on-chain inclusion or receipt',
    telemetryStages: ['tx_broadcasted', 'swap_pending'],
    adminLifecyclePhases: ['tx_broadcast', 'wallet_prompt'],
    supportDiagnosticFields: ['journalStatus', 'correlationId', 'reconciliationState', 'transactionHash'],
  },
  {
    journalStatus: 'confirmed',
    userMeaning: 'Successful receipt found',
    telemetryStages: ['tx_mined', 'receipt_decoded', 'reconciliation_completed'],
    adminLifecyclePhases: ['tx_confirmed', 'swap_success'],
    supportDiagnosticFields: ['journalStatus', 'correlationId', 'receiptStatus', 'transactionHash'],
  },
  {
    journalStatus: 'reverted',
    userMeaning: 'Unsuccessful receipt on-chain',
    telemetryStages: ['tx_mined', 'swap_failed'],
    adminLifecyclePhases: ['tx_confirmed', 'swap_failed'],
    supportDiagnosticFields: ['journalStatus', 'correlationId', 'errorCategory', 'receiptStatus'],
  },
  {
    journalStatus: 'unknown',
    userMeaning: 'Receipt lookup inconclusive',
    telemetryStages: ['swap_failed'],
    adminLifecyclePhases: ['unknown_end_state'],
    supportDiagnosticFields: ['journalStatus', 'correlationId', 'reconciliationState', 'errorCategory'],
  },
  {
    journalStatus: 'stale',
    userMeaning: 'No final receipt after resolution window',
    telemetryStages: [],
    adminLifecyclePhases: ['unknown_end_state'],
    supportDiagnosticFields: ['journalStatus', 'correlationId', 'reconciliationAttempts', 'reconciliationState'],
  },
];

export const OBSERVABILITY_OWNERSHIP = {
  deviceTransactionTruth: 'transactionJournalStore + transactionReconciliationCoordinator',
  receiptReconciliation: 'transactionReconciliation.ts + applyReconciliationToJournal.ts',
  errorSemantics: 'swaperexErrorClassification.ts (P17.6)',
  sessionTelemetry: 'productionMonitoring.ts + swapLifecycleTelemetry.ts',
  correlationId: 'transactionCorrelation.ts (journal flowId)',
  supportHandoff: 'supportDiagnosticService.ts',
  adminLifecycleView: 'swap_lifecycle_reconstruction.py + /admin lifecycle APIs',
  adminRevenueReconciliation: 'admin health domain reconciliation (monitoring ingest)',
  environmentHealth: 'scripts/ops/p13-production-status.mjs',
} as const;

export function adminHealthDomainLabel(domainKey: string): string {
  if (domainKey === 'reconciliation') {
    return ADMIN_REVENUE_RECONCILIATION_LABEL;
  }
  return domainKey.replace(/_/g, ' ');
}
