/**
 * P4.4-K3/K2 — Confirm-swap execution guards (pure logic + shared sentinels).
 * Keeps execution lock / status blocking observable without weakening safety.
 */

export const SWAP_EXECUTION_IN_PROGRESS = 'SWAP_EXECUTION_IN_PROGRESS';

/** Stale lock recovery only when previewing and lock age exceeds this (ms). */
export const STALE_EXECUTION_LOCK_MS = 30000;

export const CONFIRM_SWAP_IN_PROGRESS_MESSAGE =
  'A swap request is already in progress. Check your wallet or wait a few seconds.';

export type ConfirmSwapBlockReason =
  | 'execution_already_in_progress'
  | 'execution_lock_held';

const ACTIVE_EXECUTION_STATUSES = new Set([
  'approving',
  'swapping',
  'confirming',
]);

export function getConfirmSwapBlockReason(status: string): ConfirmSwapBlockReason | null {
  if (ACTIVE_EXECUTION_STATUSES.has(status)) {
    return 'execution_already_in_progress';
  }
  return null;
}

export function shouldClearStaleExecutionLock(params: {
  status: string;
  lockHeld: boolean;
  lockStartedAt: number | null;
  now: number;
  staleThresholdMs?: number;
}): boolean {
  const threshold = params.staleThresholdMs ?? STALE_EXECUTION_LOCK_MS;
  if (params.status !== 'previewing') return false;
  if (!params.lockHeld) return false;
  if (params.lockStartedAt == null) return false;
  return params.now - params.lockStartedAt > threshold;
}

export function staleExecutionLockAgeMs(
  lockStartedAt: number | null,
  now: number,
): number | null {
  if (lockStartedAt == null) return null;
  return now - lockStartedAt;
}
