/**
 * Telegram Bot Handler
 *
 * Handles bot commands via long polling.
 * Commands: /start, /status, /on, /off, /settings
 *
 * Priority 12.3 - Telegram Alerts
 */

import { sendTelegramMessage, isTelegramConfigured, isDryRunMode } from "./notifier.js";
import {
  validateStartToken,
  upsertSubscription,
  getSubscriptionByChatId,
  updateSubscription,
} from "./storage.js";

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const POLL_TIMEOUT = 30; // seconds

let lastUpdateId = 0;
let isPolling = false;
let shouldStop = false;

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      username?: string;
      first_name?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    date: number;
    text?: string;
  };
}

/**
 * Start the bot polling loop
 */
export async function startBot(): Promise<void> {
  if (!isTelegramConfigured()) {
    console.log("[Telegram Bot] No bot token configured, bot disabled");
    return;
  }

  if (isPolling) {
    console.log("[Telegram Bot] Already polling");
    return;
  }

  console.log("[Telegram Bot] Starting polling loop...");
  isPolling = true;
  shouldStop = false;

  while (!shouldStop) {
    try {
      const updates = await getUpdates();

      for (const update of updates) {
        await handleUpdate(update);
        lastUpdateId = update.update_id;
      }
    } catch (err) {
      console.error("[Telegram Bot] Polling error:", err);
      // Wait before retrying on error
      await sleep(5000);
    }
  }

  isPolling = false;
  console.log("[Telegram Bot] Polling stopped");
}

/**
 * Stop the bot polling loop
 */
export function stopBot(): void {
  shouldStop = true;
}

/**
 * Get updates from Telegram
 */
async function getUpdates(): Promise<TelegramUpdate[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), (POLL_TIMEOUT + 5) * 1000);

  try {
    const response = await fetch(
      `${TELEGRAM_API_BASE}${BOT_TOKEN}/getUpdates?offset=${lastUpdateId + 1}&timeout=${POLL_TIMEOUT}`,
      { signal: controller.signal }
    );

    clearTimeout(timeout);
    const data = (await response.json()) as any;

    if (data.ok && Array.isArray(data.result)) {
      return data.result;
    }

    return [];
  } catch (err: any) {
    clearTimeout(timeout);
    if (err.name === "AbortError") {
      return []; // Timeout is normal
    }
    throw err;
  }
}

/**
 * Handle a single update
 */
async function handleUpdate(update: TelegramUpdate): Promise<void> {
  if (!update.message?.text) return;

  const chatId = update.message.chat.id;
  const text = update.message.text.trim();
  const username = update.message.from.username || update.message.from.first_name || "User";

  console.log(`[Telegram Bot] Message from ${username} (${chatId}): ${text}`);

  // Parse command
  if (text.startsWith("/start")) {
    await handleStartCommand(chatId, text, username);
  } else if (text === "/status") {
    await handleStatusCommand(chatId);
  } else if (text === "/on") {
    await handleOnCommand(chatId);
  } else if (text === "/off") {
    await handleOffCommand(chatId);
  } else if (text === "/help") {
    await handleHelpCommand(chatId);
  } else {
    await sendTelegramMessage({
      chatId,
      text: `Unknown command. Type /help for available commands.`,
    });
  }
}

/**
 * Handle /start command (with optional token)
 */
async function handleStartCommand(chatId: number, text: string, username: string): Promise<void> {
  // Extract token from /start <token>
  const parts = text.split(/\s+/);
  const token = parts[1];

  if (!token) {
    // No token - show welcome message
    await sendTelegramMessage({
      chatId,
      text: `👋 Welcome to <b>Swaperex Radar Bot</b>!

To connect your wallet and receive alerts:
1. Go to Swaperex Radar
2. Click "Enable Telegram Alerts"
3. Click the link provided

You'll then receive notifications for high-impact risk and liquidity signals on your watched tokens.

Type /help for available commands.`,
    });
    return;
  }

  // Validate token
  const result = validateStartToken(token);

  if (!result.valid) {
    await sendTelegramMessage({
      chatId,
      text: `❌ <b>Connection failed</b>

${result.error === "Token expired" ? "This link has expired. Please generate a new one from Swaperex Radar." : result.error === "Token already used" ? "This link has already been used." : "Invalid link. Please generate a new one from Swaperex Radar."}`,
    });
    return;
  }

  // Create subscription
  const subscription = upsertSubscription(result.walletAddress!, chatId);

  const shortAddress = `${result.walletAddress!.slice(0, 6)}...${result.walletAddress!.slice(-4)}`;

  await sendTelegramMessage({
    chatId,
    text: `✅ <b>Connected successfully!</b>

Wallet: <code>${shortAddress}</code>

You'll now receive Telegram alerts for high-impact signals on your watched tokens.

<b>Current settings:</b>
• Impact filter: ${subscription.minImpact === "high" ? "High only" : subscription.minImpact === "high+medium" ? "High + Medium" : "All"}
• Min confidence: ≥${subscription.minConfidence}%
• Quiet hours: ${subscription.quietHoursStart !== null ? `${subscription.quietHoursStart}:00 - ${subscription.quietHoursEnd}:00 UTC` : "Off"}

Commands:
/status - View current settings
/off - Disable notifications
/on - Enable notifications
/help - Show all commands`,
  });
}

