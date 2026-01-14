/**
 * Wallet Event Handler Hook
 *
 * PHASE 14: Handles wallet events (disconnect, chain change, account change)
 * and cancels active operations safely.
 *
 * Usage:
 * const { isCancelled } = useWalletEventHandler({
 *   onCancel: () => { reset(); },
 *   enabled: status !== 'idle',
 * });
 */

import { useEffect, useRef, useCallback } from 'react';
import { walletEvents, getWalletEventMessage, type WalletEvent } from '@/services/walletEvents';
import { globalError } from '@/stores/errorStore';
import { toast } from '@/stores/toastStore';

interface WalletEventHandlerOptions {
  /**
   * Called when wallet event requires cancellation
   */
  onCancel?: (event: WalletEvent) => void;

  /**
   * Only listen when enabled (e.g., when operation is in progress)
   */
  enabled?: boolean;

  /**
   * Show toast notification on cancel
   */
  showToast?: boolean;

  /**
   * Source for error tracking
   */
  source?: 'swap' | 'quote' | 'portfolio' | 'txHistory';
}

export function useWalletEventHandler(options: WalletEventHandlerOptions = {}) {
  const {
    onCancel,
    enabled = true,
    showToast = true,
    source = 'swap',
  } = options;

  const isCancelledRef = useRef(false);
  const lastEventRef = useRef<WalletEvent | null>(null);

  // Reset cancelled state
  const resetCancelled = useCallback(() => {
    isCancelledRef.current = false;
    lastEventRef.current = null;
  }, []);

  // Check if cancelled
  const checkCancelled = useCallback(() => {
    return isCancelledRef.current;
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const unsubscribe = walletEvents.onAny((event) => {
      console.log(`[${source}] Wallet event received:`, event.type);

      // Mark as cancelled
      isCancelledRef.current = true;
      lastEventRef.current = event;

      // Get user-friendly message
      const message = getWalletEventMessage(event);

      // Show toast if enabled
      if (showToast) {
        toast.warning(message);
      }

      // Log to global error (as warning, not error)
      globalError[source === 'swap' ? 'swap' : source === 'quote' ? 'quote' : source === 'portfolio' ? 'portfolio' : 'txHistory'](
        'user_rejected',
        message,
        `Event: ${event.type} at ${new Date(event.timestamp).toISOString()}`
      );

      // Call cancel handler
      if (onCancel) {
        try {
          onCancel(event);
        } catch (err) {
          console.error(`[${source}] Cancel handler error:`, err);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [enabled, onCancel, showToast, source]);

  return {
    /**
     * Check if current operation was cancelled by wallet event
     */
    isCancelled: checkCancelled,

    /**
     * Get the last wallet event that caused cancellation
     */
    lastEvent: lastEventRef.current,

    /**
     * Reset cancelled state (call when starting new operation)
     */
    resetCancelled,
  };
}

export default useWalletEventHandler;
