/**
 * System Status Store
 *
 * Tracks overall system health status including backend availability
 * and external service status. Provides trust indicators for UI.
 *
 * Priority 9.0.1 - Global Health Check
 */

import { create } from 'zustand';

// Use environment variable or default to production URL
import { joinSignalsUrl } from '@/config/api';

export type SystemStatus = 'stable' | 'degraded' | 'unavailable';

/** UI-facing status including freshness semantics (not persisted). */
export type SystemDisplayStatus = SystemStatus | 'unknown' | 'stale';

/** After this interval without a successful check, show stale — not healthy. */
export const SYSTEM_STATUS_STALE_MS = 5 * 60 * 1000;

export interface SystemHealthResponse {
  status: 'ok' | 'partial' | 'error';
  signalsEngine: 'running' | 'degraded' | 'unavailable' | 'disabled';
  version: string;
  uptime: number;
  timestamp: number;
  services: {
    dexscreener: 'up' | 'down';
    goplus: 'up' | 'down';
  };
}

interface SystemStatusState {
  /** Overall system status */
  status: SystemStatus;
  /** Signals engine status */
  signalsEngine: SystemHealthResponse['signalsEngine'] | null;
  /** External services status */
  services: SystemHealthResponse['services'] | null;
  /** Backend version */
  version: string | null;
  /** Backend uptime in seconds */
  uptime: number | null;
  /** Last successful check timestamp */
  lastCheck: number | null;
  /** Is currently checking */
  checking: boolean;
  /** Number of consecutive failures */
  failureCount: number;
  /** Refresh the status */
  refresh: () => Promise<void>;
  /** Reset to initial state */
  reset: () => void;
}

export const useSystemStatusStore = create<SystemStatusState>((set, get) => ({
  status: 'degraded',
  signalsEngine: null,
  services: null,
  version: null,
  uptime: null,
  lastCheck: null,
  checking: false,
  failureCount: 0,

  refresh: async () => {
    // Prevent concurrent checks
    if (get().checking) return;
    set({ checking: true });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(joinSignalsUrl('health'), {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        throw new Error('Health check failed');
      }

      const data: SystemHealthResponse = await res.json();

      // Determine overall system status
      let status: SystemStatus = 'stable';
      if (data.signalsEngine === 'unavailable' || data.signalsEngine === 'disabled') {
        status = 'unavailable';
      } else if (data.signalsEngine === 'degraded' || data.status === 'partial') {
        status = 'degraded';
      }

      set({
        status,
        signalsEngine: data.signalsEngine,
        services: data.services,
        version: data.version,
        uptime: data.uptime,
        lastCheck: Date.now(),
        checking: false,
        failureCount: 0,
      });

    } catch (err) {
      const currentFailures = get().failureCount;
      const hadCheck = get().lastCheck != null;

      const newStatus: SystemStatus =
        currentFailures >= 1 || !hadCheck ? 'unavailable' : get().status;

      set({
        status: newStatus,
        signalsEngine: hadCheck ? get().signalsEngine : null,
        services: hadCheck ? get().services : null,
        checking: false,
        failureCount: currentFailures + 1,
      });

      if (import.meta.env.DEV) {
        console.log(`[SystemStatus] Check failed (${currentFailures + 1}):`, err);
      }
    }
  },

  reset: () => {
    set({
      status: 'degraded',
      signalsEngine: null,
      services: null,
      version: null,
      uptime: null,
      lastCheck: null,
      checking: false,
      failureCount: 0,
    });
  },
}));

export function resolveSystemDisplayStatus(state: {
  status: SystemStatus;
  lastCheck: number | null;
  failureCount: number;
  now?: number;
}): SystemDisplayStatus {
  const now = state.now ?? Date.now();
  if (!state.lastCheck) {
    return state.failureCount > 0 ? 'unavailable' : 'unknown';
  }
  if (now - state.lastCheck > SYSTEM_STATUS_STALE_MS) {
    return 'stale';
  }
  return state.status;
}

export function useSystemDisplayStatus(): SystemDisplayStatus {
  return useSystemStatusStore((s) =>
    resolveSystemDisplayStatus({
      status: s.status,
      lastCheck: s.lastCheck,
      failureCount: s.failureCount,
    }),
  );
}

// Convenient selector hooks
export const useSystemStatus = () => useSystemStatusStore((s) => s.status);
export const useSignalsEngineStatus = () => useSystemStatusStore((s) => s.signalsEngine);
export const useServicesStatus = () => useSystemStatusStore((s) => s.services);

// Get status color for UI
export function getStatusColor(status: SystemDisplayStatus): string {
  switch (status) {
    case 'stable':
      return 'text-green-400';
    case 'degraded':
    case 'stale':
      return 'text-yellow-400';
    case 'unavailable':
      return 'text-red-400';
    case 'unknown':
      return 'text-dark-400';
    default:
      return 'text-gray-400';
  }
}

// Get status indicator
export function getStatusIndicator(status: SystemDisplayStatus): string {
  switch (status) {
    case 'stable':
      return '●';
    case 'degraded':
    case 'stale':
      return '◐';
    case 'unavailable':
      return '○';
    case 'unknown':
      return '…';
    default:
      return '?';
  }
}

export function getSystemDisplayLabel(
  status: SystemDisplayStatus,
  variant: 'default' | 'footer' = 'default',
): string {
  switch (status) {
    case 'stable':
      return variant === 'footer' ? 'Application responding' : 'Application responding';
    case 'degraded':
      return variant === 'footer' ? 'Partial data unavailable' : 'Partial data unavailable';
    case 'stale':
      return variant === 'footer' ? 'Status delayed' : 'Status delayed';
    case 'unavailable':
      return variant === 'footer' ? 'Application unavailable' : 'Application unavailable';
    case 'unknown':
      return variant === 'footer' ? 'Checking status' : 'Checking status';
    default:
      return 'Status unknown';
  }
}
