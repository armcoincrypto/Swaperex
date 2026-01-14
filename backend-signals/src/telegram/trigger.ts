/**
 * Telegram Notification Trigger
 *
 * Triggers notifications when signals are detected.
 * Applies filters (impact, confidence, quiet hours, cooldown).
 *
 * Priority 12.3 - Telegram Alerts
 */

import {
  sendTelegramMessage,
  formatSignalMessage,
  isTelegramConfigured,
} from "./notifier.js";
import {
  getSubscription,
  shouldNotify,
  type TelegramSubscription,
} from "./storage.js";

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
  escalated?: boolean;
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

/**
 * Trigger notification for a signal
 */
export async function triggerSignalNotification(
  params: SignalNotificationParams
): Promise<{ sent: boolean; reason?: string }> {
  if (!isTelegramConfigured()) {
    return { sent: false, reason: "Telegram not configured" };
  }

  const { walletAddress, type, impactLevel, confidence, tokenAddress, chainId } = params;

  // Get subscription
  const subscription = getSubscription(walletAddress);

  if (!subscription) {
    return { sent: false, reason: "No subscription found" };
  }

  // Check notification filters
  const filterResult = shouldNotify(subscription, impactLevel, confidence);

  if (!filterResult.should) {
    return { sent: false, reason: filterResult.reason };
  }

  // Check notification cooldown (per token per wallet)
  const cooldownKey = `${walletAddress}:${chainId}:${tokenAddress}:${type}`;
  const lastNotified = notificationCooldowns.get(cooldownKey);

  if (lastNotified && Date.now() - lastNotified < NOTIFICATION_COOLDOWN_MS) {
    const remainingSec = Math.ceil((NOTIFICATION_COOLDOWN_MS - (Date.now() - lastNotified)) / 1000);
    return { sent: false, reason: `Notification cooldown (${remainingSec}s remaining)` };
  }

  // Build guidance text based on type and impact
  const guidance = getGuidanceText(type, impactLevel);

  // Format and send message
  const message = formatSignalMessage({
    type,
    impactLevel,
    tokenName: params.tokenName,
    tokenSymbol: params.tokenSymbol,
    chainName: params.chainName || CHAIN_NAMES[chainId] || `Chain ${chainId}`,
    reason: params.reason,
    guidance,
    tokenAddress,
    chainId,
  });

  const result = await sendTelegramMessage({
    chatId: subscription.chatId,
    text: message,
  });

  if (result.success) {
    // Update cooldown
    notificationCooldowns.set(cooldownKey, Date.now());

    console.log(`[Telegram Trigger] Notification sent for ${params.tokenSymbol} to wallet ${walletAddress.slice(0, 8)}...`);
    return { sent: true };
  }

  return { sent: false, reason: result.error };
}

/**
 * Get guidance text based on signal type and impact
 */
function getGuidanceText(type: "risk" | "liquidity", impactLevel: "high" | "medium" | "low"): string {
  if (type === "risk") {
    switch (impactLevel) {
      case "high":
        return "Review token details and consider your position carefully.";
      case "medium":
        return "Review the risk indicators when convenient.";
      default:
        return "Informational only — no immediate action typically needed.";
    }
  } else {
    // liquidity
    switch (impactLevel) {
      case "high":
        return "Liquidity has dropped significantly. Review trading conditions.";
      case "medium":
        return "Monitor liquidity conditions.";
      default:
        return "Minor liquidity change — informational only.";
    }
  }
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
