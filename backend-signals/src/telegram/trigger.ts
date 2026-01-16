/**
 * Telegram Notification Trigger
 *
 * Triggers notifications when signals are detected.
 * Applies filters (impact, confidence, quiet hours, cooldown).
 * Implements escalation detection for intelligent alerting.
 *
 * Sprint: Telegram Alert Intelligence
 */

import {
  sendTelegramMessage,
  formatSignalMessage,
  isTelegramConfigured,
} from "./notifier.js";
import {
  getSubscription,
  shouldNotify,
} from "./storage.js";
import {
  getLastAlertState,
  updateAlertState,
  checkEscalation,
  getWhyNowText,
  type EscalationReason,
} from "./alertState.js";
import { logEvent, shortWallet } from "../metrics/index.js";

// Notification cooldown per token (5 minutes)
const NOTIFICATION_COOLDOWN_MS = 5 * 60 * 1000;
const notificationCooldowns = new Map<string, number>();

export interface SignalNotificationParams {
  walletAddress: string;
  type: "risk" | "liquidity";
  impactLevel: "high" | "medium" | "low";
  impactScore: number;
  confidence: number; // 0-1
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  chainId: number;
  chainName: string;
  reason: string;
  liquidityDrop?: number; // percentage, e.g., -30 for 30% drop
}

// Chain name mapping
const CHAIN_NAMES: Record<number, string> = {
  1: "Ethereum",
  56: "BNB Chain",
  137: "Polygon",
  42161: "Arbitrum",
  10: "Optimism",
  43114: "Avalanche",
};

export interface TriggerResult {
  sent: boolean;
  reason?: string;
  escalationReason?: EscalationReason;
  cooldownRemaining?: number; // seconds
}

/**
 * Trigger notification for a signal
 */
export async function triggerSignalNotification(
  params: SignalNotificationParams
): Promise<TriggerResult> {
  if (!isTelegramConfigured()) {
    return { sent: false, reason: "Telegram not configured" };
  }

  const { walletAddress, type, impactLevel, confidence, tokenAddress, chainId, liquidityDrop } = params;

  // Get subscription
  const subscription = getSubscription(walletAddress);

  if (!subscription) {
    return { sent: false, reason: "No subscription found" };
  }

  // Check notification filters (impact level, confidence, quiet hours)
  const filterResult = shouldNotify(subscription, impactLevel, confidence);

  if (!filterResult.should) {
    return { sent: false, reason: filterResult.reason };
  }

  // Check notification cooldown (per token per wallet)
  const cooldownKey = `${walletAddress}:${chainId}:${tokenAddress}:${type}`;
  const lastNotified = notificationCooldowns.get(cooldownKey);
  const now = Date.now();

  if (lastNotified && now - lastNotified < NOTIFICATION_COOLDOWN_MS) {
    const remainingSec = Math.ceil((NOTIFICATION_COOLDOWN_MS - (now - lastNotified)) / 1000);
    return {
      sent: false,
      reason: `Notification cooldown (${remainingSec}s remaining)`,
      cooldownRemaining: remainingSec,
    };
  }

  // Get user's confidence threshold for escalation check
  const userConfidenceThreshold = subscription.minConfidence / 100; // Convert 80 → 0.8

  // Get last alert state and check for escalation
  const lastState = getLastAlertState(walletAddress, tokenAddress, type);
  const escalationReason = checkEscalation(
    lastState,
    impactLevel,
    confidence,
    liquidityDrop,
    userConfidenceThreshold
  );

  // If no escalation, don't send alert (unless it's the first alert)
  if (!escalationReason && lastState) {
    return {
      sent: false,
      reason: "No escalation detected (same state as last alert)",
    };
  }

  // Generate "Why now" text
  const whyNowText = getWhyNowText(escalationReason, userConfidenceThreshold);

  // Format and send message
  const message = formatSignalMessage({
    type,
    impactLevel,
    tokenName: params.tokenName,
    tokenSymbol: params.tokenSymbol,
    chainName: params.chainName || CHAIN_NAMES[chainId] || `Chain ${chainId}`,
    reason: params.reason,
    whyNow: whyNowText,
    tokenAddress,
    chainId,
  });

  const result = await sendTelegramMessage({
    chatId: subscription.chatId,
    text: message,
  });

  if (result.success) {
    // Update cooldown
    notificationCooldowns.set(cooldownKey, now);

    // Update alert state for future escalation checks
    updateAlertState(walletAddress, tokenAddress, type, {
      lastImpact: impactLevel,
      lastConfidence: confidence,
      lastLiquidity: liquidityDrop,
    });

    // Log metric event
    logEvent({
      ts: now,
      event: "telegram_alert_sent",
      wallet: shortWallet(walletAddress),
      chainId,
      meta: {
        type,
        impactLevel,
        tokenSymbol: params.tokenSymbol,
        escalationReason: escalationReason || "first_alert",
      },
    });

    console.log(
      `[Telegram Trigger] Notification sent for ${params.tokenSymbol} to wallet ${walletAddress.slice(0, 8)}... ` +
        `(escalation: ${escalationReason})`
    );
    return { sent: true, escalationReason };
  }

  return { sent: false, reason: result.error };
}

/**
 * Get cooldown remaining for a specific token/wallet/type combination
 */
export function getCooldownRemaining(
  walletAddress: string,
  chainId: number,
  tokenAddress: string,
  type: string
): number | null {
  const cooldownKey = `${walletAddress}:${chainId}:${tokenAddress}:${type}`;
  const lastNotified = notificationCooldowns.get(cooldownKey);

  if (!lastNotified) return null;

  const remaining = NOTIFICATION_COOLDOWN_MS - (Date.now() - lastNotified);
  if (remaining <= 0) return null;

  return Math.ceil(remaining / 1000);
}

/**
 * Clean up old cooldowns (call periodically)
 */
export function cleanupCooldowns(): void {
  const now = Date.now();
  for (const [key, timestamp] of notificationCooldowns) {
    if (now - timestamp > NOTIFICATION_COOLDOWN_MS * 2) {
      notificationCooldowns.delete(key);
    }
  }
}

// Cleanup cooldowns every 10 minutes
setInterval(cleanupCooldowns, 10 * 60 * 1000);
