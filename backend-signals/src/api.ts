import { checkLiquidityDrop, type LiquidityResult } from "./signals/liquidity.js";
import { checkRiskChange, type RiskResult } from "./signals/risk.js";
import type { SignalDebug } from "./types/SignalDebug.js";

const VERSION = "1.0.0";

export interface SignalsResponse {
  liquidity?: LiquidityResult["signal"];
  risk?: RiskResult["signal"];
  timestamp: number;
  debug?: {
    liquidity: LiquidityResult["debug"];
    risk: RiskResult["debug"];
    evaluatedAt: number;
    version: string;
  };
}

export async function getSignals(
  chainId: number,
  token: string,
  includeDebug: boolean = false
): Promise<SignalsResponse> {
  const [liquidityResult, riskResult] = await Promise.all([
    checkLiquidityDrop(chainId, token, includeDebug),
    checkRiskChange(chainId, token, includeDebug)
  ]);

  const response: SignalsResponse = {
    timestamp: Date.now()
  };

  // Add signals if they exist
  if (liquidityResult.signal) {
    response.liquidity = liquidityResult.signal;
  }

  if (riskResult.signal) {
    response.risk = riskResult.signal;
  }

  // Add debug info if requested
  if (includeDebug) {
    response.debug = {
      liquidity: liquidityResult.debug,
      risk: riskResult.debug,
      evaluatedAt: Date.now(),
      version: VERSION,
    };
  }

  return response;
}
