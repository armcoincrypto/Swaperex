/**
 * Debug Store
 *
 * Manages debug mode state for signal visibility.
 * Activated via URL param (?debug=1) or localStorage.
 */

import { create } from 'zustand';

interface DebugState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  toggle: () => void;
}

// Check if debug mode is enabled
function checkDebugEnabled(): boolean {
  // Check URL param first
  if (typeof window !== 'undefined') {
    const params = new URLSearchParams(window.location.search);
    if (params.get('debug') === '1') {
      return true;
    }
    // Check localStorage
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
