/**
 * Alerts Panel Component
 *
 * Displays in-app alerts with settings.
 * Shows last 10 alerts with unread badge.
 *
 * Priority 12.1-12.2 - In-App Alerts
 */

import { useState } from 'react';
import { useAlertStore, type AlertItem } from '@/stores/alertStore';
import { useSignalHistoryStore } from '@/stores/signalHistoryStore';
import { getImpactIcon } from '@/components/signals/ImpactBadge';
import { SignalAge } from '@/components/signals/SignalAge';
import { AlertSettings } from '@/components/signals/AlertSettings';
import { getChainName, getActionGuidance } from '@/utils/alerts';

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

  // Check if the history entry still exists
  const entryExists = historyEntries.some((e) => e.id === alert.entryHash);

  const handleClick = () => {
    markRead(alert.id);
    if (entryExists && onClick) {
      onClick();
    }
  };

  return (
    <button
      onClick={handleClick}
      className={`
        w-full text-left px-3 py-2 rounded-lg transition-colors
        ${alert.read ? 'bg-dark-800/50' : 'bg-dark-700/50'}
        ${entryExists ? 'hover:bg-dark-700 cursor-pointer' : 'opacity-60 cursor-default'}
      `}
      disabled={!entryExists}
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

        {/* Token */}
        <span className="text-dark-200 text-xs font-medium truncate flex-1">
          {alert.tokenSymbol || alert.token.slice(0, 8) + '...'}
        </span>

        {/* Chain */}
        <span className="text-dark-500 text-[10px] flex-shrink-0">
          {getChainName(alert.chainId)}
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
  );
}

export default AlertsPanel;
