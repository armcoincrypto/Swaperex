/**
 * Monitoring Store
 *
 * Reactive Zustand wrapper around the watchlist monitoring service.
 * Exposes monitoring state (running, lastPoll, interval, backoff)
 * to React components. Persists user preferences (enabled, interval).
 *
 * The actual polling lives in watchlistMonitor.ts — this store
 * provides the UI bridge.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  startWatchlistMonitor,
  stopWatchlistMonitor,
  isMonitorRunning,
  getLastPollTime,
} from '@/services/watchlistMonitor';

export interface MonitoringState {
  /** User preference: monitoring enabled (persisted) */
  enabled: boolean;
  /** Poll interval in seconds (persisted) */
  intervalSeconds: number;
  /** Is monitor currently running (derived from service) */
  running: boolean;
  /** Last poll timestamp (derived from service) */
  lastPollTime: number;
  /** Number of tokens currently watched */
  watchedCount: number;
  /** Chains with watched tokens */
  activeChains: number[];

  // Actions
  setEnabled: (enabled: boolean) => void;
  setIntervalSeconds: (seconds: number) => void;
  syncFromService: () => void;
  updateWatchInfo: (count: number, chains: number[]) => void;
}

export const useMonitoringStore = create<MonitoringState>()(
  persist(
    (set) => ({
      enabled: true,
      intervalSeconds: 60,
      running: false,
      lastPollTime: 0,
      watchedCount: 0,
      activeChains: [],

      setEnabled: (enabled) => {
        set({ enabled });
        if (enabled) {
          startWatchlistMonitor();
          set({ running: true });
        } else {
          stopWatchlistMonitor();
          set({ running: false });
        }
      },

      setIntervalSeconds: (seconds) => {
        set({ intervalSeconds: seconds });
        // Note: changing interval requires restart of monitor service.
        // For now we just store the preference. The monitor service
        // uses its own constant. A future enhancement could make it dynamic.
      },

      syncFromService: () => {
        set({
          running: isMonitorRunning(),
          lastPollTime: getLastPollTime(),
        });
      },

      updateWatchInfo: (count, chains) => {
        set({ watchedCount: count, activeChains: chains });
      },
    }),
    {
      name: 'swaperex-monitoring',
      version: 1,
      partialize: (state) => ({
        enabled: state.enabled,
        intervalSeconds: state.intervalSeconds,
      }),
    }
  )
);

/** Get unique chain IDs from watchlist tokens */
export function getUniqueChains(tokens: Array<{ chainId: number }>): number[] {
  return [...new Set(tokens.map((t) => t.chainId))].sort((a, b) => a - b);
}

/** Human-readable chain label */
export function getChainLabel(chainId: number): string {
  switch (chainId) {
    case 1: return 'ETH';
    case 56: return 'BSC';
    case 137: return 'Polygon';
    case 8453: return 'Base';
    case 42161: return 'Arbitrum';
    default: return `Chain ${chainId}`;
  }
}

/** All supported chains for filter dropdown */
export const SUPPORTED_CHAINS: Array<{ id: number; label: string }> = [
  { id: 1, label: 'Ethereum' },
  { id: 56, label: 'BSC' },
  { id: 137, label: 'Polygon' },
  { id: 8453, label: 'Base' },
  { id: 42161, label: 'Arbitrum' },
];
