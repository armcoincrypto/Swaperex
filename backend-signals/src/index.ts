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

// CORS - allow frontend origins (use 'true' to reflect any origin;
// all endpoints are read-only so permissive CORS is safe)
await app.register(cors, {
  origin: true,
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Accept"],
});

// Rate limiting - 600 requests per minute per IP
// Portfolio refresh needs ~30+ RPC calls per cycle (native + tokens × chains)
await app.register(rateLimit, {
  max: 600,
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

// ── RPC Diagnostic Endpoint ──────────────────────────────────────────
// Visit /rpc/test in browser to verify server-side RPC connectivity

app.get("/rpc/test", async () => {
  const results: Record<string, { ok: boolean; rpc: string; blockNumber?: string; error?: string; latencyMs: number }> = {};

  for (const [chain, rpcs] of Object.entries(RPC_TARGETS)) {
    const rpc = rpcs[0];
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(rpc, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "eth_blockNumber", params: [], id: 1 }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!res.ok) {
        results[chain] = { ok: false, rpc, error: `HTTP ${res.status}`, latencyMs: Date.now() - start };
        continue;
      }

      const data = await res.json() as any;
      results[chain] = {
        ok: !!data.result,
        rpc,
        blockNumber: data.result || undefined,
        error: data.error?.message || undefined,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      results[chain] = {
        ok: false,
        rpc,
        error: err instanceof Error ? err.message : "Unknown error",
        latencyMs: Date.now() - start,
      };
    }
  }

  return { timestamp: Date.now(), results };
});

// Only allow read methods (no signing, no state changes)
const ALLOWED_METHODS = new Set([
  "eth_call", "eth_getBalance", "eth_getTransactionCount",
  "eth_getTransactionReceipt", "eth_getTransactionByHash",
  "eth_blockNumber", "eth_getBlockByNumber", "eth_chainId",
  "eth_gasPrice", "eth_estimateGas", "eth_getCode",
  "eth_getLogs", "eth_getStorageAt", "net_version",
]);

/** Forward a JSON-RPC payload (single or batch) to chain RPCs with failover */
async function forwardToRpc(chain: string, payload: any): Promise<any> {
  const targets = RPC_TARGETS[chain];
  if (!targets) return null;

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
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (!res.ok) continue;

      const data = await res.json();
      rpcIndex[chain] = idx;
      return data;
    } catch {
      continue;
    }
  }

  rpcIndex[chain] = (startIdx + 1) % targets.length;
  return null;
}

app.post<{ Params: { chain: string } }>("/rpc/:chain", async (req, reply) => {
  // Explicit CORS headers (safety net in case plugin misses)
  const origin = req.headers.origin;
  if (origin) {
    reply.header("Access-Control-Allow-Origin", origin);
    reply.header("Access-Control-Allow-Methods", "POST, OPTIONS");
    reply.header("Access-Control-Allow-Headers", "Content-Type");
  }

  const { chain } = req.params;
  if (!RPC_TARGETS[chain]) {
    return reply.code(400).send({ error: `Unsupported chain: ${chain}. Supported: ${Object.keys(RPC_TARGETS).join(", ")}` });
  }

  const body = req.body as any;
  if (!body) {
    return reply.code(400).send({ jsonrpc: "2.0", error: { code: -32600, message: "Empty request body" }, id: null });
  }

  // ── Batch request (ethers.js v6 batches multiple calls) ──
  if (Array.isArray(body)) {
    // Validate all methods in the batch
    for (const item of body) {
      if (!item?.method || !ALLOWED_METHODS.has(item.method)) {
        return reply.send(body.map((item: any) => ({
          jsonrpc: "2.0",
          error: { code: -32601, message: `Method not allowed: ${item?.method}` },
          id: item?.id ?? null,
        })));
      }
    }

    // Forward entire batch to RPC (most RPCs support batch natively)
    const result = await forwardToRpc(chain, body);
    if (!result) {
      return reply.code(502).send(body.map((item: any) => ({
        jsonrpc: "2.0",
        error: { code: -32000, message: "All RPC endpoints failed" },
        id: item?.id ?? null,
      })));
    }
    return result;
  }

  // ── Single request ──
  if (!body.method) {
    return reply.send({ jsonrpc: "2.0", error: { code: -32600, message: "Missing method" }, id: body.id ?? null });
  }

  if (!ALLOWED_METHODS.has(body.method)) {
    return reply.send({ jsonrpc: "2.0", error: { code: -32601, message: `Method not allowed: ${body.method}` }, id: body.id ?? null });
  }

  const result = await forwardToRpc(chain, body);
  if (!result) {
    return reply.code(502).send({ jsonrpc: "2.0", error: { code: -32000, message: "All RPC endpoints failed" }, id: body.id ?? null });
  }
  return result;
});

