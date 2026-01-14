/**
 * Read-Only Mode Guard Hook
 *
 * PHASE 14: Global safety switch for production hardening.
 *
 * Provides consistent logic for:
 * - Blocking swaps when wallet not connected
 * - Blocking swaps when on wrong chain
 * - Allowing portfolio/tx history in read-only scenarios
 *
 * SECURITY: Prevents broken UX and unexpected behavior.
 */

import { useMemo } from 'react';
import { useWallet } from './useWallet';

export type ReadOnlyReason =
  | 'not_connected'
  | 'wrong_chain'
  | 'read_only_mode'
  | null;

export interface ReadOnlyGuardResult {
  /**
   * Whether write operations (swaps) are blocked
   */
  isBlocked: boolean;

  /**
   * Reason for blocking, null if not blocked
   */
  reason: ReadOnlyReason;

  /**
   * User-friendly message explaining why blocked
   */
  message: string | null;

  /**
   * Whether portfolio viewing is allowed
   */
  canViewPortfolio: boolean;

  /**
   * Whether transaction history is allowed
   */
  canViewTxHistory: boolean;

  /**
   * Whether swapping is allowed
   */
  canSwap: boolean;

  /**
   * Whether withdrawals are allowed
   */
  canWithdraw: boolean;

  /**
   * Action to resolve the block (connect/switch chain)
   */
  actionLabel: string | null;
}

/**
 * Messages for each block reason
 */
const BLOCK_MESSAGES: Record<Exclude<ReadOnlyReason, null>, string> = {
  not_connected: 'Connect your wallet to swap tokens',
  wrong_chain: 'Switch to a supported network to swap',
  read_only_mode: 'Exit view-only mode to swap tokens',
};

/**
 * Action labels for each block reason
 */
const ACTION_LABELS: Record<Exclude<ReadOnlyReason, null>, string> = {
  not_connected: 'Connect Wallet',
  wrong_chain: 'Switch Network',
  read_only_mode: 'Connect Wallet',
};

export function useReadOnlyGuard(): ReadOnlyGuardResult {
  const {
    isConnected,
    isWrongChain,
    isReadOnly,
  } = useWallet();

  return useMemo(() => {
    // Case 1: Not connected - portfolio works, swaps blocked
    if (!isConnected) {
      return {
        isBlocked: true,
        reason: 'not_connected',
        message: BLOCK_MESSAGES.not_connected,
        canViewPortfolio: false, // Need address to view portfolio
        canViewTxHistory: false, // Need address to view history
        canSwap: false,
        canWithdraw: false,
        actionLabel: ACTION_LABELS.not_connected,
      };
    }

    // Case 2: Read-only mode - portfolio works, swaps blocked
    if (isReadOnly) {
      return {
        isBlocked: true,
        reason: 'read_only_mode',
        message: BLOCK_MESSAGES.read_only_mode,
        canViewPortfolio: true,
        canViewTxHistory: true,
        canSwap: false,
        canWithdraw: false,
        actionLabel: ACTION_LABELS.read_only_mode,
      };
    }

    // Case 3: Wrong chain - portfolio works, swaps blocked with explanation
    if (isWrongChain) {
      return {
        isBlocked: true,
        reason: 'wrong_chain',
        message: BLOCK_MESSAGES.wrong_chain,
        canViewPortfolio: true,
        canViewTxHistory: true,
        canSwap: false,
        canWithdraw: false,
        actionLabel: ACTION_LABELS.wrong_chain,
      };
    }

    // Case 4: All clear - everything allowed
    return {
      isBlocked: false,
      reason: null,
      message: null,
      canViewPortfolio: true,
      canViewTxHistory: true,
      canSwap: true,
      canWithdraw: true,
      actionLabel: null,
    };
  }, [isConnected, isWrongChain, isReadOnly]);
}

/**
 * Hook to check if a specific action is allowed
 */
export function useCanPerformAction(action: 'swap' | 'withdraw' | 'portfolio' | 'txHistory'): boolean {
  const guard = useReadOnlyGuard();

  switch (action) {
    case 'swap':
      return guard.canSwap;
    case 'withdraw':
      return guard.canWithdraw;
    case 'portfolio':
      return guard.canViewPortfolio;
    case 'txHistory':
      return guard.canViewTxHistory;
    default:
      return false;
  }
}

export default useReadOnlyGuard;
