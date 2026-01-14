/**
 * Alerts Panel Component
 *
 * Displays in-app alerts with settings.
 * Shows last 10 alerts with unread badge.
 *
 * Priority 12.1-12.2 - In-App Alerts
 * Step 1 - Token Metadata Layer
 * Step 2 - Quick Actions
 */

import { useState } from 'react';
import { useAlertStore, type AlertItem } from '@/stores/alertStore';
import { useSignalHistoryStore } from '@/stores/signalHistoryStore';
import { getImpactIcon } from '@/components/signals/ImpactBadge';
import { SignalAge } from '@/components/signals/SignalAge';
import { AlertSettings } from '@/components/signals/AlertSettings';
import { getActionGuidance } from '@/utils/alerts';
import { TokenBadge } from '@/components/common/TokenDisplay';
import { getChainShortName } from '@/services/tokenMeta';
import { QuickActions } from '@/components/signals/QuickActions';

interface AlertsPanelProps {
  className?: string;
  /** Callback when clicking an alert to jump to history entry */
  onAlertClick?: (entryHash: string) => void;
}

export function AlertsPanel({ className = '', onAlertClick }: AlertsPanelProps) {
  const { alerts, markAllRead, clearAlerts, getUnreadCount } = useAlertStore();
  const [showSettings, setShowSettings] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const unreadCount = getUnreadCount();
  const displayAlerts = alerts.slice(0, 10);

  return (
    <div className={`bg-dark-800 rounded-xl ${className}`}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-dark-700/50 transition-colors rounded-t-xl"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-dark-200">Alerts</span>
          {unreadCount > 0 && (
            <span className="px-1.5 py-0.5 bg-red-600 text-white text-xs font-medium rounded-full min-w-[20px] text-center">
              {unreadCount}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowSettings(!showSettings);
            }}
            className="text-dark-500 hover:text-dark-300 transition-colors text-sm"
            title="Alert settings"
          >
            ⚙️
          </button>
          <span className="text-dark-500 text-xs">{expanded ? '▼' : '▶'}</span>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          {/* Settings (collapsible) */}
          {showSettings && (
            <AlertSettings className="mb-3" />
          )}

          {/* Clarity line - explain Alerts vs History */}
          <p className="text-[10px] text-dark-600 mb-3 border-b border-dark-700/50 pb-2">
            Alerts show high-impact changes. History shows all signals from the last 24h.
          </p>

          {/* Actions */}
          {alerts.length > 0 && (
            <div className="flex items-center gap-3 mb-3 text-[10px]">
              {unreadCount > 0 && (
                <button
                  onClick={markAllRead}
                  className="text-primary-400 hover:text-primary-300 transition-colors"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={clearAlerts}
                className="text-dark-500 hover:text-dark-400 transition-colors"
              >
                Clear all
              </button>
            </div>
          )}

          {/* Alert List */}
          {displayAlerts.length === 0 ? (
            <div className="text-center py-6 text-dark-500 text-sm">
              No alerts yet
            </div>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {displayAlerts.map((alert) => (
                <AlertItemRow
                  key={alert.id}
                  alert={alert}
                  onClick={() => onAlertClick?.(alert.entryHash)}
                />
              ))}
            </div>
          )}

          {/* More indicator */}
          {alerts.length > 10 && (
            <div className="text-center text-[10px] text-dark-600 mt-2">
              +{alerts.length - 10} more alerts
            </div>
          )}
        </div>
      )}
    </div>
  );
}

interface AlertItemRowProps {
  alert: AlertItem;
  onClick?: () => void;
}

function AlertItemRow({ alert, onClick }: AlertItemRowProps) {
  const { markRead } = useAlertStore();
  const historyEntries = useSignalHistoryStore((s) => s.entries);
  const [showActions, setShowActions] = useState(false);

  // Check if the history entry still exists
  const entryExists = historyEntries.some((e) => e.id === alert.entryHash);

  const handleClick = () => {
    markRead(alert.id);
    if (entryExists && onClick) {
      onClick();
    }
  };

  return (
    <div
      className={`
        w-full text-left px-3 py-2 rounded-lg transition-colors group
        ${alert.read ? 'bg-dark-800/50' : 'bg-dark-700/50'}
        ${entryExists ? 'hover:bg-dark-700' : 'opacity-60'}
      `}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <button
        onClick={handleClick}
        disabled={!entryExists}
        className="w-full text-left"
      >
        <div className="flex items-center gap-2">
          {/* Unread indicator */}
          {!alert.read && (
            <span className="w-1.5 h-1.5 bg-red-500 rounded-full flex-shrink-0" />
          )}

          {/* Impact icon */}
          <span className="text-xs flex-shrink-0">
            {getImpactIcon(alert.impactLevel)}
          </span>

          {/* Type badge */}
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-medium uppercase flex-shrink-0 ${
              alert.type === 'liquidity'
                ? 'bg-blue-900/30 text-blue-400'
                : 'bg-orange-900/30 text-orange-400'
            }`}
          >
            {alert.type === 'liquidity' ? 'LIQ' : 'RISK'}
          </span>

          {/* Token with Logo */}
          <TokenBadge
            chainId={alert.chainId}
            address={alert.token}
            symbol={alert.tokenSymbol}
            className="text-xs truncate flex-1"
          />

          {/* Chain */}
          <span className="text-dark-500 text-[10px] flex-shrink-0">
            {getChainShortName(alert.chainId)}
          </span>

          {/* Time */}
          <SignalAge
            timestamp={alert.timestamp}
            compact
            className="text-dark-500 text-[10px] flex-shrink-0"
          />
        </div>

        {/* Reason preview */}
        <div className="text-[10px] text-dark-500 mt-1 truncate pl-4">
          {alert.reason}
        </div>

        {/* Action guidance */}
        {(() => {
          const guidance = getActionGuidance(alert.impactLevel);
          return (
            <div className={`text-[10px] mt-1.5 pl-4 ${guidance.className}`}>
              {guidance.icon} {guidance.text}
            </div>
          );
        })()}
      </button>

      {/* Quick Actions (hover reveal) */}
      {showActions && (
        <div className="mt-2 pt-2 border-t border-dark-700/50">
          <QuickActions
            chainId={alert.chainId}
            address={alert.token}
            symbol={alert.tokenSymbol}
            compact
            showSwap={false}
          />
        </div>
      )}
    </div>
  );
}

export default AlertsPanel;
