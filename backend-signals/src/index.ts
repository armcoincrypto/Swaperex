import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { getSignals } from "./api.js";
import { getCache, setCache } from "./cache/memory.js";

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

// ── Wallet Scan Summary (Phase 3) ──────────────────────────────────

const SCAN_SUMMARY_CACHE_TTL = 60_000; // 1 minute

interface ScanSummaryBody {
  wallet: string;
  chainIds: number[];
  tokenAddresses?: string[];
}

interface TokenSummary {
  address: string;
  chainId: number;
  symbol: string;
  balance: string;
  riskLevel?: "low" | "medium" | "high" | "unknown";
}

app.post<{ Body: ScanSummaryBody }>("/api/v1/wallet/scan-summary", async (req, reply) => {
  const { wallet, chainIds, tokenAddresses } = req.body || {};

  if (!wallet || !chainIds?.length) {
    return reply.code(400).send({ error: "Missing required fields: wallet, chainIds" });
  }

  // Validate wallet address format
  if (!/^0x[a-fA-F0-9]{40}$/.test(wallet)) {
    return reply.code(400).send({ error: "Invalid wallet address" });
  }

  // Validate chainIds (only support 1, 56, 137)
  const supportedChains = [1, 56, 137];
  const validChainIds = chainIds.filter((id: number) => supportedChains.includes(id));
  if (validChainIds.length === 0) {
    return reply.code(400).send({ error: "No supported chainIds. Supported: 1 (ETH), 56 (BSC), 137 (Polygon)" });
  }

  // Check cache
  const tokenKey = tokenAddresses?.sort().join(",") || "all";
  const cacheKey = `scan:${wallet.toLowerCase()}:${validChainIds.sort().join(",")}:${tokenKey}`;
  const cached = getCache<any>(cacheKey);
  if (cached) {
    return { ...cached, cached: true };
  }

  // Fetch risk data for requested tokens (if any specific tokens provided)
  const tokens: TokenSummary[] = [];
  const riskPromises: Promise<void>[] = [];

  if (tokenAddresses?.length) {
    for (const addr of tokenAddresses.slice(0, 50)) { // Cap at 50 tokens
      for (const chainId of validChainIds) {
        riskPromises.push(
          (async () => {
            try {
              const riskController = new AbortController();
              const riskTimeout = setTimeout(() => riskController.abort(), 5000);
              const res = await fetch(
                `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${addr.toLowerCase()}`,
                { signal: riskController.signal }
              );
              clearTimeout(riskTimeout);

              if (!res.ok) {
                tokens.push({ address: addr, chainId, symbol: "", balance: "0", riskLevel: "unknown" });
                return;
              }

              const data = await res.json() as any;
              const tokenData = data?.result?.[addr.toLowerCase()];
              if (!tokenData) {
                tokens.push({ address: addr, chainId, symbol: "", balance: "0", riskLevel: "unknown" });
                return;
              }

              // Determine risk level from GoPlus flags
              const isHoneypot = tokenData.is_honeypot === "1";
              const cantSell = tokenData.cannot_sell_all === "1";
              const highTax = Number(tokenData.sell_tax || 0) > 0.1;
              const riskLevel = isHoneypot || cantSell ? "high" : highTax ? "medium" : "low";

              tokens.push({
                address: addr,
                chainId,
                symbol: tokenData.token_symbol || "",
                balance: "0", // Balance fetched client-side
                riskLevel,
              });
            } catch {
              tokens.push({ address: addr, chainId, symbol: "", balance: "0", riskLevel: "unknown" });
            }
          })()
        );
      }
    }
  }

  // Execute all risk checks concurrently (max 50 * 3 = 150 but capped at 50 tokens)
  await Promise.all(riskPromises);

  const result = {
    wallet: wallet.toLowerCase(),
    chainIds: validChainIds,
    tokens,
    totalTokens: tokens.length,
    timestamp: Date.now(),
    cached: false,
  };

  // Cache the result
  setCache(cacheKey, result, SCAN_SUMMARY_CACHE_TTL);

  return result;
});

// ── RPC Proxy (bypasses browser CORS restrictions) ──────────────────
// Frontend calls /rpc/:chain with JSON-RPC body; we forward server-side.
// Server-to-server requests have no CORS restrictions.

const RPC_TARGETS: Record<string, string[]> = {
  eth: [
    "https://ethereum-rpc.publicnode.com",
    "https://1rpc.io/eth",
    "https://eth.llamarpc.com",
  ],
  bsc: [
    "https://bsc-dataseed.binance.org",
    "https://bsc-dataseed1.defibit.io",
  ],
  polygon: [
    "https://polygon-bor-rpc.publicnode.com",
    "https://1rpc.io/matic",
    "https://polygon.llamarpc.com",
  ],
  arbitrum: [
    "https://arb1.arbitrum.io/rpc",
    "https://1rpc.io/arb",
  ],
};

// Track which RPC index to use per chain (round-robin on failure)
const rpcIndex: Record<string, number> = {};

app.post<{ Params: { chain: string } }>("/rpc/:chain", async (req, reply) => {
  const { chain } = req.params;
  const targets = RPC_TARGETS[chain];
  if (!targets) {
    return reply.code(400).send({ error: `Unsupported chain: ${chain}. Supported: ${Object.keys(RPC_TARGETS).join(", ")}` });
  }

  // Validate JSON-RPC body
  const body = req.body as any;
  if (!body || !body.method) {
    return reply.code(400).send({ error: "Invalid JSON-RPC request" });
  }

  // Only allow read methods (no signing, no state changes)
  const ALLOWED_METHODS = [
    "eth_call", "eth_getBalance", "eth_getTransactionCount",
    "eth_getTransactionReceipt", "eth_getTransactionByHash",
    "eth_blockNumber", "eth_getBlockByNumber", "eth_chainId",
    "eth_gasPrice", "eth_estimateGas", "eth_getCode",
    "eth_getLogs", "eth_getStorageAt", "net_version",
  ];
  if (!ALLOWED_METHODS.includes(body.method)) {
    return reply.code(403).send({ error: `Method not allowed: ${body.method}` });
  }

  // Try RPCs with fallback
  const startIdx = rpcIndex[chain] || 0;
  for (let i = 0; i < targets.length; i++) {
    const idx = (startIdx + i) % targets.length;
    const target = targets[idx];
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000);
      const res = await fetch(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) continue;

      const data = await res.json();
      // Update index to use this working RPC next time
      rpcIndex[chain] = idx;
      return data;
    } catch {
      // Try next RPC
      continue;
    }
  }

  // All RPCs failed — rotate to next for future requests
  rpcIndex[chain] = (startIdx + 1) % targets.length;
  return reply.code(502).send({ error: "All RPC endpoints failed", chain });
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
