/**
 * Signals Status Badge
 *
 * Shows a neutral warning when the signals backend is offline.
 * Informational only - never blocks user actions.
 *
 * Design:
 * - Yellow/amber color (neutral, not scary)
 * - Only visible when offline
 * - Auto-hides when backend is back online
 */

import { useSignalsHealthStore } from '@/stores/signalsHealthStore';

interface SignalsStatusBadgeProps {
  /** Compact mode shows shorter message */
  compact?: boolean;
  /** Additional CSS classes */
  className?: string;
}

export function SignalsStatusBadge({ compact = false, className = '' }: SignalsStatusBadgeProps) {
  const { online, checked } = useSignalsHealthStore();

  // Don't show anything until we've checked, or if online
  if (!checked || online) {
    return null;
  }

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-yellow-500/30 bg-yellow-500/10 text-xs text-yellow-300 ${className}`}
      >
        <WarningIcon className="w-3.5 h-3.5" />
        <span>Signals offline</span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-xl border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-300 ${className}`}
    >
      <div className="flex items-start gap-2">
        <WarningIcon className="w-5 h-5 mt-0.5 flex-shrink-0" />
        <div>
          <strong className="block">Signals temporarily unavailable</strong>
          <span className="opacity-80">Risk & liquidity alerts are offline</span>
        </div>
      </div>
    </div>
  );
}

function WarningIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={2}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      />
    </svg>
  );
}

export default SignalsStatusBadge;
