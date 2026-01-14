/**
 * Signal Alerts Hook
 *
 * Hooks alert system into signal history.
 * Fires alerts only when new signals are actually added.
 *
 * Priority 12.1-12.2 - In-App Alerts
 */

import { useEffect, useRef, useCallback } from 'react';
import { useSignalHistoryStore, type SignalHistoryEntry } from '@/stores/signalHistoryStore';
import { useAlertStore } from '@/stores/alertStore';
import { shouldAlert, buildAlertItem, playAlertSound } from '@/utils/alerts';

// Toast state (simple global for now)
let toastCallback: ((alert: { title: string; body: string; level: string }) => void) | null = null;

export function setToastCallback(cb: typeof toastCallback) {
  toastCallback = cb;
}

/**
 * Hook to monitor signal history and fire alerts
 * Call this once at app level (e.g., in App.tsx or RadarPanel)
 */
export function useSignalAlerts() {
  const entries = useSignalHistoryStore((s) => s.entries);
  const { pushAlert, prefs, isQuietNow } = useAlertStore();
  const prevEntriesRef = useRef<SignalHistoryEntry[]>([]);
  const initializedRef = useRef(false);

  // Process new entries
  const processNewEntries = useCallback((newEntries: SignalHistoryEntry[]) => {
    const quiet = isQuietNow();

    for (const entry of newEntries) {
      // Check if this entry should trigger an alert
      if (shouldAlert(entry, prefs, quiet)) {
        // Build and push alert
        const alertItem = buildAlertItem(entry);
        pushAlert(alertItem);

        // Play sound for high impact (if enabled and not quiet)
        if (entry.impact?.level === 'high' && prefs.soundEnabled && !quiet) {
          playAlertSound();
        }

        // Show toast
        if (toastCallback) {
          const typeLabel = entry.type === 'risk' ? 'Risk' : 'Liquidity';
          const impactEmoji =
            entry.impact?.level === 'high'
              ? '🔥'
              : entry.impact?.level === 'medium'
              ? '⚠️'
              : 'ℹ️';

          toastCallback({
            title: `${impactEmoji} ${typeLabel} Alert`,
            body: `${entry.tokenSymbol || entry.token.slice(0, 8)}... - ${entry.reason}`,
            level: entry.impact?.level || 'low',
          });
        }

        console.log('[SignalAlerts] Alert fired for:', entry.type, entry.token);
      }
    }
  }, [prefs, isQuietNow, pushAlert]);

  // Watch for new entries
  useEffect(() => {
    // Skip first render (don't alert on existing entries when page loads)
    if (!initializedRef.current) {
      prevEntriesRef.current = entries;
      initializedRef.current = true;
      return;
    }

    // Find truly new entries (not in previous snapshot)
    const prevIds = new Set(prevEntriesRef.current.map((e) => e.id));
    const newEntries = entries.filter((e) => !prevIds.has(e.id));

    if (newEntries.length > 0) {
      processNewEntries(newEntries);
    }

    // Update ref for next comparison
    prevEntriesRef.current = entries;
  }, [entries, processNewEntries]);
}

/**
 * Manually trigger an alert (for testing)
 */
export function triggerTestAlert(
  type: 'risk' | 'liquidity',
  impactLevel: 'high' | 'medium' | 'low'
) {
  const { pushAlert, prefs, isQuietNow } = useAlertStore.getState();
  const quiet = isQuietNow();

  const mockEntry: Omit<SignalHistoryEntry, 'id' | 'stateHash'> = {
    token: '0xTEST' + Math.random().toString(36).slice(2, 8),
    tokenSymbol: 'TEST',
    chainId: 1,
    type,
    severity: impactLevel === 'high' ? 'critical' : impactLevel === 'medium' ? 'danger' : 'warning',
    confidence: 0.85,
    reason: `Test ${type} signal with ${impactLevel} impact`,
    timestamp: Date.now(),
    impact: {
      level: impactLevel,
      score: impactLevel === 'high' ? 85 : impactLevel === 'medium' ? 55 : 25,
      reason: 'Test alert',
    },
  };

  // Check if alert should fire based on prefs
  if (!shouldAlert(mockEntry, prefs, quiet)) {
    console.log('[SignalAlerts] Test alert suppressed (threshold or quiet hours)');
    return false;
  }

  const alertItem = buildAlertItem(mockEntry as SignalHistoryEntry);
  pushAlert(alertItem);

  // Play sound for high impact
  if (impactLevel === 'high' && prefs.soundEnabled && !quiet) {
    playAlertSound();
  }

  // Show toast
  if (toastCallback) {
    const typeLabel = type === 'risk' ? 'Risk' : 'Liquidity';
    const impactEmoji =
      impactLevel === 'high' ? '🔥' : impactLevel === 'medium' ? '⚠️' : 'ℹ️';

    toastCallback({
      title: `${impactEmoji} ${typeLabel} Alert (Test)`,
      body: `TEST token - Test ${type} signal`,
      level: impactLevel,
    });
  }

  console.log('[SignalAlerts] Test alert fired:', type, impactLevel);
  return true;
}
