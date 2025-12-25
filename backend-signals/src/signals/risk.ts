import fetch from "node-fetch";
import { getCache, setCache } from "../cache/memory.js";

export async function checkRiskChange(
  chainId: number,
  token: string
) {
  const key = `risk:${chainId}:${token}`;
  const cached = getCache(key);
  if (cached) return cached;

  try {
    const url = `https://api.gopluslabs.io/api/v1/token_security/${chainId}?contract_addresses=${token}`;
    const res = await fetch(url);
    const json = await res.json() as any;

    const info = json.result?.[token];
    if (!info) return null;

    const status = info.is_honeypot === "1" ? "danger" : "safe";
    setCache(key, status, 300_000);

    return { current: status };
  } catch (err) {
    console.error("[risk] API error:", (err as Error).message);
    return null;
  }
}
