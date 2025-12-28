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

/**
 * Signal debug data types
 */
export interface SignalDebugData {
  liquidity: {
    check: {
      passed: boolean;
      currentLiquidity: number | null;
      previousLiquidity: number | null;
      dropPct: number | null;
      threshold: number;
      reason: string;
    };
    cooldown: {
      active: boolean;
      remainingSeconds: number;
      startedAt: number | null;
      expiresAt: number | null;
      lastSeverity: string | null;
    };
  };
  risk: {
    check: {
      passed: boolean;
      riskFactorCount: number;
      riskFactors: string[];
      isHoneypot: boolean;
      reason: string;
    };
    cooldown: {
      active: boolean;
      remainingSeconds: number;
      startedAt: number | null;
      expiresAt: number | null;
      lastSeverity: string | null;
    };
  };
  evaluatedAt: number;
  version: string;
}

export interface SignalsResponse {
  liquidity?: {
    dropPct: number;
    window: string;
    severity: string;
    confidence: number;
    escalated?: boolean;
    previous?: string;
  };
  risk?: {
    status: string;
    severity: string;
    confidence: number;
    riskFactors: string[];
    escalated?: boolean;
    previous?: string;
  };
  timestamp: number;
  debug?: SignalDebugData;
}

/**
 * Fetch signals for a token with optional debug data.
 * Returns null on failure.
 */
export async function fetchSignals(
  chainId: number,
  token: string,
  includeDebug: boolean = false
): Promise<SignalsResponse | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

    const debugParam = includeDebug ? '&debug=1' : '';
    const res = await fetch(
      `${SIGNALS_API_URL}/api/v1/signals?chainId=${chainId}&token=${token}${debugParam}`,
      {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
      }
    );

    clearTimeout(timeoutId);

    if (!res.ok) return null;

    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Fetch signals and automatically record to history.
 * This is the main function to use for signal fetching with history capture.
 */
export async function fetchSignalsWithHistory(
  chainId: number,
  token: string,
  tokenSymbol?: string,
  captureToHistory?: (entry: SignalHistoryCapture) => void
): Promise<SignalsResponse | null> {
  // Always include debug for history capture
  const response = await fetchSignals(chainId, token, true);

  if (!response || !captureToHistory) {
    return response;
  }

  // Capture liquidity signal to history
  if (response.liquidity) {
    captureToHistory({
      token,
      tokenSymbol,
      chainId,
      type: 'liquidity',
      severity: response.liquidity.severity as 'warning' | 'danger' | 'critical',
      confidence: response.liquidity.confidence,
      reason: response.debug?.liquidity.check.reason || `Liquidity dropped ${response.liquidity.dropPct}%`,
      debugSnapshot: response.debug ? {
        liquidity: {
          currentLiquidity: response.debug.liquidity.check.currentLiquidity,
          dropPct: response.debug.liquidity.check.dropPct,
          threshold: response.debug.liquidity.check.threshold,
        },
        cooldown: {
          active: response.debug.liquidity.cooldown.active,
          remainingSeconds: response.debug.liquidity.cooldown.remainingSeconds,
        },
      } : undefined,
      escalated: response.liquidity.escalated,
      previousSeverity: response.liquidity.previous,
    });
  }

  // Capture risk signal to history
  if (response.risk) {
    captureToHistory({
      token,
      tokenSymbol,
      chainId,
      type: 'risk',
      severity: response.risk.severity as 'warning' | 'danger' | 'critical',
      confidence: response.risk.confidence,
      reason: response.debug?.risk.check.reason || `${response.risk.riskFactors.length} risk factors detected`,
      debugSnapshot: response.debug ? {
        risk: {
          riskFactorCount: response.debug.risk.check.riskFactorCount,
          riskFactors: response.debug.risk.check.riskFactors,
          isHoneypot: response.debug.risk.check.isHoneypot,
        },
        cooldown: {
          active: response.debug.risk.cooldown.active,
          remainingSeconds: response.debug.risk.cooldown.remainingSeconds,
        },
      } : undefined,
      escalated: response.risk.escalated,
      previousSeverity: response.risk.previous,
    });
  }

  return response;
}

/**
 * Type for signal history capture
 */
export interface SignalHistoryCapture {
  token: string;
  tokenSymbol?: string;
  chainId: number;
  type: 'liquidity' | 'risk';
  severity: 'warning' | 'danger' | 'critical';
  confidence: number;
  reason: string;
  debugSnapshot?: {
    liquidity?: {
      currentLiquidity: number | null;
      dropPct: number | null;
      threshold: number;
    };
    risk?: {
      riskFactorCount: number;
      riskFactors: string[];
      isHoneypot: boolean;
    };
    cooldown?: {
      active: boolean;
      remainingSeconds: number;
    };
  };
  escalated?: boolean;
  previousSeverity?: string;
}
