/**
 * System Status Store
 *
 * Tracks overall system health status including backend availability
 * and external service status. Provides trust indicators for UI.
 *
 * Priority 9.0.1 - Global Health Check
 * Backend-down: graceful degradation, no unhandled errors.
 */

import { create } from 'zustand';
import { joinSignalsUrl, SIGNALS_API_URL } from '@/utils/constants';

export type SystemStatus = 'stable' | 'degraded' | 'unavailable';

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
  /** Last failure timestamp (for backoff) */
  lastFailureAt: number | null;
  /** Sanitized last error message (for diagnostics) */
  lastError: string | null;
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
  status: 'stable', // Assume stable until proven otherwise
  signalsEngine: null,
  services: null,
  version: null,
  uptime: null,
  lastCheck: null,
  lastFailureAt: null,
  lastError: null,
  checking: false,
  failureCount: 0,

  refresh: async () => {
    if (get().checking) return;
    const state = get();
    // Backoff: after failures, wait 2 min before retry to avoid spam
    const BACKOFF_MS = 2 * 60 * 1000;
    if (state.failureCount >= 1 && state.lastFailureAt && Date.now() - state.lastFailureAt < BACKOFF_MS) {
      return;
    }
    set({ checking: true });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(joinSignalsUrl('api/v1/health'), {
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
        lastFailureAt: null,
        lastError: null,
        checking: false,
        failureCount: 0,
      });

    } catch (err) {
      const currentFailures = get().failureCount;
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      const sanitized = errMsg.length > 80 ? errMsg.slice(0, 77) + '...' : errMsg;

      set({
        status: currentFailures >= 1 ? 'unavailable' : get().status,
        signalsEngine: null,
        services: null,
        lastFailureAt: Date.now(),
        lastError: sanitized,
        checking: false,
        failureCount: currentFailures + 1,
      });

      console.warn(`[SystemStatus] Check failed (${currentFailures + 1}):`, errMsg);
    }
  },

  reset: () => {
    set({
      status: 'stable',
      signalsEngine: null,
      services: null,
      version: null,
      uptime: null,
      lastCheck: null,
      lastFailureAt: null,
      lastError: null,
      checking: false,
      failureCount: 0,
    });
  },
}));

// Convenient selector hooks
export const useSystemStatus = () => useSystemStatusStore((s) => s.status);
export const useSignalsEngineStatus = () => useSystemStatusStore((s) => s.signalsEngine);
export const useServicesStatus = () => useSystemStatusStore((s) => s.services);

// Get status color for UI
export function getStatusColor(status: SystemStatus): string {
  switch (status) {
    case 'stable':
      return 'text-green-400';
    case 'degraded':
      return 'text-yellow-400';
    case 'unavailable':
      return 'text-red-400';
    default:
      return 'text-gray-400';
  }
}

// Get status indicator
export function getStatusIndicator(status: SystemStatus): string {
  switch (status) {
    case 'stable':
      return '●';
    case 'degraded':
      return '◐';
    case 'unavailable':
      return '○';
    default:
      return '?';
  }
}
