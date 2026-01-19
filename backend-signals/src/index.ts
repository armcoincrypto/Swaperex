import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { getSignals } from "./api.js";
import {
  scanWallet,
  initializeProviders,
  getProviderHealth,
  shortWallet,
  type ScanConfig,
  type WalletScanProvider,
  SUPPORTED_CHAIN_IDS,
} from "./wallet/index.js";
import {
  getSummary,
  getRecentEvents,
  trackScanStarted,
  trackScanCompleted,
  trackScanError,
  trackAddSelected,
  trackExternalWalletScanned,
} from "./metrics/index.js";

// Configuration
const PORT = Number(process.env.PORT) || 4001;
const SIGNALS_ENABLED = process.env.SIGNALS_ENABLED !== "false";
const WALLET_SCAN_ENABLED = process.env.WALLET_SCAN_ENABLED !== "false";
const WALLET_SCAN_PROVIDER = (process.env.WALLET_SCAN_PROVIDER || "auto") as WalletScanProvider;
const WALLET_SCAN_STRICT = process.env.WALLET_SCAN_STRICT === "true";
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS?.split(",") || [
  "http://localhost:3000",
  "http://localhost:5173",
  "http://207.180.212.142:3000",
  "https://swaperex.com",
  "https://www.swaperex.com"
];

const startTime = Date.now();
const VERSION = "1.1.0";

// Initialize wallet scan providers
const availableProviders = initializeProviders();

const app = Fastify({ logger: true });

// CORS - allow frontend origins (GET and POST for wallet scan)
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
    walletScanEnabled: WALLET_SCAN_ENABLED,
    timestamp: Date.now(),
  };
});