// ── Explorer API Proxy (bypasses browser CORS/rate-limit issues) ─────
// Frontend calls /explorer/:chain?module=account&action=txlist&...
// Uses Etherscan V2 UNIFIED endpoint for ETH/Polygon/Arbitrum.
// BSC requires separate BSCScan API key (free tier at bscscan.com/apis).
// V1 was deprecated August 2025 on Etherscan; BSCScan may still work with V1+key.
// Docs: https://docs.etherscan.io/etherscan-v2

const ETHERSCAN_V2_API = "https://api.etherscan.io/v2/api";
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || "";
const BSCSCAN_API_KEY = process.env.BSCSCAN_API_KEY || "";

const EXPLORER_CHAIN_IDS: Record<string, number> = {
  eth: 1,
  bsc: 56,
  polygon: 137,
  arbitrum: 42161,
};

/** Build the correct explorer API URL for a given chain */
function buildExplorerUrl(chain: string, chainId: number, params: Record<string, string>): string {
  // All chains use Etherscan V2 unified endpoint.
  // BSC uses a separate API key (migrated BSCScan subscription may have BSC access).
  const url = new URL(ETHERSCAN_V2_API);
  url.searchParams.set("chainid", String(chainId));
  const key = chain === "bsc" && BSCSCAN_API_KEY ? BSCSCAN_API_KEY : ETHERSCAN_API_KEY;
  if (key) url.searchParams.set("apikey", key);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

// ── Explorer Diagnostic Endpoint ──────────────────────────────────────
// Visit /explorer/test?address=0x... to verify server-side explorer connectivity
app.get("/explorer/test", async (req) => {
  const { address } = req.query as { address?: string };
  const testAddr = address || "0x509c0968eB30D6CB0c3A1c2E55a5320196ed0196";

  const results: Record<string, { ok: boolean; status?: string; message?: string; txCount?: number; error?: string; errorDetail?: string; hasApiKey: boolean; latencyMs: number }> = {};

  const chains = Object.entries(EXPLORER_CHAIN_IDS);
  for (let i = 0; i < chains.length; i++) {
    const [chain, chainId] = chains[i];
    const isBsc = chain === "bsc";
    const hasKey = isBsc ? !!BSCSCAN_API_KEY : !!ETHERSCAN_API_KEY;

    const start = Date.now();
    try {
      const apiUrl = buildExplorerUrl(chain, chainId, {
        module: "account",
        action: "txlist",
        address: testAddr,
        startblock: "0",
        endblock: "99999999",
        page: "1",
        offset: "3",
        sort: "desc",
      });

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(apiUrl, { signal: controller.signal });
      clearTimeout(timeout);

      if (!res.ok) {
        results[chain] = { ok: false, error: `HTTP ${res.status}`, hasApiKey: hasKey, latencyMs: Date.now() - start };
        continue;
      }

      const data = await res.json() as any;
      results[chain] = {
        ok: data.status === "1",
        status: data.status,
        message: data.message,
        txCount: Array.isArray(data.result) ? data.result.length : 0,
        errorDetail: typeof data.result === "string" ? data.result : undefined,
        hasApiKey: hasKey,
        latencyMs: Date.now() - start,
      };
    } catch (err) {
      results[chain] = {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
        hasApiKey: hasKey,
        latencyMs: Date.now() - start,
      };
    }
  }

  return { timestamp: Date.now(), address: testAddr, results };
});

app.get<{ Params: { chain: string } }>("/explorer/:chain", async (req, reply) => {
  const { chain } = req.params;
  const chainId = EXPLORER_CHAIN_IDS[chain];
  if (!chainId) {
    return reply.code(400).send({ status: "0", message: `Unsupported chain: ${chain}. Supported: ${Object.keys(EXPLORER_CHAIN_IDS).join(", ")}` });
  }

  // Build URL: BSC → BSCScan API, others → Etherscan V2 unified
  const query = req.query as Record<string, string>;
  const apiUrl = buildExplorerUrl(chain, chainId, query);

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(apiUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      console.log(`[Explorer] ${chain} → HTTP ${res.status} (${Date.now() - start}ms)`);
      return reply.code(502).send({ status: "0", message: `Explorer returned HTTP ${res.status}` });
    }

    const data = await res.json() as any;
    const txCount = Array.isArray(data.result) ? data.result.length : 0;
    const detail = typeof data.result === "string" ? ` err="${data.result}"` : "";
    console.log(`[Explorer] ${chain} → status=${data.status} txs=${txCount}${detail} (${Date.now() - start}ms)`);
    return data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Explorer request failed";
    console.log(`[Explorer] ${chain} → ERROR: ${msg} (${Date.now() - start}ms)`);
    return reply.code(502).send({ status: "0", message: msg });
  }
});

