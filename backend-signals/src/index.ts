import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { getSignals } from "./api.js";
import {
  initTelegram,
  generateStartToken,
  getSubscription,
  updateSubscription,
  isTelegramConfigured,
  isDryRunMode,
} from "./telegram/index.js";
import { triggerSignalNotification } from "./telegram/trigger.js";
import { getWalletTokens, isChainSupported, SUPPORTED_CHAINS } from "./walletScan/index.js";
import { logEvent, calculateSummary, shortWallet } from "./metrics/index.js";

// Configuration
const PORT = Number(process.env.PORT) || 4001;
const SIGNALS_ENABLED = process.env.SIGNALS_ENABLED !== "false";
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS?.split(",") || [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://207.180.212.142:3000",
  "https://swaperex.com",
  "https://www.swaperex.com"
];

const startTime = Date.now();
const VERSION = "1.0.0";

const app = Fastify({ logger: true });

// CORS - allow frontend origins
await app.register(cors, {
  origin: ALLOWED_ORIGINS,
  methods: ["GET", "POST", "PUT"],
});

// Rate limiting - 100 requests per minute per IP
await app.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
});

// Simple health check (for load balancers / quick checks)
app.get("/health", async () => {
  return {
    status: "ok",
    version: VERSION,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    signalsEnabled: SIGNALS_ENABLED,
    timestamp: Date.now(),
  };
});

// Rich health check endpoint (for system status UI)
app.get("/api/v1/health", async () => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);

  // Check external API status (DexScreener, GoPlus)
  const externalChecks = await checkExternalApis();

  // Overall system status
  const signalsEngineStatus = SIGNALS_ENABLED && externalChecks.dexscreener && externalChecks.goplus
    ? "running"
    : SIGNALS_ENABLED && (externalChecks.dexscreener || externalChecks.goplus)
    ? "degraded"
    : SIGNALS_ENABLED
    ? "unavailable"
    : "disabled";

  return {
    status: signalsEngineStatus === "running" ? "ok" : signalsEngineStatus === "degraded" ? "partial" : "error",
    signalsEngine: signalsEngineStatus,
    version: VERSION,
    uptime,
    timestamp: Date.now(),
    services: {
      dexscreener: externalChecks.dexscreener ? "up" : "down",
      goplus: externalChecks.goplus ? "up" : "down",
    },
  };
});

// External API health checks
async function checkExternalApis(): Promise<{ dexscreener: boolean; goplus: boolean }> {
  const results = { dexscreener: false, goplus: false };

  try {
    // Check DexScreener
    const dexController = new AbortController();
    const dexTimeout = setTimeout(() => dexController.abort(), 3000);
    const dexRes = await fetch("https://api.dexscreener.com/latest/dex/tokens/0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", {
      signal: dexController.signal,
    });
    clearTimeout(dexTimeout);
    results.dexscreener = dexRes.ok;
  } catch {
    results.dexscreener = false;
  }

  try {
    // Check GoPlus (simple ping to token security endpoint)
    const goplusController = new AbortController();
    const goplusTimeout = setTimeout(() => goplusController.abort(), 3000);
    const goplusRes = await fetch("https://api.gopluslabs.io/api/v1/token_security/1?contract_addresses=0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", {
      signal: goplusController.signal,
    });
    clearTimeout(goplusTimeout);
    results.goplus = goplusRes.ok;
  } catch {
    results.goplus = false;
  }

  return results;
}

// V1 Signals endpoint (versioned)
app.get("/api/v1/signals", async (req, reply) => {
  // Kill switch - return empty if disabled
  if (!SIGNALS_ENABLED) {
    return { timestamp: Date.now(), disabled: true };
  }

  const { chainId, token, debug } = req.query as any;
  if (!chainId || !token) {
    return reply.code(400).send({ error: "Missing params: chainId, token" });
  }

  const includeDebug = debug === "1" || debug === "true";
  return getSignals(Number(chainId), token.toLowerCase(), includeDebug);
});

