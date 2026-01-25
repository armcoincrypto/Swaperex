/**
 * Debug Store
 *
 * Manages debug mode state for signal visibility.
 * Activated via URL param (?debug=1) or localStorage.
 *
 * Behavior:
 * - ?debug=1 in URL activates debug mode for the session AND persists to localStorage
 * - localStorage.signals_debug='1' persists across sessions
 * - Toggle button can disable (clears localStorage)
 */

import { create } from 'zustand';

interface DebugState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  toggle: () => void;
}

// Check if debug mode is enabled and optionally persist URL param
function checkDebugEnabled(): boolean {
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);

    // If URL has ?debug=1, activate AND persist to localStorage
    if (params.get('debug') === '1') {
      localStorage.setItem('signals_debug', '1');
      return true;
    }

    // Check localStorage for persisted debug mode
    if (localStorage.getItem('signals_debug') === '1') {
      return true;
    }
  }
  return false;
}

export const useDebugStore = create<DebugState>((set) => ({
  enabled: checkDebugEnabled(),

  setEnabled: (enabled) => {
    if (typeof window !== 'undefined') {
      if (enabled) {
        localStorage.setItem('signals_debug', '1');
      } else {
        localStorage.removeItem('signals_debug');
      }
    }
    set({ enabled });
  },

  toggle: () => {
    set((state) => {
      const newEnabled = !state.enabled;
      if (typeof window !== 'undefined') {
        if (newEnabled) {
          localStorage.setItem('signals_debug', '1');
        } else {
          localStorage.removeItem('signals_debug');
        }
      }
      return { enabled: newEnabled };
    });
  },
}));

// Helper hook for components
export function useDebugMode(): boolean {
  return useDebugStore((state) => state.enabled);
}

/**
 * Check if a signal/alert is a TEST entry (should be hidden in normal mode)
 */
export function isTestSignal(tokenSymbol?: string, token?: string): boolean {
  if (tokenSymbol === 'TEST') return true;
  if (token?.startsWith('0xTEST')) return true;
  return false;
}
