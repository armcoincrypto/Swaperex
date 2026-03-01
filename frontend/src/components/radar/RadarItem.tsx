/**
 * Radar Item Component
 *
 * Displays a single radar signal with icon, title, description, and time.
 * Click to navigate to swap screen with token pre-filled.
 *
 * UI Motion (Priority 8.2.4):
 * - Soft pulse animation on new/unread signals
 * - Confidence badge with visual feedback
 * - Escalation indicator with arrow-up icon
 * - Severity-based color coding
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

// Get severity styling with enhanced colors
function getSeverityStyles(severity: string): { bg: string; border: string; glow: string } {
  switch (severity) {
    case 'alert':
      return {
        bg: 'bg-red-900/20',
        border: 'border-red-700/50',
        glow: 'shadow-[0_0_20px_rgba(239,68,68,0.15)]',
      };
    case 'warning':
      return {
        bg: 'bg-yellow-900/20',
        border: 'border-yellow-700/50',
        glow: 'shadow-[0_0_15px_rgba(234,179,8,0.1)]',
      };
    case 'info':
    default:
      return {
        bg: 'bg-dark-800',
        border: 'border-dark-700',
        glow: '',
      };
  }
}

// Format confidence as percentage
function formatConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

// Get confidence color based on value
function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.8) return 'text-green-400 bg-green-900/30';
  if (confidence >= 0.6) return 'text-yellow-400 bg-yellow-900/30';
  return 'text-gray-400 bg-gray-800/50';
}

export function RadarItem({ signal, onClick, onDismiss }: RadarItemProps) {
  const typeInfo = getSignalTypeInfo(signal.type);
  const severityStyles = getSeverityStyles(signal.severity);
  const isNew = !signal.read;
  const hasConfidence = signal.metadata?.confidence !== undefined;
  const isEscalated = signal.metadata?.escalated === true;

  return (
    <div
      className={`
        relative p-4 rounded-xl border transition-all cursor-pointer
        hover:scale-[1.01] hover:border-white/20
        ${severityStyles.bg} ${severityStyles.border}
        ${isNew ? `${severityStyles.glow} animate-fade-in` : 'opacity-70'}
      `}
      onClick={() => onClick(signal)}
    >
      {/* New signal pulse effect */}
      {isNew && (
        <div className="absolute inset-0 rounded-xl overflow-hidden pointer-events-none">
          <div className="absolute inset-0 animate-[pulse_2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-white/5 to-transparent" />
        </div>
      )}

      {/* Unread indicator dot */}
      {isNew && (
        <div className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-primary-500 animate-pulse shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
      )}

      {/* Escalation banner */}
      {isEscalated && (
        <div className="absolute top-0 left-4 -translate-y-1/2 px-2 py-0.5 bg-red-600 text-white text-[10px] font-bold uppercase rounded-full flex items-center gap-1 shadow-lg">
          <EscalationArrow />
          <span>Escalated</span>
        </div>
      )}

      {/* Header: Icon + Type + Time */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-lg">{typeInfo.icon}</span>
          <span className={`text-xs font-medium uppercase tracking-wide ${typeInfo.color}`}>
            {typeInfo.label}
          </span>
          {/* Confidence badge */}
          {hasConfidence && (
            <span
              className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${getConfidenceColor(signal.metadata!.confidence!)}`}
              title={`Confidence: ${formatConfidence(signal.metadata!.confidence!)}`}
            >
              {formatConfidence(signal.metadata!.confidence!)}
            </span>
          )}
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

      {/* Metadata row */}
      {(signal.metadata?.percentChange !== undefined || signal.metadata?.riskFactors?.length) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {/* Percent change badge */}
          {signal.metadata.percentChange !== undefined && (
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
          )}

          {/* Risk factors (show first 2) */}
          {signal.metadata.riskFactors && signal.metadata.riskFactors.length > 0 && (
            <>
              {signal.metadata.riskFactors.slice(0, 2).map((factor, i) => (
                <span
                  key={i}
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-red-900/20 text-red-400 border border-red-800/30"
                >
                  {factor.replace(/_/g, ' ')}
                </span>
              ))}
              {signal.metadata.riskFactors.length > 2 && (
                <span className="text-[10px] text-dark-500">
                  +{signal.metadata.riskFactors.length - 2} more
                </span>
              )}
            </>
          )}

          {/* Source */}
          {signal.metadata.source && (
            <span className="text-xs text-dark-500">via {signal.metadata.source}</span>
          )}
        </div>
      )}

      {/* Escalation details */}
      {isEscalated && signal.metadata?.previousSeverity && (
        <div className="mt-2 text-[10px] text-orange-400 flex items-center gap-1">
          <EscalationArrow />
          <span>
            Severity increased from {signal.metadata.previousSeverity}
          </span>
        </div>
      )}

      {/* Dismiss button */}
      {onDismiss && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(signal.id);
          }}
          className="absolute bottom-3 right-3 text-dark-500 hover:text-dark-300 transition-colors p-1 rounded-lg hover:bg-dark-700"
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

// Small escalation arrow icon
function EscalationArrow() {
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
    </svg>
  );
}

export default RadarItem;