// Legacy endpoint (redirect to v1)
app.get("/api/signals", async (req, reply) => {
  const { chainId, token } = req.query as any;
  return reply.redirect(301, `/api/v1/signals?chainId=${chainId}&token=${token}`);
});

// ============================================
// Telegram Notification Endpoints
// ============================================

// Get Telegram status for a wallet
app.get("/api/v1/telegram/status", async (req, reply) => {
  const { wallet } = req.query as any;
  if (!wallet) {
    return reply.code(400).send({ error: "Missing wallet parameter" });
  }

  const subscription = getSubscription(wallet);
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || "kobbexradarbot";

  return {
    configured: isTelegramConfigured(),
    dryRun: isDryRunMode(),
    botUsername,
    subscription: subscription
      ? {
          enabled: subscription.enabled,
          minImpact: subscription.minImpact,
          minConfidence: subscription.minConfidence,
          quietHoursStart: subscription.quietHoursStart,
          quietHoursEnd: subscription.quietHoursEnd,
          connected: true,
        }
      : null,
  };
});

// Generate a start token for wallet linking
app.post("/api/v1/telegram/connect", async (req, reply) => {
  const { wallet } = req.body as any;
  if (!wallet) {
    return reply.code(400).send({ error: "Missing wallet parameter" });
  }

  if (!isTelegramConfigured()) {
    return reply.code(503).send({ error: "Telegram not configured" });
  }

  const token = generateStartToken(wallet);
  const botUsername = process.env.TELEGRAM_BOT_USERNAME || "kobbexradarbot";
  const connectUrl = `https://t.me/${botUsername}?start=${token}`;

  return {
    token,
    connectUrl,
    expiresIn: 600, // 10 minutes in seconds
  };
});

// Update Telegram settings
app.put("/api/v1/telegram/settings", async (req, reply) => {
  const { wallet, enabled, minImpact, minConfidence, quietHoursStart, quietHoursEnd } = req.body as any;

  if (!wallet) {
    return reply.code(400).send({ error: "Missing wallet parameter" });
  }

  const subscription = getSubscription(wallet);
  if (!subscription) {
    return reply.code(404).send({ error: "No subscription found for this wallet" });
  }

  const updates: any = {};
  if (typeof enabled === "boolean") updates.enabled = enabled;
  if (minImpact) updates.minImpact = minImpact;
  if (typeof minConfidence === "number") updates.minConfidence = minConfidence;
  if (quietHoursStart !== undefined) updates.quietHoursStart = quietHoursStart;
  if (quietHoursEnd !== undefined) updates.quietHoursEnd = quietHoursEnd;

  const updated = updateSubscription(wallet, updates);

  return {
    success: true,
    subscription: {
      enabled: updated?.enabled,
      minImpact: updated?.minImpact,
      minConfidence: updated?.minConfidence,
      quietHoursStart: updated?.quietHoursStart,
      quietHoursEnd: updated?.quietHoursEnd,
    },
  };
});

// Test notification endpoint (for debugging)
app.post("/api/v1/telegram/test", async (req, reply) => {
  const { wallet } = req.body as any;
  if (!wallet) {
    return reply.code(400).send({ error: "Missing wallet parameter" });
  }

  const result = await triggerSignalNotification({
    walletAddress: wallet,
    type: "risk",
    impactLevel: "high",
    impactScore: 75,
    confidence: 0.85,
    tokenAddress: "0x0000000000000000000000000000000000000000",
    tokenName: "Test Token",
    tokenSymbol: "TEST",
    chainId: 1,
    chainName: "Ethereum",
    reason: "This is a test notification from Swaperex Radar.",
  });

  return result;
});

// ============================================
// Wallet Scan Endpoints
// ============================================

