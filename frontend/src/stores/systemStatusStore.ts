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
const SIGNALS_API_URL = import.meta.env.VITE_SIGNALS_API_URL || 'http://207.180.212.142:4001';

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
  checking: false,
  failureCount: 0,

  refresh: async () => {
    // Prevent concurrent checks
    if (get().checking) return;
    set({ checking: true });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch(`${SIGNALS_API_URL}/api/v1/health`, {
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

      // After 2 consecutive failures, mark as unavailable
      const newStatus: SystemStatus = currentFailures >= 1 ? 'unavailable' : get().status;

      set({
        status: newStatus,
        signalsEngine: null,
        services: null,
        checking: false,
        failureCount: currentFailures + 1,
      });

      console.log(`[SystemStatus] Check failed (${currentFailures + 1}):`, err);
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