// ── CoinGecko Markets Proxy (bypasses browser CORS) ──────────────────
// Frontend screener calls /coingecko/markets?category=...&per_page=...&page=...
// Server-side fetch avoids CORS blocks from CoinGecko on non-localhost origins.

const COINGECKO_API = "https://api.coingecko.com/api/v3";
const CG_CACHE: Record<string, { data: any; expiresAt: number }> = {};
const CG_CACHE_TTL = 60_000; // 1 minute

app.get("/coingecko/markets", async (req, reply) => {
  const query = req.query as Record<string, string>;
  const category = query.category || "ethereum-ecosystem";
  const perPage = Math.min(Number(query.per_page) || 100, 250);
  const page = Math.min(Number(query.page) || 1, 5);

  // Build upstream URL
  const url = new URL(`${COINGECKO_API}/coins/markets`);
  url.searchParams.set("vs_currency", "usd");
  url.searchParams.set("category", category);
  url.searchParams.set("order", "market_cap_desc");
  url.searchParams.set("per_page", String(perPage));
  url.searchParams.set("page", String(page));
  url.searchParams.set("sparkline", "false");
  url.searchParams.set("price_change_percentage", "1h,24h");

  const cacheKey = `cg:${category}:${perPage}:${page}`;

  // Check cache
  const cached = CG_CACHE[cacheKey];
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeout);

    if (res.status === 429) {
      // Rate limited — return cached if available
      console.log(`[CoinGecko] ${category} p${page} → 429 rate limited (${Date.now() - start}ms)`);
      if (cached) return cached.data;
      return reply.code(429).send({ error: "CoinGecko rate limited", cached: false });
    }

    if (!res.ok) {
      console.log(`[CoinGecko] ${category} p${page} → HTTP ${res.status} (${Date.now() - start}ms)`);
      if (cached) return cached.data;
      return reply.code(502).send({ error: `CoinGecko HTTP ${res.status}` });
    }

    const data = await res.json();
    CG_CACHE[cacheKey] = { data, expiresAt: Date.now() + CG_CACHE_TTL };
    console.log(`[CoinGecko] ${category} p${page} → ${Array.isArray(data) ? data.length : 0} tokens (${Date.now() - start}ms)`);
    return data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "CoinGecko request failed";
    console.log(`[CoinGecko] ${category} p${page} → ERROR: ${msg} (${Date.now() - start}ms)`);
    if (cached) return cached.data;
    return reply.code(502).send({ error: msg });
  }
});

// CoinGecko simple/price proxy (portfolio prices — bypasses CORS)
app.get("/coingecko/simple/price", async (req, reply) => {
  const query = req.query as Record<string, string>;
  const ids = query.ids || "";
  const vsCurrencies = query.vs_currencies || "usd";

  const url = new URL(`${COINGECKO_API}/simple/price`);
  url.searchParams.set("ids", ids);
  url.searchParams.set("vs_currencies", vsCurrencies);

  const cacheKey = `cg:simple:${ids}`;
  const cached = CG_CACHE[cacheKey];
  if (cached && Date.now() < cached.expiresAt) {
    return cached.data;
  }

  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timeout);

    if (res.status === 429) {
      if (cached) return cached.data;
      return reply.code(429).send({ error: "CoinGecko rate limited" });
    }

    if (!res.ok) {
      if (cached) return cached.data;
      return reply.code(502).send({ error: `CoinGecko HTTP ${res.status}` });
    }

    const data = await res.json();
    CG_CACHE[cacheKey] = { data, expiresAt: Date.now() + CG_CACHE_TTL };
    return data;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "CoinGecko request failed";
    if (cached) return cached.data;
    return reply.code(502).send({ error: msg });
  }
});

// Start server
try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`
╔════════════════════════════════════════════╗
║  Signals Backend v${VERSION}                   ║
║  Port: ${PORT}                                ║
║  Signals: ${SIGNALS_ENABLED ? "ENABLED" : "DISABLED"}                        ║
║  Etherscan V2: ${ETHERSCAN_API_KEY ? "KEY SET" : "NO KEY"}                     ║
║  BSCScan:      ${BSCSCAN_API_KEY ? "KEY SET" : "NO KEY"}                     ║
╚════════════════════════════════════════════╝
  `);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
