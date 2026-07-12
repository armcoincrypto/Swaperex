/**
 * System Status Indicator Component
 *
 * Evidence-backed application availability in footer.
 * Does not claim swap settlement or on-chain finality.
 */

import { useEffect } from 'react';
import {
  useSystemStatusStore,
  useSystemDisplayStatus,
  useServicesStatus,
  getStatusColor,
  getStatusIndicator,
  getSystemDisplayLabel,
} from '@/stores/systemStatusStore';

interface SystemStatusIndicatorProps {
  /** Show detailed breakdown (default false) */
  detailed?: boolean;
  /** `footer` uses compact labels for site footer */
  variant?: 'default' | 'footer';
  /** Custom className */
  className?: string;
}

export function SystemStatusIndicator({
  detailed = false,
  variant = 'default',
  className = '',
}: SystemStatusIndicatorProps) {
  const displayStatus = useSystemDisplayStatus();
  const services = useServicesStatus();
  const refresh = useSystemStatusStore((s) => s.refresh);
  const lastCheck = useSystemStatusStore((s) => s.lastCheck);

  useEffect(() => {
    refresh();
    const intervalId = setInterval(refresh, 60_000);
    return () => clearInterval(intervalId);
  }, [refresh]);

  const statusLabel = getSystemDisplayLabel(displayStatus, variant);
  const statusColor = getStatusColor(displayStatus);
  const indicator = getStatusIndicator(displayStatus);

  return (
    <div
      className={`inline-flex items-center gap-2 ${className}`}
      role="status"
      aria-live="polite"
      aria-label={statusLabel}
    >
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

function formatLastCheck(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ago`;
}

export default SystemStatusIndicator;
