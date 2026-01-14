/**
 * Alert Settings Component
 *
 * User preferences for alert behavior.
 * Collapsible settings panel inside AlertsPanel.
 *
 * Priority 12.2 - Alert Preferences
 * Priority 12.3 - Telegram Alerts
 */

import { useAlertStore } from '@/stores/alertStore';
import { TelegramSettings } from '@/components/signals/TelegramSettings';

interface AlertSettingsProps {
  className?: string;
}

export function AlertSettings({ className = '' }: AlertSettingsProps) {
  const { prefs, setPrefs } = useAlertStore();

  return (
    <div className={`bg-dark-900/50 rounded-lg p-3 space-y-3 ${className}`}>
      <div className="text-xs font-medium text-dark-400 uppercase tracking-wide">
        Alert Settings
      </div>

      {/* Impact Threshold */}
      <div className="space-y-1">
        <label className="text-[11px] text-dark-500">Alert on impact level:</label>
        <div className="flex gap-2">
          <button
            onClick={() => setPrefs({ impactThreshold: 'high' })}
            className={`flex-1 py-1.5 px-2 rounded text-[10px] font-medium transition-colors ${
              prefs.impactThreshold === 'high'
                ? 'bg-red-900/30 text-red-400 ring-1 ring-red-700'
                : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
            }`}
          >
            🔥 High only
          </button>
          <button
            onClick={() => setPrefs({ impactThreshold: 'high+medium' })}
            className={`flex-1 py-1.5 px-2 rounded text-[10px] font-medium transition-colors ${
              prefs.impactThreshold === 'high+medium'
                ? 'bg-orange-900/30 text-orange-400 ring-1 ring-orange-700'
                : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
            }`}
          >
            🔥⚠️ High + Medium
          </button>
        </div>
      </div>

      {/* Sound Toggle */}
      <div className="flex items-center justify-between">
        <label className="text-[11px] text-dark-500">Sound for high-impact alerts</label>
        <button
          onClick={() => setPrefs({ soundEnabled: !prefs.soundEnabled })}
          className={`w-10 h-5 rounded-full transition-colors relative ${
            prefs.soundEnabled ? 'bg-primary-600' : 'bg-dark-700'
          }`}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
              prefs.soundEnabled ? 'left-5' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      {/* Quiet Hours Toggle */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[11px] text-dark-500">Quiet hours (no alerts)</label>
          <button
            onClick={() => setPrefs({ quietHoursEnabled: !prefs.quietHoursEnabled })}
            className={`w-10 h-5 rounded-full transition-colors relative ${
              prefs.quietHoursEnabled ? 'bg-primary-600' : 'bg-dark-700'
            }`}
          >
            <span
              className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                prefs.quietHoursEnabled ? 'left-5' : 'left-0.5'
              }`}
            />
          </button>
        </div>

        {/* Quiet Hours Time Inputs */}
        {prefs.quietHoursEnabled && (
          <div className="flex items-center gap-2 text-[10px]">
            <span className="text-dark-600">From</span>
            <input
              type="time"
              value={prefs.quietStart}
              onChange={(e) => setPrefs({ quietStart: e.target.value })}
              className="bg-dark-800 border border-dark-700 rounded px-2 py-1 text-dark-300 text-[10px]"
            />
            <span className="text-dark-600">to</span>
            <input
              type="time"
              value={prefs.quietEnd}
              onChange={(e) => setPrefs({ quietEnd: e.target.value })}
              className="bg-dark-800 border border-dark-700 rounded px-2 py-1 text-dark-300 text-[10px]"
            />
          </div>
        )}
      </div>

      {/* Telegram Alerts */}
      <TelegramSettings className="mt-3 border-t border-dark-700 pt-3" />
    </div>
  );
}

export default AlertSettings;
