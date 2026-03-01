/**
 * Alert Store
 *
 * Manages in-app alerts for signal notifications.
 * Persisted to localStorage for cross-session retention.
 *
 * Priority 12.1-12.2 - In-App Alerts & Preferences
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AlertItem {
  id: string;
  token: string;
  tokenSymbol?: string;
  chainId: number;
  type: 'risk' | 'liquidity';
  impactLevel: 'high' | 'medium' | 'low';
  impactScore: number;
  confidence: number;
  reason: string;
  timestamp: number;
  entryHash: string;
  read: boolean;
}

export interface AlertPrefs {
  /** Minimum impact level to trigger alerts */
  impactThreshold: 'high' | 'high+medium';
  /** Enable sound for high-impact alerts */
  soundEnabled: boolean;
  /** Enable quiet hours (no alerts during this time) */
  quietHoursEnabled: boolean;
  /** Quiet hours start time (HH:mm) */
  quietStart: string;
  /** Quiet hours end time (HH:mm) */
  quietEnd: string;
}

interface AlertState {
  alerts: AlertItem[];
  prefs: AlertPrefs;

  // Computed
  getUnreadCount: () => number;

  // Actions
  pushAlert: (alert: Omit<AlertItem, 'id' | 'read'>) => void;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAlerts: () => void;
  setPrefs: (prefs: Partial<AlertPrefs>) => void;

  // Helpers
  isQuietNow: () => boolean;
}

const DEFAULT_PREFS: AlertPrefs = {
  impactThreshold: 'high+medium',
  soundEnabled: true,
  quietHoursEnabled: false,
  quietStart: '22:00',
  quietEnd: '08:00',
};

const MAX_ALERTS = 50;

export const useAlertStore = create<AlertState>()(
  persist(
    (set, get) => ({
      alerts: [],
      prefs: DEFAULT_PREFS,

      getUnreadCount: () => {
        return get().alerts.filter((a) => !a.read).length;
      },

      pushAlert: (alertData) => {
        const id = `alert_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const newAlert: AlertItem = {
          ...alertData,
          id,
          read: false,
        };

        set((state) => ({
          alerts: [newAlert, ...state.alerts].slice(0, MAX_ALERTS),
        }));
      },

      markRead: (id) => {
        set((state) => ({
          alerts: state.alerts.map((a) =>
            a.id === id ? { ...a, read: true } : a
          ),
        }));
      },

      markAllRead: () => {
        set((state) => ({
          alerts: state.alerts.map((a) => ({ ...a, read: true })),
        }));
      },

      clearAlerts: () => {
        set({ alerts: [] });
      },

      setPrefs: (newPrefs) => {
        set((state) => ({
          prefs: { ...state.prefs, ...newPrefs },
        }));
      },

      isQuietNow: () => {
        const { prefs } = get();
        if (!prefs.quietHoursEnabled) return false;

        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();

        const [startHour, startMin] = prefs.quietStart.split(':').map(Number);
        const [endHour, endMin] = prefs.quietEnd.split(':').map(Number);

        const startMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;

        // Handle overnight quiet hours (e.g., 22:00 - 08:00)
        if (startMinutes > endMinutes) {
          // Quiet if after start OR before end
          return currentMinutes >= startMinutes || currentMinutes < endMinutes;
        } else {
          // Quiet if between start and end
          return currentMinutes >= startMinutes && currentMinutes < endMinutes;
        }
      },
    }),
    {
      name: 'swaperex-alerts',
      version: 1,
      partialize: (state) => ({
        alerts: state.alerts,
        prefs: state.prefs,
      }),
    }
  )
);

// Convenience selectors
export const useAlerts = () => useAlertStore((s) => s.alerts);
export const useAlertPrefs = () => useAlertStore((s) => s.prefs);
export const useUnreadAlertCount = () => useAlertStore((s) => s.getUnreadCount());
