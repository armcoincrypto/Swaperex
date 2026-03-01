/**
 * System Status Indicator Component
 *
 * Shows trust-building system status in footer:
 * - Stable (green): All systems running
 * - Partial (yellow): Some data unavailable
 * - Unavailable (red): Backend offline
 *
 * Priority 9.0.4 - Trust Mode UI
 */

import { useEffect } from 'react';
import {
  useSystemStatusStore,
  useSystemStatus,
  useServicesStatus,
  getStatusColor,
  getStatusIndicator,
  type SystemStatus,
} from '@/stores/systemStatusStore';

interface SystemStatusIndicatorProps {
  /** Show detailed breakdown (default false) */
  detailed?: boolean;
  /** Custom className */
  className?: string;
}

export function SystemStatusIndicator({ detailed = false, className = '' }: SystemStatusIndicatorProps) {
  const status = useSystemStatus();
  const services = useServicesStatus();
  const refresh = useSystemStatusStore((s) => s.refresh);
  const lastCheck = useSystemStatusStore((s) => s.lastCheck);

  // Auto-refresh on mount and every 60 seconds
  useEffect(() => {
    refresh();
    const intervalId = setInterval(refresh, 60_000);
    return () => clearInterval(intervalId);
  }, [refresh]);

  const statusLabel = getStatusLabel(status);
  const statusColor = getStatusColor(status);
  const indicator = getStatusIndicator(status);

  return (
    <div className={`inline-flex items-center gap-2 ${className}`}>
      <span className={`${statusColor} text-xs font-mono`}>
        {indicator} {statusLabel}
      </span>

      {detailed && services && (
        <div className="flex items-center gap-2 text-[10px] text-dark-500">
          <span className="opacity-50">|</span>
          <span className={services.dexscreener === 'up' ? 'text-green-500' : 'text-red-500'}>
            DEX
          </span>
          <span className={services.goplus === 'up' ? 'text-green-500' : 'text-red-500'}>
            SEC
          </span>
        </div>
      )}

      {detailed && lastCheck && (
        <span className="text-[10px] text-dark-600 ml-1">
          ({formatLastCheck(lastCheck)})
        </span>
      )}
    </div>
  );
}

function getStatusLabel(status: SystemStatus): string {
  switch (status) {
    case 'stable':
      return 'Stable';
    case 'degraded':
      return 'Partial data';
    case 'unavailable':
      return 'Backend unavailable';
    default:
      return 'Unknown';
  }
}

function formatLastCheck(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

export default SystemStatusIndicator;
