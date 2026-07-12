/**
 * P3.3 swap flow correlation — best-effort observability only.
 * Never throws; does not gate swap execution.
 */

import { logProductionEvent } from '@/utils/productionMonitoring';
import {
  createTransactionCorrelationId,
  lifecycleCorrelationWireFields,
} from '@/utils/transactionCorrelation';

export type SwapLifecycleTelemetryPayload = {
  /** Canonical correlation id (same as journal flowId). */
  swapFlowId: string;
  stage: string;
  chainId?: number;
  provider?: string | null;
  routeMode?: string | null;
  quoteFingerprint?: string;
  txHash?: string | null;
  reason?: string | null;
  priorStage?: string;
};

/** @deprecated Use createTransactionCorrelationId from transactionCorrelation — same format. */
export function newSwapFlowId(): string {
  return createTransactionCorrelationId();
}

export function emitSwapLifecycleStage(payload: SwapLifecycleTelemetryPayload): void {
  try {
    const { swapFlowId, stage, ...rest } = payload;
    const correlation = lifecycleCorrelationWireFields(swapFlowId);
    logProductionEvent('swap_lifecycle', { ...correlation, stage, ...rest });
  } catch {
    // ignore
  }
}
