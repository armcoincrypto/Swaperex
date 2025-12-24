/**
 * Radar Item Component
 *
 * Displays a single radar signal with icon, title, description, and time.
 * Click to navigate to swap screen with token pre-filled.
 */

import { type RadarSignal, getSignalTypeInfo } from '@/stores/radarStore';

interface RadarItemProps {
  signal: RadarSignal;
  onClick: (signal: RadarSignal) => void;
  onDismiss?: (signalId: string) => void;
}

// Format relative time (e.g., "5 min ago", "2 hours ago")
function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// Get severity styling
function getSeverityStyles(severity: string): { bg: string; border: string } {
  switch (severity) {
    case 'alert':
      return { bg: 'bg-red-900/20', border: 'border-red-800' };
    case 'warning':
      return { bg: 'bg-yellow-900/20', border: 'border-yellow-800' };
    case 'info':
    default:
      return { bg: 'bg-dark-800', border: 'border-dark-700' };
  }
}

export function RadarItem({ signal, onClick, onDismiss }: RadarItemProps) {
  const typeInfo = getSignalTypeInfo(signal.type);
  const severityStyles = getSeverityStyles(signal.severity);

  return (
    <div
      className={`relative p-4 rounded-xl border transition-all cursor-pointer hover:scale-[1.01] ${
        severityStyles.bg
      } ${severityStyles.border} ${
        signal.read ? 'opacity-70' : ''
      }`}
      onClick={() => onClick(signal)}
    >
      {/* Unread indicator */}
      {!signal.read && (
        <div className="absolute top-3 right-3 w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
      )}

      {/* Header: Icon + Type + Time */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{typeInfo.icon}</span>
          <span className={`text-xs font-medium uppercase tracking-wide ${typeInfo.color}`}>
            {typeInfo.label}
          </span>
        </div>
        <span className="text-xs text-dark-400">
          {formatRelativeTime(signal.timestamp)}
        </span>
      </div>

      {/* Token Symbol */}
      <div className="text-lg font-bold mb-1">{signal.tokenSymbol}</div>

      {/* Title */}
      <div className="text-sm font-medium text-white mb-1">{signal.title}</div>

      {/* Description */}
      <div className="text-sm text-dark-400">{signal.description}</div>

      {/* Metadata (if present) */}
      {signal.metadata?.percentChange !== undefined && (
        <div className="mt-2 flex items-center gap-2">
          <span
            className={`text-xs font-medium px-2 py-0.5 rounded ${
              signal.metadata.percentChange > 0
                ? 'bg-green-900/30 text-green-400'
                : signal.metadata.percentChange < 0
                ? 'bg-red-900/30 text-red-400'
                : 'bg-dark-700 text-dark-300'
            }`}
          >
            {signal.metadata.percentChange > 0 ? '+' : ''}
            {signal.metadata.percentChange.toFixed(1)}%
          </span>
          {signal.metadata.source && (
            <span className="text-xs text-dark-500">via {signal.metadata.source}</span>
          )}
        </div>
      )}

      {/* Dismiss button */}
      {onDismiss && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(signal.id);
          }}
          className="absolute bottom-3 right-3 text-dark-500 hover:text-dark-300 transition-colors"
          title="Dismiss"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

export default RadarItem;