/**
 * Handle /status command
 */
async function handleStatusCommand(chatId: number): Promise<void> {
  const subscription = getSubscriptionByChatId(chatId);

  if (!subscription) {
    await sendTelegramMessage({
      chatId,
      text: `❌ <b>Not connected</b>

You haven't connected a wallet yet.
Visit Swaperex Radar and click "Enable Telegram Alerts" to connect.`,
    });
    return;
  }

  const shortAddress = `${subscription.walletAddress.slice(0, 6)}...${subscription.walletAddress.slice(-4)}`;

  await sendTelegramMessage({
    chatId,
    text: `📊 <b>Your Radar Alert Settings</b>

<b>Wallet:</b> <code>${shortAddress}</code>
<b>Status:</b> ${subscription.enabled ? "✅ Active" : "⏸️ Paused"}

<b>Filters:</b>
• Impact: ${subscription.minImpact === "high" ? "🔴 High only" : subscription.minImpact === "high+medium" ? "🟡 High + Medium" : "📊 All"}
• Confidence: ≥${subscription.minConfidence}%
• Quiet hours: ${subscription.quietHoursStart !== null ? `${subscription.quietHoursStart}:00 - ${subscription.quietHoursEnd}:00 UTC` : "Off"}

<i>To change settings, visit Swaperex Radar → Alerts → Telegram Settings</i>`,
  });
}

/**
 * Handle /on command
 */
async function handleOnCommand(chatId: number): Promise<void> {
  const subscription = getSubscriptionByChatId(chatId);

  if (!subscription) {
    await sendTelegramMessage({
      chatId,
      text: `❌ No wallet connected. Visit Swaperex Radar to connect first.`,
    });
    return;
  }

  if (subscription.enabled) {
    await sendTelegramMessage({
      chatId,
      text: `✅ Notifications are already enabled.`,
    });
    return;
  }

  updateSubscription(subscription.walletAddress, { enabled: true });

  await sendTelegramMessage({
    chatId,
    text: `✅ <b>Notifications enabled!</b>

You'll now receive alerts for ${subscription.minImpact === "high" ? "high-impact" : subscription.minImpact === "high+medium" ? "high and medium impact" : "all"} signals.`,
  });
}

/**
 * Handle /off command
 */
async function handleOffCommand(chatId: number): Promise<void> {
  const subscription = getSubscriptionByChatId(chatId);

  if (!subscription) {
    await sendTelegramMessage({
      chatId,
      text: `❌ No wallet connected. Visit Swaperex Radar to connect first.`,
    });
    return;
  }

  if (!subscription.enabled) {
    await sendTelegramMessage({
      chatId,
      text: `⏸️ Notifications are already disabled.`,
    });
    return;
  }

  updateSubscription(subscription.walletAddress, { enabled: false });

  await sendTelegramMessage({
    chatId,
    text: `⏸️ <b>Notifications paused</b>

You won't receive alerts until you enable them again with /on.`,
  });
}

/**
 * Handle /help command
 */
async function handleHelpCommand(chatId: number): Promise<void> {
  await sendTelegramMessage({
    chatId,
    text: `🤖 <b>Swaperex Radar Bot Commands</b>

/start - Connect your wallet (use link from Radar)
/status - View your current settings
/on - Enable notifications
/off - Disable notifications
/help - Show this help message

<b>How it works:</b>
Radar monitors your watched tokens and sends alerts when:
• Risk factors are detected (honeypot, proxy, etc.)
• Liquidity drops significantly

<b>Settings:</b>
Configure impact level, confidence threshold, and quiet hours in Swaperex Radar → Alerts → Telegram Settings.

Questions? Visit our support channel.`,
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
