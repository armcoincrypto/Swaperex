/**
 * Telegram Notifier Service
 *
 * Sends notifications to Telegram with retry logic.
 * Supports DRY_RUN mode for testing.
 *
 * Sprint: Telegram Alert Intelligence
 */

const TELEGRAM_API_BASE = "https://api.telegram.org/bot";
const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 2000, 4000]; // Exponential backoff

// Configuration
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "";
const DRY_RUN = process.env.TELEGRAM_DRY_RUN === "true";

export interface TelegramMessage {
  chatId: string | number;
  text: string;
  parseMode?: "HTML" | "Markdown";
  disableWebPagePreview?: boolean;
}

export interface SendResult {
  success: boolean;
  messageId?: number;
  error?: string;
  dryRun?: boolean;
}

/**
 * Send a message to Telegram
 */
export async function sendTelegramMessage(message: TelegramMessage): Promise<SendResult> {
  if (!BOT_TOKEN) {
    console.warn("[Telegram] No bot token configured, skipping notification");
    return { success: false, error: "No bot token configured" };
  }

  if (DRY_RUN) {
    console.log("[Telegram DRY_RUN] Would send to", message.chatId, ":", message.text.substring(0, 100) + "...");
    return { success: true, dryRun: true };
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(`${TELEGRAM_API_BASE}${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: message.chatId,
          text: message.text,
          parse_mode: message.parseMode || "HTML",
          disable_web_page_preview: message.disableWebPagePreview ?? true,
        }),
      });

      const data = (await response.json()) as any;

      if (data.ok) {
        console.log(`[Telegram] Message sent to ${message.chatId}, messageId: ${data.result?.message_id}`);
        return { success: true, messageId: data.result?.message_id };
      }

      // Handle rate limiting
      if (response.status === 429) {
        const retryAfter = data.parameters?.retry_after || RETRY_DELAYS[attempt] / 1000;
        console.warn(`[Telegram] Rate limited, waiting ${retryAfter}s before retry`);
        await sleep(retryAfter * 1000);
        continue;
      }

      // Handle other errors
      console.error(`[Telegram] API error:`, data.description || "Unknown error");
      return { success: false, error: data.description || "API error" };
    } catch (err) {
      console.error(`[Telegram] Network error (attempt ${attempt + 1}/${MAX_RETRIES}):`, err);

      if (attempt < MAX_RETRIES - 1) {
        await sleep(RETRY_DELAYS[attempt]);
      }
    }
  }

  return { success: false, error: "Max retries exceeded" };
}

/**
 * Format a signal notification message
 *
 * Uses exact template from Sprint: Telegram Alert Intelligence
 * Template:
 *   🔴 Risk Alert — High Impact
 *   Token: {TOKEN_NAME} ({SYMBOL}) — {CHAIN}
 *   What changed: {short factual description}
 *   Why now: {one allowed reason}
 *   Suggested next step: Review token details and monitor closely.
 *   Links: DexScreener | Explorer | Open Radar
 */
export function formatSignalMessage(params: {
  type: "risk" | "liquidity";
  impactLevel: "high" | "medium" | "low";
  tokenName: string;
  tokenSymbol: string;
  chainName: string;
  reason: string;
  whyNow: string;
  tokenAddress: string;
  chainId: number;
}): string {
  const { type, impactLevel, tokenName, tokenSymbol, chainName, reason, whyNow, tokenAddress, chainId } = params;

  // Impact emoji
  const impactEmoji = impactLevel === "high" ? "🔴" : impactLevel === "medium" ? "🟡" : "ℹ️";
  const impactLabel = impactLevel.charAt(0).toUpperCase() + impactLevel.slice(1);

  // Alert type
  const alertType = type === "risk" ? "Risk Alert" : "Liquidity Alert";

  // DexScreener chain mapping
  const dexChainMap: Record<number, string> = {
    1: "ethereum",
    56: "bsc",
    137: "polygon",
    42161: "arbitrum",
    10: "optimism",
    43114: "avalanche",
  };
  const dexChain = dexChainMap[chainId] || "ethereum";

  // Explorer chain mapping
  const explorerMap: Record<number, string> = {
    1: "https://etherscan.io/token/",
    56: "https://bscscan.com/token/",
    137: "https://polygonscan.com/token/",
    42161: "https://arbiscan.io/token/",
    10: "https://optimistic.etherscan.io/token/",
    43114: "https://snowtrace.io/token/",
  };
  const explorerBase = explorerMap[chainId] || "https://etherscan.io/token/";

  // Suggested next step (calm, informational)
  const suggestedStep = "Review token details and monitor closely.";

  // Build message with exact template format
  return `${impactEmoji} <b>${alertType} — ${impactLabel} Impact</b>

<b>Token:</b> ${tokenName} (${tokenSymbol}) — ${chainName}

<b>What changed:</b>
${reason}

<b>${whyNow}</b>

<b>Suggested next step:</b>
${suggestedStep}

<b>Links:</b>
<a href="https://dexscreener.com/${dexChain}/${tokenAddress}">DexScreener</a> | <a href="${explorerBase}${tokenAddress}">Explorer</a> | <a href="http://207.180.212.142:3000/?tab=radar">Open Radar</a>`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isTelegramConfigured(): boolean {
  return !!BOT_TOKEN;
}

export function isDryRunMode(): boolean {
  return DRY_RUN;
}
