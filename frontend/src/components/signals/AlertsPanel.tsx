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
import { useMuteStore } from '@/stores/muteStore';
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

/** Get severity styles based on impact level */
function getSeverityStyles(impactLevel: 'high' | 'medium' | 'low') {
  switch (impactLevel) {
    case 'high':
      return {
        border: 'border-l-red-500',
        bg: 'bg-red-900/10',
        badge: 'bg-red-600 text-white',
        label: 'HIGH',
      };
    case 'medium':
      return {
        border: 'border-l-yellow-500',
        bg: 'bg-yellow-900/10',
        badge: 'bg-yellow-600 text-white',
        label: 'MED',
      };
    case 'low':
    default:
      return {
        border: 'border-l-dark-500',
        bg: 'bg-dark-800/50',
        badge: 'bg-dark-600 text-dark-300',
        label: 'LOW',
      };
  }
}

function AlertItemRow({ alert, onClick }: AlertItemRowProps) {
  const { markRead } = useAlertStore();
  const historyEntries = useSignalHistoryStore((s) => s.entries);
  const { muteToken, isTokenMuted } = useMuteStore();
  const [showActions, setShowActions] = useState(false);

  // Check if the history entry still exists
  const entryExists = historyEntries.some((e) => e.id === alert.entryHash);
  const isMuted = isTokenMuted(alert.chainId, alert.token);
  const severity = getSeverityStyles(alert.impactLevel);
  const guidance = getActionGuidance(alert.impactLevel);

  const handleClick = () => {
    markRead(alert.id);
    if (entryExists && onClick) {
      onClick();
    }
  };

  const handleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    muteToken(alert.chainId, alert.token, alert.tokenSymbol);
  };

  return (
    <div
      className={`
        w-full text-left rounded-lg transition-colors group border-l-4
        ${severity.border} ${severity.bg}
        ${alert.read ? 'opacity-75' : ''}
        ${isMuted ? 'opacity-50' : ''}
        ${entryExists ? 'hover:bg-dark-700/50' : 'opacity-50'}
      `}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <button
        onClick={handleClick}
        disabled={!entryExists}
        className="w-full text-left px-3 py-2"
      >
        {/* Top Row: Severity + Type + Token + Time */}
        <div className="flex items-center gap-2">
          {/* Severity Badge */}
          <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${severity.badge}`}>
            {severity.label}
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
            className={`text-xs truncate flex-1 ${isMuted ? 'line-through' : ''}`}
          />

          {/* Chain + Time */}
          <span className="text-dark-500 text-[10px] flex-shrink-0">
            {getChainShortName(alert.chainId)}
          </span>
          <SignalAge
            timestamp={alert.timestamp}
            compact
            className="text-dark-500 text-[10px] flex-shrink-0"
          />

          {/* Unread dot */}
          {!alert.read && !isMuted && (
            <span className="w-2 h-2 bg-red-500 rounded-full flex-shrink-0" />
          )}
        </div>

        {/* Reason */}
        <div className="text-[11px] text-dark-400 mt-1.5 line-clamp-2">
          {alert.reason}
        </div>

        {/* Action Guidance Bar */}
        <div className={`flex items-center gap-2 mt-2 pt-2 border-t border-dark-700/30 text-[10px] ${guidance.className}`}>
          <span>{guidance.icon}</span>
          <span className="font-medium">{guidance.text}</span>
        </div>
      </button>

      {/* Quick Actions (expanded) */}
      {showActions && (
        <div className="px-3 pb-2 flex items-center gap-2">
          <QuickActions
            chainId={alert.chainId}
            address={alert.token}
            symbol={alert.tokenSymbol}
            compact
            showSwap={false}
          />
          {/* Mute button */}
          {!isMuted && (
            <button
              onClick={handleMute}
              className="px-2 py-1 bg-dark-700 text-dark-400 rounded text-[10px] hover:bg-dark-600 hover:text-dark-300 transition-colors"
              title="Mute alerts for this token"
            >
              🔇 Mute
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default AlertsPanel;
