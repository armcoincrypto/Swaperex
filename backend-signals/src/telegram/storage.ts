/**
 * Telegram Subscription Storage
 *
 * Manages telegram notification subscriptions.
 * Uses JSON file storage for MVP (can migrate to DB later).
 *
 * Priority 12.3 - Telegram Alerts
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const STORAGE_FILE = join(__dirname, "../../data/telegram_subscriptions.json");
const TOKENS_FILE = join(__dirname, "../../data/telegram_tokens.json");

// Token expiry (10 minutes)
const TOKEN_EXPIRY_MS = 10 * 60 * 1000;

export interface TelegramSubscription {
  walletAddress: string; // lowercase
  chatId: number;
  enabled: boolean;
  minImpact: "high" | "high+medium" | "all";
  minConfidence: number; // 40, 60, or 80
  quietHoursStart: number | null; // 0-23 UTC
  quietHoursEnd: number | null; // 0-23 UTC
  createdAt: number;
  updatedAt: number;
}

interface StartToken {
  token: string;
  walletAddress: string;
  expiresAt: number;
  used: boolean;
}

// In-memory cache
let subscriptions: Map<string, TelegramSubscription> = new Map();
let startTokens: Map<string, StartToken> = new Map();
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
 * Load subscriptions from disk
 */
function loadSubscriptions(): void {
  if (loaded) return;

  ensureDataDir();

  try {
    if (existsSync(STORAGE_FILE)) {
      const data = JSON.parse(readFileSync(STORAGE_FILE, "utf-8"));
      subscriptions = new Map(Object.entries(data));
      console.log(`[Telegram Storage] Loaded ${subscriptions.size} subscriptions`);
    }
  } catch (err) {
    console.error("[Telegram Storage] Failed to load subscriptions:", err);
    subscriptions = new Map();
  }

  try {
    if (existsSync(TOKENS_FILE)) {
      const data = JSON.parse(readFileSync(TOKENS_FILE, "utf-8"));
      startTokens = new Map(Object.entries(data));
      // Clean expired tokens
      const now = Date.now();
      for (const [token, info] of startTokens) {
        if (info.expiresAt < now || info.used) {
          startTokens.delete(token);
        }
      }
    }
  } catch (err) {
    console.error("[Telegram Storage] Failed to load tokens:", err);
    startTokens = new Map();
  }

  loaded = true;
}

/**
 * Save subscriptions to disk
 */
function saveSubscriptions(): void {
  ensureDataDir();
  try {
    writeFileSync(STORAGE_FILE, JSON.stringify(Object.fromEntries(subscriptions), null, 2));
  } catch (err) {
    console.error("[Telegram Storage] Failed to save subscriptions:", err);
  }
}

/**
 * Save tokens to disk
 */
function saveTokens(): void {
  ensureDataDir();
  try {
    writeFileSync(TOKENS_FILE, JSON.stringify(Object.fromEntries(startTokens), null, 2));
  } catch (err) {
    console.error("[Telegram Storage] Failed to save tokens:", err);
  }
}

/**
 * Generate a start token for wallet linking
 */
export function generateStartToken(walletAddress: string): string {
  loadSubscriptions();

  // Generate random token
  const token = randomBytes(16).toString("hex");

  startTokens.set(token, {
    token,
    walletAddress: walletAddress.toLowerCase(),
    expiresAt: Date.now() + TOKEN_EXPIRY_MS,
    used: false,
  });

  saveTokens();
  return token;
}

/**
 * Validate and consume a start token
 */
export function validateStartToken(token: string): { valid: boolean; walletAddress?: string; error?: string } {
  loadSubscriptions();

  const tokenInfo = startTokens.get(token);

  if (!tokenInfo) {
    return { valid: false, error: "Invalid token" };
  }

  if (tokenInfo.used) {
    return { valid: false, error: "Token already used" };
  }

  if (tokenInfo.expiresAt < Date.now()) {
    startTokens.delete(token);
    saveTokens();
    return { valid: false, error: "Token expired" };
  }

  // Mark as used
  tokenInfo.used = true;
  saveTokens();

  return { valid: true, walletAddress: tokenInfo.walletAddress };
}

/**
 * Create or update a subscription
 */
