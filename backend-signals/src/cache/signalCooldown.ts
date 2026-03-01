/**
 * Signal Cooldown (Deduplication)
 *
 * Prevents the same signal from triggering repeatedly.
 * Same token + same signal type = cooldown period.
 *
 * Rules:
 * - Default cooldown: 15 minutes
 * - During cooldown: return true (signal suppressed)
 * - After cooldown: return false (signal can fire)
 * - Escalation resets cooldown (handled externally)
 */

export interface CooldownEntry {
  /** Timestamp when cooldown started */
  startedAt: number;
  /** Timestamp when cooldown expires */
  expiresAt: number;
  /** Last severity level (for escalation tracking) */
  lastSeverity: string;
}

// In-memory cooldown store
const cooldowns = new Map<string, CooldownEntry>();

// Default cooldown: 15 minutes
const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000;

// Signal types
export type SignalType = 'liquidity' | 'risk' | 'whale';

/**
 * Generate cooldown key
 */
function getCooldownKey(chainId: number, token: string, signalType: SignalType): string {
  return `${chainId}:${token.toLowerCase()}:${signalType}`;
}

/**
 * Check if signal is in cooldown (should be suppressed)
 * Returns the cooldown entry if in cooldown, null if signal can fire
 */
export function isInCooldown(
  chainId: number,
  token: string,
  signalType: SignalType
): CooldownEntry | null {
  const key = getCooldownKey(chainId, token, signalType);
  const entry = cooldowns.get(key);

  if (!entry) {
    return null; // No cooldown, signal can fire
  }

  // Check if cooldown expired
  if (Date.now() > entry.expiresAt) {
    cooldowns.delete(key);
    return null; // Cooldown expired, signal can fire
  }

  return entry; // Still in cooldown
}

/**
 * Start cooldown for a signal
 * @param severity - Current severity level (for escalation tracking)
 * @param cooldownMs - Optional custom cooldown duration
 */
export function startCooldown(
  chainId: number,
  token: string,
  signalType: SignalType,
  severity: string,
  cooldownMs: number = DEFAULT_COOLDOWN_MS
): void {
  const key = getCooldownKey(chainId, token, signalType);
  const now = Date.now();

  cooldowns.set(key, {
    startedAt: now,
    expiresAt: now + cooldownMs,
    lastSeverity: severity,
  });

  console.log(`[Cooldown] Started: ${key} | Severity: ${severity} | Expires in: ${cooldownMs / 1000}s`);
}

/**
 * Reset cooldown (used when severity escalates)
 */
export function resetCooldown(
  chainId: number,
  token: string,
  signalType: SignalType,
  newSeverity: string,
  cooldownMs: number = DEFAULT_COOLDOWN_MS
): void {
  const key = getCooldownKey(chainId, token, signalType);
  const entry = cooldowns.get(key);

  if (entry) {
    console.log(`[Cooldown] Reset: ${key} | ${entry.lastSeverity} → ${newSeverity}`);
  }

  startCooldown(chainId, token, signalType, newSeverity, cooldownMs);
}

/**
 * Get last severity for a signal (for escalation comparison)
 */
export function getLastSeverity(
  chainId: number,
  token: string,
  signalType: SignalType
): string | null {
  const key = getCooldownKey(chainId, token, signalType);
  const entry = cooldowns.get(key);

  return entry?.lastSeverity ?? null;
}

/**
 * Check if new severity is an escalation from previous
 */
export function isEscalation(previousSeverity: string | null, newSeverity: string): boolean {
  const severityOrder = ['safe', 'warning', 'danger', 'critical'];

  if (!previousSeverity) return false;

  const prevIndex = severityOrder.indexOf(previousSeverity);
  const newIndex = severityOrder.indexOf(newSeverity);

  return newIndex > prevIndex;
}

/**
 * Clear all cooldowns (for testing)
 */
export function clearAllCooldowns(): void {
  cooldowns.clear();
  console.log('[Cooldown] All cooldowns cleared');
}

/**
 * Get cooldown stats (for debugging/health)
 */
export function getCooldownStats(): { count: number; keys: string[] } {
  // Clean up expired entries first
  const now = Date.now();
  for (const [key, entry] of cooldowns.entries()) {
    if (now > entry.expiresAt) {
      cooldowns.delete(key);
    }
  }

  return {
    count: cooldowns.size,
    keys: Array.from(cooldowns.keys()),
  };
}
