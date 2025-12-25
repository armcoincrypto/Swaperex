import fetch from "node-fetch";
import { getCache, setCache } from "../cache/memory.js";

export async function checkLiquidityDrop(
  chainId: number,
  token: string
) {
  const key = `liq:${chainId}:${token}`;
  const cached = getCache(key);
  if (cached) return cached;

  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${token}`;
    const res = await fetch(url);
    const data = await res.json() as any;

    const pair = data.pairs?.[0];
    if (!pair?.liquidity?.usd) return null;

    const change = pair.liquidityChange?.m10 ?? 0;
    if (change <= -30) {
      const result = {
        dropPct: Math.abs(change),
        window: "10m",
        severity: change <= -50 ? "danger" : "warning"
      };
      setCache(key, result, 120_000);
      return result;
    }

    return null;
  } catch (err) {
    console.error("[liquidity] API error:", (err as Error).message);
    return null;
  }
}
