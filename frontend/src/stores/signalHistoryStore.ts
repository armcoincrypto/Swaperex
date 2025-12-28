/**
 * Signal History Store
 *
 * Stores signal history locally for replay and review.
 * Persisted to localStorage with 24h retention / 50 entry limit.
 *
 * Priority 8.4 - Signal History & Replay
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Maximum entries to store
const MAX_ENTRIES = 50;
// Maximum age in milliseconds (24 hours)
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export interface SignalHistoryEntry {
  id: string;
  token: string;
  tokenSymbol?: string;
  chainId: number;
  type: 'liquidity' | 'risk';
  severity: 'warning' | 'danger' | 'critical';
  confidence: number;
  reason: string;
  timestamp: number;
  // Debug snapshot at time of signal
  debugSnapshot?: {
    liquidity?: {
      currentLiquidity: number | null;
      dropPct: number | null;
      threshold: number;
    };
    risk?: {
      riskFactorCount: number;
      riskFactors: string[];
      isHoneypot: boolean;
    };
    cooldown?: {
      active: boolean;
      remainingSeconds: number;
    };
  };
  // Was this signal escalated?
  escalated?: boolean;
  previousSeverity?: string;
}

interface SignalHistoryState {
  entries: SignalHistoryEntry[];
  lastUpdated: number;

  // Actions
  addEntry: (entry: Omit<SignalHistoryEntry, 'id'>) => void;
  clearHistory: () => void;
  getRecentEntries: (limit?: number) => SignalHistoryEntry[];
  getEntriesByToken: (token: string) => SignalHistoryEntry[];
  cleanOldEntries: () => void;
}

// Generate unique ID for entry
function generateEntryId(): string {
  return `sig_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export const useSignalHistoryStore = create<SignalHistoryState>()(
  persist(
    (set, get) => ({
      entries: [],
      lastUpdated: 0,

      addEntry: (entryData) => {
        const entry: SignalHistoryEntry = {
          ...entryData,
          id: generateEntryId(),
        };

        set((state) => {
          // Check for duplicates (same token + type within last 5 minutes)
          const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
          const isDuplicate = state.entries.some(
            (e) =>
              e.token.toLowerCase() === entry.token.toLowerCase() &&
              e.type === entry.type &&
              e.chainId === entry.chainId &&
              e.timestamp > fiveMinutesAgo
          );

          if (isDuplicate) {
            console.log('[SignalHistory] Duplicate entry ignored');
            return state;
          }

          // Add new entry at the beginning
          const newEntries = [entry, ...state.entries];

          // Trim to max entries
          const trimmedEntries = newEntries.slice(0, MAX_ENTRIES);

          console.log('[SignalHistory] New entry added:', entry.type, entry.token);

          return {
            entries: trimmedEntries,
            lastUpdated: Date.now(),
          };
        });
      },

      clearHistory: () => {
        set({ entries: [], lastUpdated: Date.now() });
        console.log('[SignalHistory] History cleared');
      },

      getRecentEntries: (limit = 10) => {
        const state = get();
        return state.entries.slice(0, limit);
      },

      getEntriesByToken: (token) => {
        const state = get();
        return state.entries.filter(
          (e) => e.token.toLowerCase() === token.toLowerCase()
        );
      },

      cleanOldEntries: () => {
        const cutoff = Date.now() - MAX_AGE_MS;
        set((state) => ({
          entries: state.entries.filter((e) => e.timestamp > cutoff),
        }));
      },
    }),
    {
      name: 'swaperex-signal-history',
      version: 1,
      // Clean old entries on rehydration
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.cleanOldEntries();
        }
      },
    }
  )
);

// Helper to format relative time
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Helper to get severity color
export function getSeverityColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'text-red-400 bg-red-900/30';
    case 'danger':
      return 'text-orange-400 bg-orange-900/30';
    case 'warning':
      return 'text-yellow-400 bg-yellow-900/30';
    default:
      return 'text-gray-400 bg-gray-800/50';
  }
}

// Helper to get severity icon
export function getSeverityIcon(severity: string): string {
  switch (severity) {
    case 'critical':
      return '🔴';
    case 'danger':
      return '🟠';
    case 'warning':
      return '🟡';
    default:
      return '⚪';
  }
}
