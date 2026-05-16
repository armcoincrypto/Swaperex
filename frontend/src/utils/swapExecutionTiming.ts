/**
 * P4.4-K2 — Confirm-swap execution timing (observability only; never throws).
 */

import { logProductionEvent } from '@/utils/productionMonitoring';
import { swapObsLog, type SwapObsValue } from '@/utils/swapObservability';
import type { AggregatedQuote } from '@/services/quoteAggregator';

const V3_GAS_HINT_MIN = 300_000;
const V3_GAS_HINT_MAX = 600_000;
const V3_GAS_HINT_PAD = 1.15;

let timingT0Ms: number | null = null;

export type SwapExecutionTimingStage =
  | 'swap_click_received'
  | 'preflight_started'
  | 'approval_prompt_requested'
  | 'swap_prompt_requested'
  | 'tx_submitted'
  | 'post_submit_refresh_started'
  | 'post_submit_refresh_finished';

function emitSwapExecutionTimingStage(
  stage: SwapExecutionTimingStage,
  fields: Record<string, SwapObsValue> = {},
): void {
  try {
    const now = Date.now();
    const durationMs = timingT0Ms != null ? now - timingT0Ms : null;
    const payload: Record<string, SwapObsValue> = { durationMs, ...fields };
    swapObsLog(stage, payload);
    logProductionEvent('swap_execution_timing', {
      stage,
      durationMs,
      ...fields,
    });
  } catch {
    // Never break swap flow on logging
  }
}

/** Start wall-clock for confirm → wallet → submit (reset per confirm click). */
export function beginSwapExecutionTiming(fields: Record<string, SwapObsValue> = {}): void {
  timingT0Ms = Date.now();
  emitSwapExecutionTimingStage('swap_click_received', fields);
}

export function markSwapExecutionTiming(
  stage: SwapExecutionTimingStage,
  fields: Record<string, SwapObsValue> = {},
): void {
  emitSwapExecutionTimingStage(stage, fields);
}

export function clearSwapExecutionTiming(): void {
  timingT0Ms = null;
}

/**
 * P4.4-K2 — V3-only gas hint from quoted providerDetails.gas (wallet may still simulate/adjust).
 */
export function resolveUniswapWrapperV3GasLimitHint(
  aggregatedQuote: AggregatedQuote | undefined,
): bigint | undefined {
  const raw = aggregatedQuote?.providerDetails?.gas;
  if (raw == null) return undefined;
  const gas = typeof raw === 'number' ? raw : Number.parseInt(String(raw), 10);
  if (!Number.isFinite(gas) || gas <= 0) return undefined;
  const padded = Math.floor(gas * V3_GAS_HINT_PAD);
  const capped = Math.min(V3_GAS_HINT_MAX, Math.max(V3_GAS_HINT_MIN, padded));
  return BigInt(capped);
}

export { V3_GAS_HINT_MIN, V3_GAS_HINT_MAX };