export function upsertSubscription(
  walletAddress: string,
  chatId: number,
  updates?: Partial<Pick<TelegramSubscription, "enabled" | "minImpact" | "minConfidence" | "quietHoursStart" | "quietHoursEnd">>
): TelegramSubscription {
  loadSubscriptions();

  const key = walletAddress.toLowerCase();
  const existing = subscriptions.get(key);
  const now = Date.now();

  const subscription: TelegramSubscription = {
    walletAddress: key,
    chatId,
    enabled: updates?.enabled ?? existing?.enabled ?? true,
    minImpact: updates?.minImpact ?? existing?.minImpact ?? "high",
    minConfidence: updates?.minConfidence ?? existing?.minConfidence ?? 80,
    quietHoursStart: updates?.quietHoursStart ?? existing?.quietHoursStart ?? null,
    quietHoursEnd: updates?.quietHoursEnd ?? existing?.quietHoursEnd ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };

  subscriptions.set(key, subscription);
  saveSubscriptions();

  console.log(`[Telegram Storage] Upserted subscription for ${key}, chatId: ${chatId}`);
  return subscription;
}

/**
 * Get subscription by wallet address
 */
export function getSubscription(walletAddress: string): TelegramSubscription | null {
  loadSubscriptions();
  return subscriptions.get(walletAddress.toLowerCase()) || null;
}

/**
 * Get subscription by chat ID
 */
export function getSubscriptionByChatId(chatId: number): TelegramSubscription | null {
  loadSubscriptions();
  for (const sub of subscriptions.values()) {
    if (sub.chatId === chatId) {
      return sub;
    }
  }
  return null;
}

/**
 * Update subscription settings
 */
export function updateSubscription(
  walletAddress: string,
  updates: Partial<Pick<TelegramSubscription, "enabled" | "minImpact" | "minConfidence" | "quietHoursStart" | "quietHoursEnd">>
): TelegramSubscription | null {
  loadSubscriptions();

  const key = walletAddress.toLowerCase();
  const existing = subscriptions.get(key);

  if (!existing) {
    return null;
  }

  const updated: TelegramSubscription = {
    ...existing,
    ...updates,
    updatedAt: Date.now(),
  };

  subscriptions.set(key, updated);
  saveSubscriptions();

  return updated;
}

/**
 * Delete subscription
 */
export function deleteSubscription(walletAddress: string): boolean {
  loadSubscriptions();
  const deleted = subscriptions.delete(walletAddress.toLowerCase());
  if (deleted) {
    saveSubscriptions();
  }
  return deleted;
}

/**
 * Get all enabled subscriptions
 */
export function getAllEnabledSubscriptions(): TelegramSubscription[] {
  loadSubscriptions();
  return Array.from(subscriptions.values()).filter((s) => s.enabled);
}

/**
 * Check if notification should be sent based on subscription settings
 */
export function shouldNotify(
  subscription: TelegramSubscription,
  impactLevel: "high" | "medium" | "low",
  confidence: number
): { should: boolean; reason?: string } {
  // Check if enabled
  if (!subscription.enabled) {
    return { should: false, reason: "Notifications disabled" };
  }

  // Check impact filter
  if (subscription.minImpact === "high" && impactLevel !== "high") {
    return { should: false, reason: `Impact ${impactLevel} below minimum (high)` };
  }
  if (subscription.minImpact === "high+medium" && impactLevel === "low") {
    return { should: false, reason: `Impact ${impactLevel} below minimum (high+medium)` };
  }

  // Check confidence
  const confidencePct = confidence * 100;
  if (confidencePct < subscription.minConfidence) {
    return { should: false, reason: `Confidence ${confidencePct}% below minimum (${subscription.minConfidence}%)` };
  }

  // Check quiet hours
  if (subscription.quietHoursStart !== null && subscription.quietHoursEnd !== null) {
    const now = new Date();
    const currentHour = now.getUTCHours();

    let inQuietHours = false;
    if (subscription.quietHoursStart <= subscription.quietHoursEnd) {
      // Same day range (e.g., 9-17)
      inQuietHours = currentHour >= subscription.quietHoursStart && currentHour < subscription.quietHoursEnd;
    } else {
      // Overnight range (e.g., 22-6)
      inQuietHours = currentHour >= subscription.quietHoursStart || currentHour < subscription.quietHoursEnd;
    }

    if (inQuietHours) {
      return { should: false, reason: "Quiet hours active" };
    }
  }

  return { should: true };
}
