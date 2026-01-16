/**
 * Telegram Module
 *
 * Main export for Telegram notifications.
 * Initializes bot and provides notification trigger.
 *
 * Sprint: Telegram Alert Intelligence
 */

export { sendTelegramMessage, formatSignalMessage, isTelegramConfigured, isDryRunMode } from "./notifier.js";
export {
  generateStartToken,
  getSubscription,
  getSubscriptionByChatId,
  updateSubscription,
  getAllEnabledSubscriptions,
  shouldNotify,
  type TelegramSubscription,
} from "./storage.js";
export { startBot, stopBot } from "./bot.js";
export { getCooldownRemaining } from "./trigger.js";
export {
  getLastAlertState,
  checkEscalation,
  type EscalationReason,
} from "./alertState.js";

import { startBot } from "./bot.js";
import { isTelegramConfigured, isDryRunMode } from "./notifier.js";

/**
 * Initialize Telegram module
 */
export function initTelegram(): void {
  if (!isTelegramConfigured()) {
    console.log("[Telegram] No bot token configured, Telegram notifications disabled");
    return;
  }

  console.log(`[Telegram] Initializing... (DRY_RUN: ${isDryRunMode()})`);

  // Start bot polling in background
  startBot().catch((err) => {
    console.error("[Telegram] Bot startup error:", err);
  });
}
