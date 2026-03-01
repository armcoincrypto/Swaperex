/**
 * Usage Tracking Store
 *
 * Tracks feature usage locally. Ready for future server sync.
 * NO tracking of personal data. NO wallet addresses stored.
 * Aggregated metrics only.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// Usage event types
export type UsageEvent =
  | 'swap_completed'
  | 'preset_used'
  | 'preset_created'
  | 'signal_viewed'
  | 'alert_toggled'
  | 'intelligence_expanded'
  | 'screener_used'
  | 'radar_viewed'
  | 'token_imported'
  | 'guard_triggered';

// Daily usage stats
interface DailyStats {
  date: string; // YYYY-MM-DD
  swaps: number;
  presetUses: number;
  signalViews: number;
}

// Lifetime counters
interface LifetimeCounters {
  totalSwaps: number;
  totalPresetUses: number;
  totalPresetsCreated: number;
  totalSignalViews: number;
  totalAlertsToggled: number;
  totalTokensImported: number;
  totalGuardsTriggered: number;
}

// Session info (non-persisted)
interface SessionInfo {
  sessionStart: number;
  eventsThisSession: number;
}

interface UsageState {
  // Lifetime counters
  lifetime: LifetimeCounters;

  // Daily stats (last 7 days)
  dailyStats: DailyStats[];

  // First use timestamp
  firstUseAt: number | null;

  // Session info
  session: SessionInfo;

  // Actions
  trackEvent: (event: UsageEvent) => void;
  getLifetimeCount: (event: UsageEvent) => number;
  getDailyStats: () => DailyStats[];
  getDaysSinceFirstUse: () => number;
  getSessionDuration: () => number;
}

// Get today's date string
function getTodayString(): string {
  return new Date().toISOString().split('T')[0];
}

// Map event to counter key
function getCounterKey(event: UsageEvent): keyof LifetimeCounters | null {
  const mapping: Record<UsageEvent, keyof LifetimeCounters | null> = {
    swap_completed: 'totalSwaps',
    preset_used: 'totalPresetUses',
    preset_created: 'totalPresetsCreated',
    signal_viewed: 'totalSignalViews',
    alert_toggled: 'totalAlertsToggled',
    intelligence_expanded: null, // Don't track this in lifetime
    screener_used: null,
    radar_viewed: null,
    token_imported: 'totalTokensImported',
    guard_triggered: 'totalGuardsTriggered',
  };
  return mapping[event];
}

// Initial state
const initialLifetime: LifetimeCounters = {
  totalSwaps: 0,
  totalPresetUses: 0,
  totalPresetsCreated: 0,
  totalSignalViews: 0,
  totalAlertsToggled: 0,
  totalTokensImported: 0,
  totalGuardsTriggered: 0,
};

export const useUsageStore = create<UsageState>()(
  persist(
    (set, get) => ({
      lifetime: initialLifetime,
      dailyStats: [],
      firstUseAt: null,
      session: {
        sessionStart: Date.now(),
        eventsThisSession: 0,
      },

      trackEvent: (event) => {
        const today = getTodayString();
        const counterKey = getCounterKey(event);

        set((state) => {
          // Update lifetime counter if applicable
          const newLifetime = counterKey
            ? {
                ...state.lifetime,
                [counterKey]: state.lifetime[counterKey] + 1,
              }
            : state.lifetime;

          // Update daily stats
          let newDailyStats = [...state.dailyStats];
          const todayIndex = newDailyStats.findIndex((s) => s.date === today);

          if (todayIndex >= 0) {
            // Update existing day
            const dayStat = { ...newDailyStats[todayIndex] };
            if (event === 'swap_completed') dayStat.swaps++;
            if (event === 'preset_used') dayStat.presetUses++;
            if (event === 'signal_viewed') dayStat.signalViews++;
            newDailyStats[todayIndex] = dayStat;
          } else {
            // Create new day entry
            newDailyStats.push({
              date: today,
              swaps: event === 'swap_completed' ? 1 : 0,
              presetUses: event === 'preset_used' ? 1 : 0,
              signalViews: event === 'signal_viewed' ? 1 : 0,
            });
          }

          // Keep only last 7 days
          if (newDailyStats.length > 7) {
            newDailyStats = newDailyStats.slice(-7);
          }

          // Set first use timestamp if not set
          const firstUseAt = state.firstUseAt || Date.now();

          return {
            lifetime: newLifetime,
            dailyStats: newDailyStats,
            firstUseAt,
            session: {
              ...state.session,
              eventsThisSession: state.session.eventsThisSession + 1,
            },
          };
        });
      },

      getLifetimeCount: (event) => {
        const counterKey = getCounterKey(event);
        if (!counterKey) return 0;
        return get().lifetime[counterKey];
      },

      getDailyStats: () => {
        return get().dailyStats;
      },

      getDaysSinceFirstUse: () => {
        const firstUse = get().firstUseAt;
        if (!firstUse) return 0;
        const days = Math.floor((Date.now() - firstUse) / (1000 * 60 * 60 * 24));
        return days;
      },

      getSessionDuration: () => {
        return Math.floor((Date.now() - get().session.sessionStart) / 1000);
      },
    }),
    {
      name: 'swaperex-usage',
      version: 1,
      partialize: (state) => ({
        lifetime: state.lifetime,
        dailyStats: state.dailyStats,
        firstUseAt: state.firstUseAt,
        // Don't persist session info
      }),
    }
  )
);

/**
 * Hook for tracking usage events
 * Use this in components to track user actions
 */
export function useUsageTracker() {
  const { trackEvent, getLifetimeCount, getDaysSinceFirstUse } = useUsageStore();

  return {
    trackSwap: () => trackEvent('swap_completed'),
    trackPresetUsed: () => trackEvent('preset_used'),
    trackPresetCreated: () => trackEvent('preset_created'),
    trackSignalViewed: () => trackEvent('signal_viewed'),
    trackAlertToggled: () => trackEvent('alert_toggled'),
    trackIntelligenceExpanded: () => trackEvent('intelligence_expanded'),
    trackScreenerUsed: () => trackEvent('screener_used'),
    trackRadarViewed: () => trackEvent('radar_viewed'),
    trackTokenImported: () => trackEvent('token_imported'),
    trackGuardTriggered: () => trackEvent('guard_triggered'),

    // Stats
    getTotalSwaps: () => getLifetimeCount('swap_completed'),
    getTotalPresets: () => getLifetimeCount('preset_created'),
    getDaysSinceFirstUse,
  };
}

export default useUsageStore;
