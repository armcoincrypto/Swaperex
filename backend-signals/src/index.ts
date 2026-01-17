import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { getSignals } from "./api.js";
import { logEvent, isShortWallet, calculateSummary, type MetricEvent } from "./metrics/index.js";

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
  methods: ["GET", "POST"],
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

// ============================================================
// METRICS ENDPOINTS
// ============================================================

// Rate limit map for events endpoint (10 events/minute per IP)
const eventRateLimits = new Map<string, { count: number; resetAt: number }>();

// POST /api/v1/events - Receive events from frontend
app.post("/api/v1/events", async (req, reply) => {
  const ip = req.ip || "unknown";
  const now = Date.now();

  // Rate limiting: 10 events/minute per IP
  const limit = eventRateLimits.get(ip);
  if (limit) {
    if (now < limit.resetAt) {
      if (limit.count >= 10) {
        return reply.code(429).send({ error: "Rate limit exceeded. Max 10 events/minute." });
      }
      limit.count++;
    } else {
      eventRateLimits.set(ip, { count: 1, resetAt: now + 60000 });
    }
  } else {
    eventRateLimits.set(ip, { count: 1, resetAt: now + 60000 });
  }

  // Clean up old entries periodically
  if (eventRateLimits.size > 1000) {
    for (const [key, value] of eventRateLimits) {
      if (now > value.resetAt) {
        eventRateLimits.delete(key);
      }
    }
  }

  const body = req.body as any;

  // Validation
  if (!body || typeof body.event !== "string") {
    return reply.code(400).send({ error: "Missing required field: event" });
  }

  if (body.event.length > 50) {
    return reply.code(400).send({ error: "Event name too long (max 50 chars)" });
  }

  if (body.wallet && !isShortWallet(body.wallet)) {
    return reply.code(400).send({ error: "Wallet must be in short format (0x1234...abcd)" });
  }

  if (body.chainId !== undefined && typeof body.chainId !== "number") {
    return reply.code(400).send({ error: "chainId must be a number" });
  }

  if (body.meta) {
    const metaStr = JSON.stringify(body.meta);
    if (metaStr.length > 1024) {
      return reply.code(400).send({ error: "meta too large (max 1KB)" });
    }
  }

  // Log the event
  const event: MetricEvent = {
    ts: now,
    event: body.event,
    ...(body.wallet && { wallet: body.wallet }),
    ...(body.chainId !== undefined && { chainId: body.chainId }),
    ...(body.meta && { meta: body.meta }),
  };

  logEvent(event);

  return { ok: true };
});

// GET /api/v1/metrics/summary - Get aggregated metrics
app.get("/api/v1/metrics/summary", async (req) => {
  const { hours = "24" } = req.query as any;
  const hoursNum = Math.min(Math.max(1, Number(hours) || 24), 168); // 1-168 hours (1 week max)

  return calculateSummary(hoursNum);
});

// Start server
try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`
╔════════════════════════════════════════════╗
║  Signals Backend v${VERSION}                   ║
║  Port: ${PORT}                                ║
║  Signals: ${SIGNALS_ENABLED ? "ENABLED" : "DISABLED"}                        ║
║  CORS: ${ALLOWED_ORIGINS.length} origins                       ║
╚════════════════════════════════════════════╝
  `);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
