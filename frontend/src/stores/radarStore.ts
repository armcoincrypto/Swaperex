/**
 * Radar Store - Zustand store for tracking actionable signals
 *
 * Stores signals in localStorage with 24h retention.
 * Deduplicates by token + signal type.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Signal types
export type RadarSignalType = 'liquidity_added' | 'risk_changed' | 'price_move';

// Signal severity/importance
export type SignalSeverity = 'info' | 'warning' | 'alert';

// Radar signal structure
export interface RadarSignal {
  id: string;
  type: RadarSignalType;
  severity: SignalSeverity;
  tokenSymbol: string;
  tokenAddress: string;
  chainId: number;
  title: string;
  description: string;
  timestamp: number;
  read: boolean;
  // Optional metadata
  metadata?: {
    oldValue?: string | number;
    newValue?: string | number;
    percentChange?: number;
    source?: string;
  };
}

interface RadarState {
  signals: RadarSignal[];
  lastUpdated: number;

  // Actions
  addSignal: (signal: Omit<RadarSignal, 'id' | 'timestamp' | 'read'>) => void;
  markAsRead: (signalId: string) => void;
  markAllAsRead: () => void;
  removeSignal: (signalId: string) => void;
  clearOldSignals: () => void;
  getUnreadCount: () => number;
  getSignalsByToken: (tokenAddress: string) => RadarSignal[];
}

// 24 hours in milliseconds
const SIGNAL_RETENTION_MS = 24 * 60 * 60 * 1000;

// Generate unique signal ID
function generateSignalId(type: RadarSignalType, tokenAddress: string, chainId: number): string {
  return `${type}-${tokenAddress.toLowerCase()}-${chainId}-${Date.now()}`;
}

// Check if signal is duplicate (same type + token within last hour)
function isDuplicate(signals: RadarSignal[], newSignal: Omit<RadarSignal, 'id' | 'timestamp' | 'read'>): boolean {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  return signals.some(
    (s) =>
      s.type === newSignal.type &&
      s.tokenAddress.toLowerCase() === newSignal.tokenAddress.toLowerCase() &&
      s.chainId === newSignal.chainId &&
      s.timestamp > oneHourAgo
  );
}

export const useRadarStore = create<RadarState>()(
  persist(
    (set, get) => ({
      signals: [],
      lastUpdated: 0,

      addSignal: (signalData) => {
        const state = get();

        // Check for duplicates
        if (isDuplicate(state.signals, signalData)) {
          console.log('[Radar] Duplicate signal ignored:', signalData.type, signalData.tokenSymbol);
          return;
        }

        const newSignal: RadarSignal = {
          ...signalData,
          id: generateSignalId(signalData.type, signalData.tokenAddress, signalData.chainId),
          timestamp: Date.now(),
          read: false,
        };

        console.log('[Radar] New signal:', newSignal.type, newSignal.tokenSymbol, newSignal.description);

        set((state) => ({
          signals: [newSignal, ...state.signals].slice(0, 50), // Keep max 50 signals
          lastUpdated: Date.now(),
        }));
      },

      markAsRead: (signalId) => {
        set((state) => ({
          signals: state.signals.map((s) =>
            s.id === signalId ? { ...s, read: true } : s
          ),
        }));
      },

      markAllAsRead: () => {
        set((state) => ({
          signals: state.signals.map((s) => ({ ...s, read: true })),
        }));
      },

      removeSignal: (signalId) => {
        set((state) => ({
          signals: state.signals.filter((s) => s.id !== signalId),
        }));
      },

      clearOldSignals: () => {
        const cutoff = Date.now() - SIGNAL_RETENTION_MS;
        set((state) => ({
          signals: state.signals.filter((s) => s.timestamp > cutoff),
        }));
      },

      getUnreadCount: () => {
        return get().signals.filter((s) => !s.read).length;
      },

      getSignalsByToken: (tokenAddress) => {
        return get().signals.filter(
          (s) => s.tokenAddress.toLowerCase() === tokenAddress.toLowerCase()
        );
      },
    }),
    {
      name: 'swaperex-radar',
      version: 1,
      // Clean old signals on rehydration
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.clearOldSignals();
        }
      },
    }
  )
);

// Export helper for signal type display
export function getSignalTypeInfo(type: RadarSignalType): {
  icon: string;
  label: string;
  color: string;
} {
  switch (type) {
    case 'liquidity_added':
      return { icon: '🟢', label: 'New Liquidity', color: 'text-green-400' };
    case 'risk_changed':
      return { icon: '🟡', label: 'Risk Change', color: 'text-yellow-400' };
    case 'price_move':
      return { icon: '🔵', label: 'Price Move', color: 'text-blue-400' };
    default:
      return { icon: '⚪', label: 'Signal', color: 'text-gray-400' };
  }
}
