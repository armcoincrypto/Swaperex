/**
 * P3.3 swap flow correlation — best-effort observability only.
 * Never throws; does not gate swap execution.
 */

import { logProductionEvent } from '@/utils/productionMonitoring';

export type SwapLifecycleTelemetryPayload = {
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

export function newSwapFlowId(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
      return crypto.randomUUID();
    }
  } catch {
    // ignore
  }
  return `swap-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emitSwapLifecycleStage(payload: SwapLifecycleTelemetryPayload): void {
  try {
    const { swapFlowId, stage, ...rest } = payload;
    logProductionEvent('swap_lifecycle', { swapFlowId, stage, ...rest });
  } catch {
    // ignore
  }
}
