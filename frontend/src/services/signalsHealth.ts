/**
 * Signals Health Checker
 *
 * HTTP client layer for the backend signals service.
 * Supports v2 schema (providers, overallSeverity) with v1 fallback.
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

// ── Types ──────────────────────────────────────────────────────────

export type ProviderStatus = 'ok' | 'unavailable' | 'timeout' | 'error';
export type OverallSeverity = 'critical' | 'danger' | 'warning' | 'safe' | 'unknown';

export interface ProviderInfo {
  status: ProviderStatus;
  latencyMs: number;
  error?: string;
}

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
  } | null;
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
  } | null;
  evaluatedAt: number;
  version: string;
}

export interface ImpactScore {
  score: number;
  level: 'high' | 'medium' | 'low';
  reason: string;
}

export interface RecurrenceInfo {
  occurrences24h: number;
  lastSeen: number | null;
  isRepeat: boolean;
  trend: 'increasing' | 'decreasing' | 'stable' | 'new';
  previousImpact: number | null;
  timeSinceLastSeconds: number | null;
}

export interface SignalsResponse {
  liquidity?: {
    dropPct: number;
    window: string;
    severity: string;
    confidence: number;
    impact: ImpactScore;
    recurrence: RecurrenceInfo;
    escalated?: boolean;
    previous?: string;
  };
  risk?: {
    status: string;
    severity: string;
    confidence: number;
    riskFactors: string[];
    impact: ImpactScore;
    recurrence: RecurrenceInfo;
    escalated?: boolean;
    previous?: string;
  };
  overallSeverity?: OverallSeverity;
  timestamp: number;
  providers?: {
    dexscreener: ProviderInfo;
    goplus: ProviderInfo;
  };
  debug?: SignalDebugData;
}

// ── Fetch Functions ─────────────────────────────────────────────

/** In-flight request deduplication */
const inflight = new Map<string, Promise<SignalsResponse | null>>();

/** Response cache with TTL */
const responseCache = new Map<string, { data: SignalsResponse; expiresAt: number }>();
const CACHE_TTL_MS = 30_000; // 30 seconds

function getCacheKey(chainId: number, token: string): string {
  return `${chainId}:${token.toLowerCase()}`;
}

/**
 * Fetch signals for a token with optional debug data.
 * Includes deduplication and short-lived cache.
 * Returns null on failure.
 */
export async function fetchSignals(
  chainId: number,
  token: string,
  includeDebug: boolean = false
): Promise<SignalsResponse | null> {
  const key = getCacheKey(chainId, token);

  // Check response cache
  const cached = responseCache.get(key);
  if (cached && Date.now() < cached.expiresAt && !includeDebug) {
    return cached.data;
  }

  // Dedup concurrent requests
  const inflightKey = `${key}:${includeDebug ? 'd' : 'n'}`;
  const existing = inflight.get(inflightKey);
  if (existing) return existing;

  const promise = _doFetch(chainId, token, includeDebug);
  inflight.set(inflightKey, promise);

  try {
    const result = await promise;
    // Cache successful responses
    if (result) {
      responseCache.set(key, { data: result, expiresAt: Date.now() + CACHE_TTL_MS });
    }
    return result;
  } finally {
    inflight.delete(inflightKey);
  }
}

async function _doFetch(
  chainId: number,
  token: string,
  includeDebug: boolean
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

    const data: SignalsResponse = await res.json();

    // Backwards compat: if no overallSeverity (v1), compute it client-side
    if (!data.overallSeverity) {
      data.overallSeverity = computeClientSeverity(data);
    }

    // Backwards compat: if no providers (v1), mark as unknown
    if (!data.providers) {
      data.providers = {
        dexscreener: { status: 'ok', latencyMs: 0 },
        goplus: { status: 'ok', latencyMs: 0 },
      };
    }

    return data;
  } catch {
    return null;
  }
}

/**
 * Client-side severity computation (v1 fallback)
 */
function computeClientSeverity(response: SignalsResponse): OverallSeverity {
  const severities: string[] = [];
  if (response.liquidity) severities.push(response.liquidity.severity);
  if (response.risk) severities.push(response.risk.severity);

  if (severities.length === 0) return 'safe';
  if (severities.includes('critical')) return 'critical';
  if (severities.includes('danger')) return 'danger';
  if (severities.includes('warning')) return 'warning';
  return 'safe';
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
      reason: response.debug?.liquidity?.check.reason || `Liquidity dropped ${response.liquidity.dropPct}%`,
      impact: response.liquidity.impact,
      recurrence: response.liquidity.recurrence,
      debugSnapshot: response.debug?.liquidity ? {
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
      reason: response.debug?.risk?.check.reason || `${response.risk.riskFactors.length} risk factors detected`,
      impact: response.risk.impact,
      recurrence: response.risk.recurrence,
      debugSnapshot: response.debug?.risk ? {
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
 * Clear the response cache (e.g., when user wants fresh data)
 */
export function clearSignalsCache(): void {
  responseCache.clear();
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
  impact?: ImpactScore;
  recurrence?: RecurrenceInfo;
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

// ── Human-readable explanations ─────────────────────────────────

export const SEVERITY_EXPLANATIONS: Record<string, string> = {
  critical: 'This token shows critical risk indicators. Trading may result in total loss of funds. Avoid interacting with this contract.',
  danger: 'Multiple risk factors detected. Exercise extreme caution. Verify the project thoroughly before interacting.',
  warning: 'Some risk indicators found. This is common for newer tokens. Research the project before investing.',
  safe: 'No active risk signals detected. This does not guarantee safety - always do your own research.',
};

export const RISK_FACTOR_EXPLANATIONS: Record<string, string> = {
  honeypot: 'This token cannot be sold after purchase. Your funds will be permanently locked.',
  blacklisted: 'The contract has a blacklist function that can freeze your tokens.',
  proxy_contract: 'The contract logic can be changed by the owner at any time.',
  ownership_takeback: 'The previous owner can reclaim control of the contract.',
  owner_can_modify_balance: 'The contract owner can change token balances directly.',
  hidden_owner: 'The contract has a hidden owner address that can execute privileged functions.',
  can_selfdestruct: 'The contract can be destroyed, making all tokens worthless.',
  external_calls: 'The contract makes external calls that could be exploited.',
  mintable: 'New tokens can be minted, potentially diluting your holdings.',
  transfer_pausable: 'Token transfers can be paused by the contract owner.',
  trading_cooldown: 'There is a mandatory waiting period between trades.',
  cannot_sell_all: 'You cannot sell your entire balance in a single transaction.',
  slippage_modifiable: 'The contract owner can change the buy/sell tax at any time.',
};

export const LIQUIDITY_EXPLANATIONS: Record<string, string> = {
  critical: 'Liquidity dropped severely. This often indicates a rug pull in progress. Exit immediately if possible.',
  danger: 'Major liquidity decrease detected. The trading pair is becoming unstable.',
  warning: 'Noticeable liquidity drop. Monitor closely for further changes.',
};
