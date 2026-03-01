/**
 * Signals Health Store
 *
 * Tracks the health status of the backend signals service.
 * Used to show "Signals Offline" badge when backend is unavailable.
 */

import { create } from 'zustand';
import { checkSignalsHealth } from '@/services/signalsHealth';

interface SignalsHealthState {
  /** Whether the signals backend is online and enabled */
  online: boolean;
  /** Whether we've done the initial health check */
  checked: boolean;
  /** Last time we checked (timestamp) */
  lastCheck: number | null;
  /** Number of consecutive failures */
  failureCount: number;

  /** Refresh the health status */
  refresh: () => Promise<void>;
  /** Reset to initial state */
  reset: () => void;
}

export const useSignalsHealthStore = create<SignalsHealthState>((set, get) => ({
  online: true, // Assume online until proven otherwise
  checked: false,
  lastCheck: null,
  failureCount: 0,

  refresh: async () => {
    const ok = await checkSignalsHealth();
    const currentFailures = get().failureCount;

    set({
      online: ok,
      checked: true,
      lastCheck: Date.now(),
      // Track consecutive failures for potential future use
      failureCount: ok ? 0 : currentFailures + 1,
    });

    // Log status change for debugging (only on state change)
    const wasOnline = get().online;
    if (wasOnline !== ok) {
      console.log(`[SignalsHealth] Status changed: ${ok ? 'ONLINE' : 'OFFLINE'}`);
    }
  },

  reset: () => {
    set({
      online: true,
      checked: false,
      lastCheck: null,
      failureCount: 0,
    });
  },
}));

// Selector hooks for convenience
export const useSignalsOnline = () => useSignalsHealthStore((s) => s.online);
export const useSignalsChecked = () => useSignalsHealthStore((s) => s.checked);
