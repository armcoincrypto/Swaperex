/**
 * Alert State Storage
 *
 * Tracks last alert state per wallet+token+type for escalation detection.
 * Minimal storage - no schema redesign, no historical backfill.
 *
 * Sprint: Telegram Alert Intelligence
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATE_FILE = join(__dirname, "../../data/telegram_alert_state.json");

export interface AlertState {
  lastImpact: "high" | "medium" | "low";
  lastConfidence: number; // 0-1
  lastLiquidity?: number; // percentage drop, e.g., -30 means 30% drop
  lastAlertAt: number; // timestamp
}

// Key format: walletAddress:tokenAddress:signalType
type StateKey = string;

// In-memory cache
let alertStates: Map<StateKey, AlertState> = new Map();
let loaded = false;

/**
 * Ensure data directory exists
 */
function ensureDataDir(): void {
  const dataDir = join(__dirname, "../../data");
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }
}

/**
 * Load alert states from disk
 */
function loadStates(): void {
  if (loaded) return;

  ensureDataDir();

  try {
    if (existsSync(STATE_FILE)) {
      const data = JSON.parse(readFileSync(STATE_FILE, "utf-8"));
      alertStates = new Map(Object.entries(data));
      console.log(`[AlertState] Loaded ${alertStates.size} alert states`);
    }
  } catch (err) {
    console.error("[AlertState] Failed to load states:", err);
    alertStates = new Map();
  }

  loaded = true;
}

/**
 * Save alert states to disk
 */
function saveStates(): void {
  ensureDataDir();
  try {
    writeFileSync(STATE_FILE, JSON.stringify(Object.fromEntries(alertStates), null, 2));
  } catch (err) {
    console.error("[AlertState] Failed to save states:", err);
  }
}

/**
 * Generate state key
 */
function getStateKey(walletAddress: string, tokenAddress: string, signalType: string): StateKey {
  return `${walletAddress.toLowerCase()}:${tokenAddress.toLowerCase()}:${signalType}`;
}

/**
 * Get last alert state
 */
export function getLastAlertState(
  walletAddress: string,
  tokenAddress: string,
  signalType: string
): AlertState | null {
  loadStates();
  const key = getStateKey(walletAddress, tokenAddress, signalType);
  return alertStates.get(key) || null;
}

/**
 * Update alert state after sending notification
 */
export function updateAlertState(
  walletAddress: string,
  tokenAddress: string,
  signalType: string,
  state: Omit<AlertState, "lastAlertAt">
): void {
  loadStates();
  const key = getStateKey(walletAddress, tokenAddress, signalType);

  alertStates.set(key, {
    ...state,
    lastAlertAt: Date.now(),
  });

  saveStates();
  console.log(`[AlertState] Updated state for ${key}`);
}

/**
 * Escalation reason types
 */
export type EscalationReason =
  | "impact_escalated"
  | "confidence_threshold_crossed"
  | "liquidity_worsened"
  | null;

/**
 * Check if current signal represents an escalation from last alert state.
 * Returns the escalation reason or null if no escalation.
 *
 * Escalation Conditions:
 * A) Impact: Medium → High
 * B) Confidence: +15% AND crosses user threshold
 * C) Liquidity: Worsens by ≥10% from last alert
 */
export function checkEscalation(
  lastState: AlertState | null,
  currentImpact: "high" | "medium" | "low",
  currentConfidence: number,
  currentLiquidity: number | undefined,
  userConfidenceThreshold: number // e.g., 0.8 for 80%
): EscalationReason {
  // If no previous alert, this is the first alert - allow it
  if (!lastState) {
    return "impact_escalated"; // Treat first alert as escalation
  }

  // A) Impact Escalation: Medium → High
  if (lastState.lastImpact === "medium" && currentImpact === "high") {
    return "impact_escalated";
  }

  // B) Confidence Escalation: +15% AND crosses threshold
  const confidenceIncrease = currentConfidence - lastState.lastConfidence;
  const crossedThreshold =
    lastState.lastConfidence < userConfidenceThreshold &&
    currentConfidence >= userConfidenceThreshold;

  if (confidenceIncrease >= 0.15 && crossedThreshold) {
    return "confidence_threshold_crossed";
  }

  // C) Liquidity Worsening: ≥10% worse than last alert
  if (
    currentLiquidity !== undefined &&
    lastState.lastLiquidity !== undefined
  ) {
    // Both are negative percentages (drops), e.g., -30 means 30% drop
    // Worsening means going more negative
    const worseningAmount = currentLiquidity - lastState.lastLiquidity;
    if (worseningAmount <= -10) {
      // e.g., -30 → -45 is a 15% worsening
      return "liquidity_worsened";
    }
  }

  // No escalation detected
  return null;
}

/**
 * Get human-readable "Why now" text for escalation reason
 */
export function getWhyNowText(
  reason: EscalationReason,
  userConfidenceThreshold: number
): string {
  switch (reason) {
    case "impact_escalated":
      return "Why now: Impact escalated to High";
    case "confidence_threshold_crossed":
      return `Why now: Confidence crossed your ${Math.round(userConfidenceThreshold * 100)}% threshold`;
    case "liquidity_worsened":
      return "Why now: Liquidity dropped further since last alert";
    default:
      return "";
  }
}

/**
 * Clean up old states (states older than 7 days)
 */
export function cleanupOldStates(): void {
  loadStates();
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  let cleaned = 0;

  for (const [key, state] of alertStates) {
    if (state.lastAlertAt < cutoff) {
      alertStates.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    saveStates();
    console.log(`[AlertState] Cleaned ${cleaned} old states`);
  }
}

// Cleanup old states every hour
setInterval(cleanupOldStates, 60 * 60 * 1000);
