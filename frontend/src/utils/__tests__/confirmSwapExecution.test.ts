import { describe, it, expect } from 'vitest';
import {
  STALE_EXECUTION_LOCK_MS,
  SWAP_EXECUTION_IN_PROGRESS,
  getConfirmSwapBlockReason,
  shouldClearStaleExecutionLock,
} from '../confirmSwapExecution';

describe('getConfirmSwapBlockReason', () => {
  it('blocks when status is approving, swapping, or confirming', () => {
    expect(getConfirmSwapBlockReason('approving')).toBe('execution_already_in_progress');
    expect(getConfirmSwapBlockReason('swapping')).toBe('execution_already_in_progress');
    expect(getConfirmSwapBlockReason('confirming')).toBe('execution_already_in_progress');
  });

  it('maps active status block to SWAP_EXECUTION_IN_PROGRESS sentinel', () => {
    const reason = getConfirmSwapBlockReason('swapping');
    expect(reason).toBe('execution_already_in_progress');
    const err = new Error(SWAP_EXECUTION_IN_PROGRESS);
    expect(err.message).toBe('SWAP_EXECUTION_IN_PROGRESS');
    expect(reason).toBeTruthy();
  });

  it('does not block previewing or idle', () => {
    expect(getConfirmSwapBlockReason('previewing')).toBeNull();
    expect(getConfirmSwapBlockReason('idle')).toBeNull();
    expect(getConfirmSwapBlockReason('fetching_quote')).toBeNull();
  });
});

describe('shouldClearStaleExecutionLock', () => {
  const now = 1_000_000;

  it('clears stale lock in previewing after threshold', () => {
    expect(
      shouldClearStaleExecutionLock({
        status: 'previewing',
        lockHeld: true,
        lockStartedAt: now - STALE_EXECUTION_LOCK_MS - 1,
        now,
      }),
    ).toBe(true);
  });

  it('does not clear fresh lock in previewing', () => {
    expect(
      shouldClearStaleExecutionLock({
        status: 'previewing',
        lockHeld: true,
        lockStartedAt: now - 5_000,
        now,
      }),
    ).toBe(false);
  });

  it('does not clear lock when status is approving/swapping/confirming', () => {
    for (const status of ['approving', 'swapping', 'confirming'] as const) {
      expect(
        shouldClearStaleExecutionLock({
          status,
          lockHeld: true,
          lockStartedAt: now - STALE_EXECUTION_LOCK_MS - 10_000,
          now,
        }),
      ).toBe(false);
    }
  });

  it('does not clear when lock not held or timestamp missing', () => {
    expect(
      shouldClearStaleExecutionLock({
        status: 'previewing',
        lockHeld: false,
        lockStartedAt: now - 60_000,
        now,
      }),
    ).toBe(false);
    expect(
      shouldClearStaleExecutionLock({
        status: 'previewing',
        lockHeld: true,
        lockStartedAt: null,
        now,
      }),
    ).toBe(false);
  });
});
