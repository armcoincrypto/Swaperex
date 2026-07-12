/**
 * P17.7 — Canonical transaction correlation identifier.
 *
 * One ID links journal records, swap_lifecycle telemetry, and support diagnostics.
 * Journal field: flowId. Telemetry legacy alias: swapFlowId (same value).
 */

import { createFlowId } from '@/utils/transactionJournalIdentity';

/** Canonical correlation field (journal + diagnostics). */
export const TRANSACTION_CORRELATION_FIELD = 'flowId' as const;

/** Legacy telemetry field — same value as flowId for backward compatibility. */
export const TELEMETRY_CORRELATION_ALIAS_FIELD = 'swapFlowId' as const;

export function createTransactionCorrelationId(): string {
  return createFlowId();
}

/** Wire payload fields for swap_lifecycle monitoring events. */
export function lifecycleCorrelationWireFields(
  correlationId: string,
): { flowId: string; swapFlowId: string } {
  return {
    flowId: correlationId,
    swapFlowId: correlationId,
  };
}
