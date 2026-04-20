/**
 * 1inch Classic Swap API proxy — browser calls same-origin /oneinch/...; server adds API key.
 * Forwards GET only to https://api.1inch.dev/swap/v6.0/... with query string preserved.
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { randomUUID } from "crypto";

const ONEINCH_UPSTREAM = "https://api.1inch.dev/swap/v6.0";

const SUPPORTED_CHAINS = new Set([
  1, 56, 137, 42161, 10, 43114, 100, 250, 8453,
]);

/** Allowed segments after /swap/v6.0/{chainId}/ (Classic Swap read-only + unsigned tx build). */
const ALLOWED_RESOURCE = new Set([
  "quote",
  "swap",
  "approve/spender",
  "approve/transaction",
  "approve/allowance",
]);

/** `*` in `/oneinch/*` is e.g. `swap/v6.0/1/quote` (same path shape as upstream after /swap/v6.0/). */
function parseTail(star: string): { chainId: number; resource: string } | null {
  const s = star.replace(/^\/+|\/+$/g, "");
  const prefix = "swap/v6.0/";
  if (!s.startsWith(prefix)) return null;
  const rest = s.slice(prefix.length); // "1/quote"
  const slash = rest.indexOf("/");
  if (slash < 0) return null;
  const chainStr = rest.slice(0, slash);
  const resource = rest.slice(slash + 1);
  const chainId = Number(chainStr);
  if (!Number.isInteger(chainId) || chainId < 1) return null;
  if (!SUPPORTED_CHAINS.has(chainId)) return null;
  if (!resource || !ALLOWED_RESOURCE.has(resource)) return null;
  return { chainId, resource };
}

export async function registerOneInchProxy(app: FastifyInstance): Promise<void> {
  app.get("/oneinch/*", async (req: FastifyRequest, reply: FastifyReply) => {
    const rid = randomUUID().slice(0, 10);
    reply.header("x-oneinch-proxy-request-id", rid);

    const star = (req.params as Record<string, string>)["*"] ?? "";
    const parsed = parseTail(star);
    if (!parsed) {
      req.log.warn({ rid, star }, "[1inch proxy] rejected path");
      return reply.code(400).send({
        error: "Unsupported 1inch proxy path or chain",
        requestId: rid,
      });
    }

    const incoming = new URL(req.url, "http://127.0.0.1");
    const upstream = new URL(`${ONEINCH_UPSTREAM}/${parsed.chainId}/${parsed.resource}`);
    upstream.search = incoming.search;

    const headers: Record<string, string> = { Accept: "application/json" };
    const key = process.env.ONEINCH_API_KEY?.trim();
    if (key) {
      headers.Authorization = `Bearer ${key}`;
    } else {
      req.log.warn({ rid }, "[1inch proxy] ONEINCH_API_KEY unset — upstream may rate-limit");
    }

    const t0 = Date.now();
    try {
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), 25_000);
      const res = await fetch(upstream.toString(), { method: "GET", headers, signal: controller.signal });
      clearTimeout(to);
      const body = await res.text();
      req.log.info(
        { rid, status: res.status, ms: Date.now() - t0, chainId: parsed.chainId, resource: parsed.resource },
        "[1inch proxy] upstream",
      );
      const ct = res.headers.get("content-type");
      if (ct) reply.header("Content-Type", ct);
      return reply.code(res.status).send(body);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      req.log.error({ rid, err: msg }, "[1inch proxy] upstream failed");
      return reply.code(502).send({
        error: "1inch upstream unreachable",
        detail: msg,
        requestId: rid,
      });
    }
  });
}
