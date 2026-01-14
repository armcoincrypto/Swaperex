/**
 * Signal Debug Types
 *
 * Debug information returned when debug=1 query param is set.
 * Only for development/advanced users.
 */

export interface LiquidityCheck {
  passed: boolean;
  currentLiquidity: number | null;
  previousLiquidity: number | null;
  dropPct: number | null;
  threshold: number; // 25% drop threshold
  reason: string;
}

export interface RiskCheck {
  passed: boolean;
  riskFactorCount: number;
  riskFactors: string[];
  isHoneypot: boolean;
  reason: string;
}

export interface CooldownStatus {
  active: boolean;
  remainingSeconds: number;
  startedAt: number | null;
  expiresAt: number | null;
  lastSeverity: string | null;
}

export interface SignalDebug {
  checks: {
    liquidity: LiquidityCheck;
    risk: RiskCheck;
  };
  cooldown: CooldownStatus;
  confidence: number | null;
  severity: string | null;
  escalated: boolean;
  evaluatedAt: number;
  version: string;
}

export interface SignalResponseWithDebug {
  liquidity?: {
    dropPct: number;
    window: string;
    severity: string;
    confidence: number;
    escalated?: boolean;
    previous?: string;
  } | null;
  risk?: {
    status: string;
    severity: string;
    confidence: number;
    riskFactors: string[];
    escalated?: boolean;
    previous?: string;
  } | null;
  timestamp: number;
  debug?: SignalDebug;
}