// Get wallet token holdings
app.get("/api/v1/wallet-tokens", async (req, reply) => {
  const { chainId, wallet } = req.query as any;

  if (!chainId) {
    return reply.code(400).send({ error: "Missing chainId parameter" });
  }

  if (!wallet) {
    return reply.code(400).send({ error: "Missing wallet parameter" });
  }

  const chainIdNum = Number(chainId);

  if (isNaN(chainIdNum)) {
    return reply.code(400).send({ error: "chainId must be a number" });
  }

  if (!isChainSupported(chainIdNum)) {
    return reply.code(400).send({
      error: `Chain ${chainIdNum} not supported`,
      supportedChains: Object.keys(SUPPORTED_CHAINS).map(Number),
    });
  }

  // Validate wallet address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return reply.code(400).send({ error: "Invalid wallet address format" });
  }

  const result = await getWalletTokens(chainIdNum, wallet);

  // Check if error
  if ("code" in result) {
    return reply.code(500).send({
      error: result.message,
      code: result.code,
    });
  }

  return result;
});

// ============================================
// Metrics Endpoints
// ============================================

// Rate limit tracking for events endpoint
const eventRateLimits = new Map<string, { count: number; resetAt: number }>();

// POST /api/v1/events - Record frontend events
app.post("/api/v1/events", async (req, reply) => {
  const ip = req.ip || "unknown";

  // Rate limiting: 10 events/minute per IP
  const now = Date.now();
  const limit = eventRateLimits.get(ip);
  if (limit) {
    if (now < limit.resetAt) {
      if (limit.count >= 10) {
        return reply.code(429).send({ error: "Rate limit exceeded" });
      }
      limit.count++;
    } else {
      eventRateLimits.set(ip, { count: 1, resetAt: now + 60000 });
    }
  } else {
    eventRateLimits.set(ip, { count: 1, resetAt: now + 60000 });
  }

  const { event, wallet, chainId, meta } = req.body as any;

  // Validation
  if (!event || typeof event !== "string") {
    return reply.code(400).send({ error: "Missing or invalid 'event' field" });
  }

  if (event.length > 50) {
    return reply.code(400).send({ error: "Event name too long (max 50 chars)" });
  }

  if (wallet && typeof wallet === "string" && wallet.length > 20) {
    // Wallet should already be in short format, reject if full address
    return reply.code(400).send({ error: "Wallet should be in short format (0x1234...abcd)" });
  }

  if (meta && JSON.stringify(meta).length > 1024) {
    return reply.code(400).send({ error: "Meta object too large (max 1KB)" });
  }

  // Log the event
  logEvent({
    ts: now,
    event,
    wallet: wallet || undefined,
    chainId: typeof chainId === "number" ? chainId : undefined,
    meta: meta || undefined,
  });

  return { ok: true };
});

// GET /api/v1/metrics/summary - Get aggregated metrics
app.get("/api/v1/metrics/summary", async (req, reply) => {
  const { hours } = req.query as any;
  const hoursNum = Number(hours) || 24;

  // Cap at 168 hours (1 week)
  const cappedHours = Math.min(Math.max(hoursNum, 1), 168);

  const summary = calculateSummary(cappedHours);
  return summary;
});

// Start server
try {
  await app.listen({ port: PORT, host: "0.0.0.0" });

  const telegramStatus = isTelegramConfigured()
    ? isDryRunMode()
      ? "DRY_RUN"
      : "ENABLED"
    : "DISABLED";

  console.log(`
╔════════════════════════════════════════════╗
║  Signals Backend v${VERSION}                   ║
║  Port: ${PORT}                                ║
║  Signals: ${SIGNALS_ENABLED ? "ENABLED" : "DISABLED"}                        ║
║  Telegram: ${telegramStatus}                       ║
║  CORS: ${ALLOWED_ORIGINS.length} origins                       ║
╚════════════════════════════════════════════╝
  `);

  // Initialize Telegram bot (if configured)
  initTelegram();
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