// Rich health check endpoint (for system status UI)
app.get("/api/v1/health", async () => {
  const uptime = Math.floor((Date.now() - startTime) / 1000);

  // Check external API status (DexScreener, GoPlus)
  const externalChecks = await checkExternalApis();

  // Check wallet scan provider health
  const walletProviderHealth = await getProviderHealth();

  // Overall system status
  const signalsEngineStatus = SIGNALS_ENABLED && externalChecks.dexscreener && externalChecks.goplus
    ? "running"
    : SIGNALS_ENABLED && (externalChecks.dexscreener || externalChecks.goplus)
    ? "degraded"
    : SIGNALS_ENABLED
    ? "unavailable"
    : "disabled";

  // Wallet scan status
  const walletScanStatus = WALLET_SCAN_ENABLED && availableProviders.length > 0
    ? Object.values(walletProviderHealth).some(h => h) ? "running" : "degraded"
    : WALLET_SCAN_ENABLED
    ? "unavailable"
    : "disabled";

  return {
    status: signalsEngineStatus === "running" && walletScanStatus !== "unavailable" ? "ok" : "partial",
    signalsEngine: signalsEngineStatus,
    walletScan: walletScanStatus,
    version: VERSION,
    uptime,
    timestamp: Date.now(),
    services: {
      dexscreener: externalChecks.dexscreener ? "up" : "down",
      goplus: externalChecks.goplus ? "up" : "down",
    },
    walletProviders: {
      available: availableProviders,
      health: walletProviderHealth,
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
// Wallet Scan Endpoints
// ============================================================

/**
 * Wallet Scan endpoint
 *
 * GET /api/v1/wallet/scan?chainId=1&wallet=0x...&minUsd=1&strict=false&provider=auto
 *
 * Response shape (contract):
 * {
 *   provider: string,
 *   cached: boolean,
 *   warnings: string[],
 *   stats: { durationMs, transfersScanned, tokensDiscovered, tokensPriced, tokensMissingPrice, tokensFiltered, spamFiltered },
 *   tokens: DiscoveredToken[],
 *   nativeBalance: { symbol, balance, balanceFormatted, priceUsd?, valueUsd?, decimals },
 *   insights?: { biggestPosition?, mostVolatile?, newTokens?, unpricedTokens?, topFive, totalValueUsd, chainSuggestion? }
 * }
 */
app.get("/api/v1/wallet/scan", async (req, reply) => {
  // Kill switch
  if (!WALLET_SCAN_ENABLED) {
    return reply.code(503).send({
      error: "Wallet scan disabled",
      provider: "none",
      cached: false,
      warnings: ["Wallet scan is disabled"],
      stats: { durationMs: 0, transfersScanned: 0, tokensDiscovered: 0, tokensPriced: 0, tokensMissingPrice: 0, tokensFiltered: 0, spamFiltered: 0 },
      tokens: [],
      nativeBalance: { symbol: "ETH", balance: "0", balanceFormatted: "0", decimals: 18 },
    });
  }

  const { chainId, wallet, address, minUsd, strict, provider, includeSpam } = req.query as {
    chainId?: string;
    wallet?: string;
    address?: string; // Alias for wallet
    minUsd?: string;
    strict?: string;
    provider?: string;
    includeSpam?: string;
  };

  // Accept both wallet= and address= parameters
  const walletAddr = wallet || address;

  // Validate required params
  if (!chainId || !walletAddr) {
    return reply.code(400).send({ error: "Missing params: chainId, wallet (or address)" });
  }

  // Validate wallet address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddr)) {
    return reply.code(400).send({ error: "Invalid wallet address format (must be 42 chars: 0x + 40 hex)" });
  }

  // Parse config
  const config: ScanConfig = {
    chainId: Number(chainId),
    wallet: walletAddr.toLowerCase(),
    minUsd: minUsd ? parseFloat(minUsd) : 1, // Default $1 minimum
    strict: strict === "true" || WALLET_SCAN_STRICT,
    provider: (provider as WalletScanProvider) || WALLET_SCAN_PROVIDER,
    includeSpam: includeSpam === "true",
  };

  // Validate chain
  if (!SUPPORTED_CHAIN_IDS.includes(config.chainId)) {
    return reply.code(400).send({
      error: `Chain ${config.chainId} not supported`,
      supportedChains: SUPPORTED_CHAIN_IDS,
    });
  }

  // Track scan start
  await trackScanStarted(config.chainId, config.provider, config.strict, config.minUsd);

  try {
    const result = await scanWallet(config);

    // Track completion
    await trackScanCompleted(
      config.chainId,
      result.provider,
      result.stats.tokensFiltered,
      result.stats.tokensPriced,
      result.stats.spamFiltered,
      result.stats.durationMs,
      result.cached,
    );

    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    // Track error (redact wallet)
    await trackScanError(config.chainId, config.provider, errorMsg.slice(0, 50));

    console.error(`[WalletScan] ERROR chain=${config.chainId} wallet=${shortWallet(walletAddr)} error=${errorMsg.slice(0, 200)}`);

    return reply.code(500).send({
      error: errorMsg.slice(0, 200),
      provider: config.provider,
      cached: false,
      warnings: [errorMsg.slice(0, 200)],
      stats: { durationMs: 0, transfersScanned: 0, tokensDiscovered: 0, tokensPriced: 0, tokensMissingPrice: 0, tokensFiltered: 0, spamFiltered: 0 },
      tokens: [],
      nativeBalance: { symbol: "ETH", balance: "0", balanceFormatted: "0", decimals: 18 },
    });
  }
});

/**
 * Track tokens added from scan
 *
 * POST /api/v1/wallet/scan/add
 * Body: { selectedCount, addedCount, minUsd, provider, strict, chainId, filteredSpam }
 */
app.post("/api/v1/wallet/scan/add", async (req, reply) => {
  const body = req.body as {
    selectedCount?: number;
    addedCount?: number;
    minUsd?: number;
    provider?: string;
    strict?: boolean;
    chainId?: number;
    filteredSpam?: number;
  };

  if (typeof body.selectedCount !== "number" || typeof body.addedCount !== "number") {
    return reply.code(400).send({ error: "Missing params: selectedCount, addedCount" });
  }

  await trackAddSelected(
    body.selectedCount,
    body.addedCount,
    body.minUsd || 0,
    body.provider || "unknown",
    body.strict || false,
    body.chainId || 0,
    body.filteredSpam || 0,
  );

  return { success: true };
});

/**
 * Track external wallet scan (research mode)
 *
 * POST /api/v1/wallet/scan/external
 * Body: { chainId, walletShort }
 */
app.post("/api/v1/wallet/scan/external", async (req, reply) => {
  const body = req.body as {
    chainId?: number;
    walletShort?: string;
  };

  if (typeof body.chainId !== "number" || typeof body.walletShort !== "string") {
    return reply.code(400).send({ error: "Missing params: chainId, walletShort" });
  }

  await trackExternalWalletScanned(body.chainId, body.walletShort);

  return { success: true };
});

/**
 * Wallet scan supported chains
 *
 * GET /api/v1/wallet/chains
 */
app.get("/api/v1/wallet/chains", async () => {
  return {
    chains: SUPPORTED_CHAIN_IDS,
    providers: availableProviders,
  };
});

/**
 * Alias: /api/v1/wallet/tokens → same as /api/v1/wallet/scan
 * For backwards compatibility with existing frontends
 */
app.get("/api/v1/wallet/tokens", async (req, reply) => {
  // Redirect internally to /scan handler by forwarding the request
  const query = req.query as Record<string, string>;
  const params = new URLSearchParams();

  // Map address → wallet if needed
  if (query.address && !query.wallet) {
    params.set('wallet', query.address);
  }
  for (const [key, value] of Object.entries(query)) {
    if (key !== 'address') params.set(key, value);
  }

  return reply.redirect(307, `/api/v1/wallet/scan?${params.toString()}`);
});

// ============================================================
// Metrics Endpoints
// ============================================================

/**
 * Metrics summary
 *
 * GET /api/v1/metrics/summary?hours=24
 */
app.get("/api/v1/metrics/summary", async (req, reply) => {
  const { hours } = req.query as { hours?: string };
  const hoursNum = hours ? parseInt(hours, 10) : 24;

  if (isNaN(hoursNum) || hoursNum < 1 || hoursNum > 168) {
    return reply.code(400).send({ error: "hours must be between 1 and 168" });
  }

  const summary = await getSummary(hoursNum);
  return summary;
});

/**
 * Recent events (for debugging)
 *
 * GET /api/v1/metrics/events?limit=100&type=wallet_scan_completed
 */
app.get("/api/v1/metrics/events", async (req, reply) => {
  const { limit, type } = req.query as { limit?: string; type?: string };
  const limitNum = limit ? parseInt(limit, 10) : 100;

  if (isNaN(limitNum) || limitNum < 1 || limitNum > 1000) {
    return reply.code(400).send({ error: "limit must be between 1 and 1000" });
  }

  const events = await getRecentEvents(limitNum, type as any);
  return { events };
});

// Start server
try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`
╔════════════════════════════════════════════════════╗
║  Swaperex Backend v${VERSION}                         ║
║  Port: ${PORT}                                        ║
║  Signals: ${SIGNALS_ENABLED ? "ENABLED " : "DISABLED"}                              ║
║  Wallet Scan: ${WALLET_SCAN_ENABLED ? "ENABLED " : "DISABLED"}                          ║
║  Providers: ${availableProviders.length > 0 ? availableProviders.join(", ") : "none"}                            ║
║  CORS: ${ALLOWED_ORIGINS.length} origins                             ║
╚════════════════════════════════════════════════════╝
  `);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
