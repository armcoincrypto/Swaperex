/**
 * Global Error Display
 *
 * PHASE 14: Centralized error surface for production hardening.
 * Shows errors from all async flows in one visible UI component.
 *
 * Features:
 * - Short user message (always visible)
 * - Expandable details (for debugging)
 * - Retry button (if recoverable)
 * - Dismiss button
 * - Error history panel
 */

import React, { useState } from 'react';
import { useErrorStore, type GlobalError } from '@/stores/errorStore';

/**
 * Icon components
 */
const AlertIcon: React.FC<{ className?: string }> = ({ className }) => (
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

const XIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const RefreshIcon: React.FC<{ className?: string }> = ({ className }) => (
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
      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
    />
  </svg>
);

const ChevronDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
  </svg>
);

/**
 * Category color mapping
 */
function getCategoryColor(category: GlobalError['category']): string {
  switch (category) {
    case 'user_rejected':
      return 'border-yellow-500 bg-yellow-500/10';
    case 'insufficient_balance':
    case 'invalid_address':
    case 'no_wallet':
      return 'border-orange-500 bg-orange-500/10';
    case 'network_error':
    case 'rpc_timeout':
    case 'rate_limit':
      return 'border-blue-500 bg-blue-500/10';
    case 'contract_error':
    case 'gas_error':
    case 'slippage_error':
      return 'border-red-500 bg-red-500/10';
    default:
      return 'border-red-500 bg-red-500/10';
  }
}

/**
 * Format timestamp for display
 */
function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Source badge component
 */
const SourceBadge: React.FC<{ source: GlobalError['source'] }> = ({ source }) => {
  const colors: Record<string, string> = {
    swap: 'bg-purple-500/20 text-purple-300',
    quote: 'bg-blue-500/20 text-blue-300',
    approval: 'bg-yellow-500/20 text-yellow-300',
    portfolio: 'bg-green-500/20 text-green-300',
    txHistory: 'bg-cyan-500/20 text-cyan-300',
    wallet: 'bg-orange-500/20 text-orange-300',
    network: 'bg-red-500/20 text-red-300',
    unknown: 'bg-gray-500/20 text-gray-300',
  };

  return (
    <span
      className={`text-xs px-2 py-0.5 rounded-full font-medium ${colors[source] || colors.unknown}`}
    >
      {source}
    </span>
  );
};

/**
 * Single error card
 */
const ErrorCard: React.FC<{
  error: GlobalError;
  expanded: boolean;
  onToggleExpand: () => void;
  onDismiss: () => void;
  onRetry: () => void;
}> = ({ error, expanded, onToggleExpand, onDismiss, onRetry }) => {
  const categoryColor = getCategoryColor(error.category);

  return (
    <div
      className={`border-l-4 rounded-lg p-4 ${categoryColor} transition-all duration-200`}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <AlertIcon className="w-5 h-5 text-current flex-shrink-0" />
          <div>
            <p className="font-medium text-white">{error.message}</p>
            <div className="flex items-center gap-2 mt-1">
              <SourceBadge source={error.source} />
              <span className="text-xs text-gray-400">{formatTime(error.timestamp)}</span>
            </div>
          </div>
        </div>

        <button
          onClick={onDismiss}
          className="text-gray-400 hover:text-white transition-colors p-1"
          aria-label="Dismiss error"
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-2 mt-3">
        {error.retryable && error.retryAction && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors"
          >
            <RefreshIcon className="w-4 h-4" />
            Retry
          </button>
        )}

        {error.details && (
          <button
            onClick={onToggleExpand}
            className="flex items-center gap-1 px-3 py-1.5 text-gray-400 hover:text-white text-sm transition-colors"
          >
            Details
            <ChevronDownIcon
              className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`}
            />
          </button>
        )}
      </div>

      {/* Expandable details */}
      {expanded && error.details && (
        <div className="mt-3 p-3 bg-black/30 rounded-lg">
          <p className="text-xs text-gray-400 font-mono break-all">{error.details}</p>
        </div>
      )}
    </div>
  );
};

/**
 * Main Global Error Display component
 */
export const GlobalErrorDisplay: React.FC = () => {
  const { errors, activeError, dismissError, retryError, clearAllErrors } = useErrorStore();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Get active (non-dismissed) errors
  const activeErrors = errors.filter((e) => !e.dismissed);
  const hasErrors = activeErrors.length > 0;

  if (!hasErrors && !showHistory) {
    return null;
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)]">
      {/* Active error display */}
      {activeError && !activeError.dismissed && (
        <ErrorCard
          error={activeError}
          expanded={expandedId === activeError.id}
          onToggleExpand={() =>
            setExpandedId(expandedId === activeError.id ? null : activeError.id)
          }
          onDismiss={() => dismissError(activeError.id)}
          onRetry={() => retryError(activeError.id)}
        />
      )}

      {/* Error count badge / history toggle */}
      {activeErrors.length > 1 && (
        <div className="mt-2 flex items-center justify-between">
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="text-sm text-gray-400 hover:text-white transition-colors"
          >
            {showHistory ? 'Hide' : 'Show'} {activeErrors.length - 1} more error
            {activeErrors.length > 2 ? 's' : ''}
          </button>
          <button
            onClick={clearAllErrors}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Error history panel */}
      {showHistory && (
        <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
          {activeErrors
            .filter((e) => e.id !== activeError?.id)
            .map((error) => (
              <ErrorCard
                key={error.id}
                error={error}
                expanded={expandedId === error.id}
                onToggleExpand={() =>
                  setExpandedId(expandedId === error.id ? null : error.id)
                }
                onDismiss={() => dismissError(error.id)}
                onRetry={() => retryError(error.id)}
              />
            ))}
        </div>
      )}
    </div>
  );
};

/**
 * Inline error display (for forms/components)
 */
export const InlineError: React.FC<{
  error: GlobalError | null;
  onDismiss?: () => void;
  onRetry?: () => void;
  className?: string;
}> = ({ error, onDismiss, onRetry, className = '' }) => {
  const [showDetails, setShowDetails] = useState(false);

  if (!error) return null;

  const categoryColor = getCategoryColor(error.category);

  return (
    <div className={`border-l-4 rounded-lg p-3 ${categoryColor} ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertIcon className="w-4 h-4 flex-shrink-0" />
          <p className="text-sm font-medium">{error.message}</p>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-gray-400 hover:text-white p-0.5"
          >
            <XIcon className="w-3 h-3" />
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 mt-2">
        {error.retryable && onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
          >
            <RefreshIcon className="w-3 h-3" />
            Retry
          </button>
        )}
        {error.details && (
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-xs text-gray-400 hover:text-white"
          >
            {showDetails ? 'Hide' : 'Show'} details
          </button>
        )}
      </div>

      {showDetails && error.details && (
        <p className="mt-2 text-xs text-gray-400 font-mono break-all bg-black/20 p-2 rounded">
          {error.details}
        </p>
      )}
    </div>
  );
};

export default GlobalErrorDisplay;
