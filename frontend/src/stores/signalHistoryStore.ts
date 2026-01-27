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
import { debugLog } from '@/utils/debug';

// Maximum entries to store
const MAX_ENTRIES = 50;
// Maximum age in milliseconds (24 hours)
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
// Deduplication window in milliseconds (5 minutes)
const DEDUP_WINDOW_MS = 5 * 60 * 1000;

/**
 * Generate a hash for signal state
 * Used for deduplication to prevent identical signals
 */
function hashSignalState(entry: Omit<SignalHistoryEntry, 'id'>): string {
  const key = `${entry.token.toLowerCase()}:${entry.type}:${entry.chainId}:${entry.severity}:${entry.confidence}`;
  // Simple hash - we just need uniqueness, not cryptographic security
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    const char = key.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash.toString(16);
}

/** Impact score for signal prioritization */
export interface SignalImpact {
  score: number;
  level: 'high' | 'medium' | 'low';
  reason: string;
}

/** Recurrence info for time context (Priority 10.3) */
export interface SignalRecurrence {
  occurrences24h: number;
  lastSeen: number | null;
  isRepeat: boolean;
  trend: 'increasing' | 'decreasing' | 'stable' | 'new';
  previousImpact: number | null;
  timeSinceLastSeconds: number | null;
}

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
  /** Impact score for prioritization */
  impact?: SignalImpact;
  /** Recurrence info for time context (Priority 10.3) */
  recurrence?: SignalRecurrence;
  /** Hash of signal state for deduplication */
  stateHash?: string;
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
        const stateHash = hashSignalState(entryData as Omit<SignalHistoryEntry, 'id'>);
        const entry: SignalHistoryEntry = {
          ...entryData,
          id: generateEntryId(),
          stateHash,
        };

        set((state) => {
          const cutoff = Date.now() - DEDUP_WINDOW_MS;

          // Hash-based deduplication: same state hash within dedup window
          const isDuplicate = state.entries.some(
            (e) =>
              e.stateHash === stateHash &&
              e.timestamp > cutoff
          );

          // Fallback: same token + type + chain within dedup window (for old entries without hash)
          const isFallbackDuplicate = state.entries.some(
            (e) =>
              !e.stateHash &&
              e.token.toLowerCase() === entry.token.toLowerCase() &&
              e.type === entry.type &&
              e.chainId === entry.chainId &&
              e.timestamp > cutoff
          );

          if (isDuplicate || isFallbackDuplicate) {
            debugLog('[SignalHistory] Duplicate entry ignored (hash:', stateHash, ')');
            return state;
          }

          // Add new entry at the beginning
          const newEntries = [entry, ...state.entries];

          // Trim to max entries
          const trimmedEntries = newEntries.slice(0, MAX_ENTRIES);

          console.log('[SignalHistory] New entry added:', entry.type, entry.token, 'hash:', stateHash);

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

// Re-export from shared utility for backward compatibility
export { formatRelativeTime } from '@/utils/time';

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

// Helper to get trend icon (Priority 10.3)
export function getTrendIcon(trend: SignalRecurrence['trend']): string {
  switch (trend) {
    case 'increasing':
      return '⬆';
    case 'decreasing':
      return '⬇';
    case 'stable':
      return '➖';
    case 'new':
      return '🆕';
    default:
      return '';
  }
}

// Helper to get trend color class (Priority 10.3)
export function getTrendColorClass(trend: SignalRecurrence['trend']): string {
  switch (trend) {
    case 'increasing':
      return 'text-red-400';
    case 'decreasing':
      return 'text-green-400';
    case 'stable':
      return 'text-gray-400';
    case 'new':
      return 'text-blue-400';
    default:
      return 'text-gray-500';
  }
}

// Helper to format recurrence text (Priority 10.3)
export function formatRecurrenceText(recurrence: SignalRecurrence): string {
  if (!recurrence.isRepeat) {
    return 'First occurrence';
  }

  const count = recurrence.occurrences24h;
  const trendText = recurrence.trend === 'increasing'
    ? 'worsening'
    : recurrence.trend === 'decreasing'
    ? 'improving'
    : 'stable';

  return `${count}× in 24h (${trendText})`;
}

/**
 * Grouped signal entry for user-friendly display
 * Combines duplicate signals within a time window
 */
export interface GroupedSignalEntry {
  /** Representative entry (most recent) */
  entry: SignalHistoryEntry;
  /** Number of occurrences in the grouping window */
  count: number;
  /** All individual entries in this group */
  entries: SignalHistoryEntry[];
  /** First occurrence timestamp */
  firstSeen: number;
  /** Last occurrence timestamp */
  lastSeen: number;
}

/**
 * Group duplicate signals for user-friendly display
 * Same token + type + impact level within windowMs are grouped together
 */
export function groupSignalEntries(
  entries: SignalHistoryEntry[],
  windowMs: number = 60 * 60 * 1000 // 60 min default
): GroupedSignalEntry[] {
  const groups = new Map<string, GroupedSignalEntry>();

  for (const entry of entries) {
    // Create grouping key: token + type + impact level
    const impactLevel = entry.impact?.level || 'low';
    const key = `${entry.token.toLowerCase()}:${entry.chainId}:${entry.type}:${impactLevel}`;

    const existing = groups.get(key);

    if (existing) {
      // Check if within grouping window from the first entry
      if (existing.firstSeen - entry.timestamp <= windowMs) {
        existing.count++;
        existing.entries.push(entry);
        // Update firstSeen if this entry is older
        if (entry.timestamp < existing.firstSeen) {
          existing.firstSeen = entry.timestamp;
        }
      } else {
        // Outside window, create new group with unique key
        const uniqueKey = `${key}:${entry.timestamp}`;
        groups.set(uniqueKey, {
          entry,
          count: 1,
          entries: [entry],
          firstSeen: entry.timestamp,
          lastSeen: entry.timestamp,
        });
      }
    } else {
      groups.set(key, {
        entry,
        count: 1,
        entries: [entry],
        firstSeen: entry.timestamp,
        lastSeen: entry.timestamp,
      });
    }
  }

  // Convert to array and sort by most recent
  return Array.from(groups.values()).sort((a, b) => b.lastSeen - a.lastSeen);
}
