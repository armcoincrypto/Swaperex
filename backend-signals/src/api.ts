import { checkLiquidityDrop, type LiquidityResult } from "./signals/liquidity.js";
import { checkRiskChange, type RiskResult } from "./signals/risk.js";

const VERSION = "2.0.0";

/** Per-provider timeout (ms) */
const PROVIDER_TIMEOUT_MS = 8000;

export type ProviderStatus = "ok" | "unavailable" | "timeout" | "error";

export interface ProviderInfo {
  status: ProviderStatus;
  latencyMs: number;
  error?: string;
}

export type OverallSeverity = "critical" | "danger" | "warning" | "safe" | "unknown";

export interface SignalsResponse {
  liquidity?: LiquidityResult["signal"];
  risk?: RiskResult["signal"];
  overallSeverity: OverallSeverity;
  timestamp: number;
  providers: {
    dexscreener: ProviderInfo;
    goplus: ProviderInfo;
  };
  debug?: {
    liquidity: LiquidityResult["debug"] | null;
    risk: RiskResult["debug"] | null;
    evaluatedAt: number;
    version: string;
  };
}

/**
 * Determine overall severity from liquidity + risk results.
 * Picks the worst severity found across all active signals.
 */
function computeOverallSeverity(
  liquiditySignal: LiquidityResult["signal"] | undefined,
  riskSignal: RiskResult["signal"] | undefined
): OverallSeverity {
  const severityOrder: Record<string, number> = {
    critical: 4,
    danger: 3,
    warning: 2,
    safe: 1,
  };

  let worst = 0;

  if (liquiditySignal) {
    worst = Math.max(worst, severityOrder[liquiditySignal.severity] || 0);
  }
  if (riskSignal) {
    worst = Math.max(worst, severityOrder[riskSignal.severity] || 0);
  }

  // If no signals fired, check if providers returned data successfully
  // No signals = safe (providers worked but nothing to report)
  if (worst === 0) return "safe";

  const reverseMap: Record<number, OverallSeverity> = {
    4: "critical",
    3: "danger",
    2: "warning",
    1: "safe",
  };

  return reverseMap[worst] || "unknown";
}

/**
 * Run a provider check with timeout and graceful error handling.
 * Never throws - returns null result with error info on failure.
 */
async function runWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number
): Promise<{ result: T | null; latencyMs: number; status: ProviderStatus; error?: string }> {
  const start = Date.now();

  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Provider timeout")), timeoutMs)
      ),
    ]);

    return {
      result,
      latencyMs: Date.now() - start,
      status: "ok",
    };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message = (err as Error).message || "Unknown error";
    const isTimeout = message.includes("timeout") || message.includes("Timeout");

    return {
      result: null,
      latencyMs,
      status: isTimeout ? "timeout" : "error",
      error: message,
    };
  }
}

export async function getSignals(
  chainId: number,
  token: string,
  includeDebug: boolean = false
): Promise<SignalsResponse> {
  // Run both providers independently with timeouts
  const [liquidityOutcome, riskOutcome] = await Promise.all([
    runWithTimeout(
      () => checkLiquidityDrop(chainId, token, includeDebug),
      PROVIDER_TIMEOUT_MS
    ),
    runWithTimeout(
      () => checkRiskChange(chainId, token, includeDebug),
      PROVIDER_TIMEOUT_MS
    ),
  ]);

  // Extract signals (null if provider failed)
  const liquiditySignal = liquidityOutcome.result?.signal ?? undefined;
  const riskSignal = riskOutcome.result?.signal ?? undefined;

  // Compute overall severity
  const overallSeverity = computeOverallSeverity(liquiditySignal, riskSignal);

  // Determine provider statuses
  // If the provider call succeeded but returned no signal, that's still "ok"
  const dexscreenerStatus: ProviderInfo = {
    status: liquidityOutcome.status,
    latencyMs: liquidityOutcome.latencyMs,
    ...(liquidityOutcome.error && { error: liquidityOutcome.error }),
  };

  const goplusStatus: ProviderInfo = {
    status: riskOutcome.status,
    latencyMs: riskOutcome.latencyMs,
    ...(riskOutcome.error && { error: riskOutcome.error }),
  };

  const response: SignalsResponse = {
    overallSeverity,
    timestamp: Date.now(),
    providers: {
      dexscreener: dexscreenerStatus,
      goplus: goplusStatus,
    },
  };

  // Add signals if they exist
  if (liquiditySignal) {
    response.liquidity = liquiditySignal;
  }

  if (riskSignal) {
    response.risk = riskSignal;
  }

  // Add debug info if requested
  if (includeDebug) {
    response.debug = {
      liquidity: liquidityOutcome.result?.debug ?? null,
      risk: riskOutcome.result?.debug ?? null,
      evaluatedAt: Date.now(),
      version: VERSION,
    };
  }

  return response;
}
