/**
 * Signals Health Checker
 *
 * Simple health check for the backend signals service.
 * Silent failure by design - never throws, never retries.
 */

// Use environment variable or default to production URL
const SIGNALS_API_URL = import.meta.env.VITE_SIGNALS_API_URL || 'http://207.180.212.142:4001';

export interface SignalsHealthResponse {
  status: string;
  version: string;
  uptime: number;
  signalsEnabled: boolean;
  timestamp: number;
}

/**
 * Check if the signals backend is healthy and enabled.
 * Returns true if healthy, false otherwise.
 * Never throws - silent failure by design.
 */
export async function checkSignalsHealth(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const res = await fetch(`${SIGNALS_API_URL}/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) return false;

    const data: SignalsHealthResponse = await res.json();
    return data.status === 'ok' && data.signalsEnabled !== false;
  } catch {
    // Silent failure - network error, timeout, or abort
    return false;
  }
}

/**
 * Get full health details (for debugging/logging).
 * Returns null on failure.
 */
export async function getSignalsHealthDetails(): Promise<SignalsHealthResponse | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(`${SIGNALS_API_URL}/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) return null;

    return await res.json();
  } catch {
    return null;
  }
}
