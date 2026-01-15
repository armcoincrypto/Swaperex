/**
 * Telegram Settings Component
 *
 * Allows users to connect Telegram and manage notification settings.
 * Integrates with backend Telegram service.
 *
 * Priority 12.3 - Telegram Alerts
 */

import { useState, useEffect, useCallback } from 'react';
import { useWallet } from '@/hooks/useWallet';

interface TelegramStatus {
  configured: boolean;
  dryRun: boolean;
  botUsername: string;
  subscription: {
    enabled: boolean;
    minImpact: 'high' | 'high+medium' | 'all';
    minConfidence: number;
    quietHoursStart: number | null;
    quietHoursEnd: number | null;
    connected: boolean;
  } | null;
}

interface TelegramSettingsProps {
  className?: string;
}

const API_BASE = import.meta.env.VITE_SIGNALS_API_URL || 'http://207.180.212.142:4001';

export function TelegramSettings({ className = '' }: TelegramSettingsProps) {
  const { address, isConnected } = useWallet();
  const [status, setStatus] = useState<TelegramStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [connectUrl, setConnectUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch Telegram status
  const fetchStatus = useCallback(async () => {
    if (!address) return;

    try {
      const response = await fetch(`${API_BASE}/api/v1/telegram/status?wallet=${address}`);
      const data = await response.json();
      setStatus(data);
      setError(null);
    } catch (err) {
      console.error('Failed to fetch Telegram status:', err);
      setError('Failed to check Telegram status');
    }
  }, [address]);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Generate connect URL
  const handleConnect = async () => {
    if (!address) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE}/api/v1/telegram/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate connect link');
      }

      const data = await response.json();
      setConnectUrl(data.connectUrl);
    } catch (err: any) {
      setError(err.message || 'Failed to connect');
    } finally {
      setLoading(false);
    }
  };

  // Update settings
  const updateSettings = async (updates: Partial<TelegramStatus['subscription']>) => {
    if (!address) return;

    try {
      const response = await fetch(`${API_BASE}/api/v1/telegram/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address, ...updates }),
      });

      if (response.ok) {
        await fetchStatus();
      }
    } catch (err) {
      console.error('Failed to update settings:', err);
    }
  };

  // Send test notification
  const sendTestNotification = async () => {
    if (!address) return;

    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/v1/telegram/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ wallet: address }),
      });

      const data = await response.json();
      if (data.sent) {
        setError(null);
        alert('Test notification sent! Check your Telegram.');
      } else {
        setError(data.reason || 'Failed to send test notification');
      }
    } catch (err) {
      setError('Failed to send test notification');
    } finally {
      setLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <div className={`bg-dark-900/50 rounded-lg p-3 ${className}`}>
        <div className="text-xs text-dark-500 text-center">
          Connect wallet to enable Telegram alerts
        </div>
      </div>
    );
  }

  if (!status?.configured) {
    return (
      <div className={`bg-dark-900/50 rounded-lg p-3 ${className}`}>
        <div className="text-xs text-dark-500 text-center">
          📱 Telegram notifications coming soon
        </div>
      </div>
    );
  }

  const isConnectedToTelegram = status.subscription?.connected;

  return (
    <div className={`bg-dark-900/50 rounded-lg p-3 space-y-3 ${className}`}>
      <div className="text-xs font-medium text-dark-400 uppercase tracking-wide flex items-center gap-2">
        📱 Telegram Alerts
        {status.dryRun && (
          <span className="text-[9px] text-yellow-500 bg-yellow-900/30 px-1 rounded">TEST MODE</span>
        )}
      </div>

      {error && (
        <div className="text-[10px] text-red-400 bg-red-900/20 px-2 py-1 rounded">
          {error}
        </div>
      )}

      {!isConnectedToTelegram ? (
        // Not connected - show connect button
        <div className="space-y-2">
          <p className="text-[11px] text-dark-400">
            Receive alerts on Telegram when high-impact signals are detected.
          </p>

          {connectUrl ? (
            <div className="space-y-2">
              <a
                href={connectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium rounded-lg text-center transition-colors"
              >
                📱 Open Telegram Bot
              </a>
              <p className="text-[10px] text-dark-500 text-center">
                Link expires in 10 minutes
              </p>
              <button
                onClick={() => {
                  setConnectUrl(null);
                  fetchStatus();
                }}
                className="w-full text-[10px] text-dark-500 hover:text-dark-300"
              >
                Cancel / I've connected
              </button>
            </div>
          ) : (
            <button
              onClick={handleConnect}
              disabled={loading}
              className="w-full py-2 px-3 bg-dark-700 hover:bg-dark-600 text-dark-200 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              {loading ? 'Generating link...' : 'Enable Telegram Alerts'}
            </button>
          )}
        </div>
      ) : (
        // Connected - show settings
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-green-400">✓ Connected to @{status.botUsername}</span>
            <button
              onClick={() => updateSettings({ enabled: !status.subscription?.enabled })}
              className={`w-10 h-5 rounded-full transition-colors relative ${
                status.subscription?.enabled ? 'bg-primary-600' : 'bg-dark-700'
              }`}
            >
              <span
                className={`absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform ${
                  status.subscription?.enabled ? 'left-5' : 'left-0.5'
                }`}
              />
            </button>
          </div>

          {/* Impact Level */}
          <div className="space-y-1">
            <label className="text-[10px] text-dark-500">Notify on impact:</label>
            <div className="flex gap-1">
              <button
                onClick={() => updateSettings({ minImpact: 'high' })}
                className={`flex-1 py-1 px-2 rounded text-[9px] font-medium transition-colors ${
                  status.subscription?.minImpact === 'high'
                    ? 'bg-red-900/30 text-red-400 ring-1 ring-red-700'
                    : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
                }`}
              >
                High
              </button>
              <button
                onClick={() => updateSettings({ minImpact: 'high+medium' })}
                className={`flex-1 py-1 px-2 rounded text-[9px] font-medium transition-colors ${
                  status.subscription?.minImpact === 'high+medium'
                    ? 'bg-orange-900/30 text-orange-400 ring-1 ring-orange-700'
                    : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
                }`}
              >
                High+Med
              </button>
              <button
                onClick={() => updateSettings({ minImpact: 'all' })}
                className={`flex-1 py-1 px-2 rounded text-[9px] font-medium transition-colors ${
                  status.subscription?.minImpact === 'all'
                    ? 'bg-primary-900/30 text-primary-400 ring-1 ring-primary-700'
                    : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
                }`}
              >
                All
              </button>
            </div>
          </div>

          {/* Min Confidence */}
          <div className="space-y-1">
            <label className="text-[10px] text-dark-500">Min confidence:</label>
            <div className="flex gap-1">
              {[40, 60, 80].map((conf) => (
                <button
                  key={conf}
                  onClick={() => updateSettings({ minConfidence: conf })}
                  className={`flex-1 py-1 px-2 rounded text-[9px] font-medium transition-colors ${
                    status.subscription?.minConfidence === conf
                      ? 'bg-primary-900/30 text-primary-400 ring-1 ring-primary-700'
                      : 'bg-dark-800 text-dark-400 hover:bg-dark-700'
                  }`}
                >
                  ≥{conf}%
                </button>
              ))}
            </div>
          </div>

          {/* Test Button */}
          <button
            onClick={sendTestNotification}
            disabled={loading || !status.subscription?.enabled}
            className="w-full py-1.5 px-3 bg-dark-700 hover:bg-dark-600 text-dark-300 text-[10px] font-medium rounded transition-colors disabled:opacity-50"
          >
            {loading ? 'Sending...' : '📤 Send Test Notification'}
          </button>

          <p className="text-[9px] text-dark-600 text-center">
            Use /off in Telegram to disable, /status to check settings
          </p>
        </div>
      )}
    </div>
  );
}

export default TelegramSettings;
