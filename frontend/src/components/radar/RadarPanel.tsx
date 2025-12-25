/**
 * Radar Panel Component
 *
 * Main panel showing all radar signals.
 * Includes filtering, mark all as read, and empty state.
 */

import { useState, useMemo } from 'react';
import { useRadarStore, type RadarSignalType, type RadarSignal, getSignalTypeInfo } from '@/stores/radarStore';
import { useUsageStore } from '@/stores/usageStore';
import { RadarItem } from './RadarItem';
import { TierBadge } from '@/components/common/TierBadge';

interface RadarPanelProps {
  onSignalClick: (signal: RadarSignal) => void;
}

type FilterType = 'all' | RadarSignalType;

const FILTER_OPTIONS: { value: FilterType; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'liquidity_added', label: 'Liquidity' },
  { value: 'risk_changed', label: 'Risk' },
  { value: 'price_move', label: 'Price' },
];

export function RadarPanel({ onSignalClick }: RadarPanelProps) {
  const { signals, markAsRead, markAllAsRead, removeSignal, getUnreadCount } = useRadarStore();
  const { trackEvent } = useUsageStore();
  const [filter, setFilter] = useState<FilterType>('all');

  const unreadCount = getUnreadCount();

  // Filter signals
  const filteredSignals = useMemo(() => {
    if (filter === 'all') return signals;
    return signals.filter((s) => s.type === filter);
  }, [signals, filter]);

  // Group signals by time (Today, Yesterday, Older)
  const groupedSignals = useMemo(() => {
    const todayStart = new Date().setHours(0, 0, 0, 0);
    const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;

    const today: RadarSignal[] = [];
    const yesterday: RadarSignal[] = [];
    const older: RadarSignal[] = [];

    filteredSignals.forEach((signal) => {
      if (signal.timestamp >= todayStart) {
        today.push(signal);
      } else if (signal.timestamp >= yesterdayStart) {
        yesterday.push(signal);
      } else {
        older.push(signal);
      }
    });

    return { today, yesterday, older };
  }, [filteredSignals]);

  const handleSignalClick = (signal: RadarSignal) => {
    markAsRead(signal.id);
    onSignalClick(signal);
    trackEvent('signal_viewed');
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h2 className="text-2xl font-bold">Radar</h2>
          <TierBadge tier="early-access" />
          {unreadCount > 0 && (
            <span className="px-2 py-0.5 bg-primary-600 text-white text-sm font-medium rounded-full">
              {unreadCount} new
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="text-sm text-primary-400 hover:text-primary-300 transition-colors"
          >
            Mark all as read
          </button>
        )}
      </div>

      {/* Filter Pills */}
      <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
        {FILTER_OPTIONS.map((option) => {
          const isActive = filter === option.value;
          const typeInfo = option.value !== 'all' ? getSignalTypeInfo(option.value) : null;
          const count =
            option.value === 'all'
              ? signals.length
              : signals.filter((s) => s.type === option.value).length;

          return (
            <button
              key={option.value}
              onClick={() => setFilter(option.value)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? 'bg-primary-600 text-white'
                  : 'bg-dark-800 text-dark-300 hover:bg-dark-700'
              }`}
            >
              {typeInfo && <span>{typeInfo.icon}</span>}
              <span>{option.label}</span>
              {count > 0 && (
                <span
                  className={`ml-1 px-1.5 py-0.5 rounded text-xs ${
                    isActive ? 'bg-primary-500' : 'bg-dark-700'
                  }`}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredSignals.length === 0 && (
        <div className="text-center py-16">
          <div className="text-4xl mb-4">📡</div>
          <h3 className="text-xl font-bold mb-2">No signals yet</h3>
          <p className="text-dark-400 max-w-md mx-auto">
            {filter === 'all'
              ? 'Radar monitors tokens you interact with for important changes. Start swapping to see signals here.'
              : `No ${FILTER_OPTIONS.find((o) => o.value === filter)?.label.toLowerCase()} signals yet.`}
          </p>
        </div>
      )}

      {/* Signal Groups */}
      {filteredSignals.length > 0 && (
        <div className="space-y-6">
          {/* Today */}
          {groupedSignals.today.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-dark-400 mb-3 uppercase tracking-wide">
                Today
              </h3>
              <div className="space-y-3">
                {groupedSignals.today.map((signal) => (
                  <RadarItem
                    key={signal.id}
                    signal={signal}
                    onClick={handleSignalClick}
                    onDismiss={removeSignal}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Yesterday */}
          {groupedSignals.yesterday.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-dark-400 mb-3 uppercase tracking-wide">
                Yesterday
              </h3>
              <div className="space-y-3">
                {groupedSignals.yesterday.map((signal) => (
                  <RadarItem
                    key={signal.id}
                    signal={signal}
                    onClick={handleSignalClick}
                    onDismiss={removeSignal}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Older */}
          {groupedSignals.older.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-dark-400 mb-3 uppercase tracking-wide">
                Older
              </h3>
              <div className="space-y-3">
                {groupedSignals.older.map((signal) => (
                  <RadarItem
                    key={signal.id}
                    signal={signal}
                    onClick={handleSignalClick}
                    onDismiss={removeSignal}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Info Footer */}
      <div className="mt-8 p-4 bg-dark-800 rounded-xl text-center">
        <p className="text-xs text-dark-400">
          Radar monitors tokens you interact with and alerts you to significant changes.
          <br />
          Signals are stored locally and cleared after 24 hours.
        </p>
      </div>
    </div>
  );
}

export default RadarPanel;
