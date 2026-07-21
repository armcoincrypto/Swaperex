/** Single executable-quote freshness boundary used by hook, preview reuse, and UI countdown. */
export const QUOTE_FRESHNESS_TTL_MS = 30_000;
export const QUOTE_FRESHNESS_TTL_SECONDS = QUOTE_FRESHNESS_TTL_MS / 1_000;

export function isExecutableQuoteExpired(quotedAt: number, now = Date.now()): boolean {
  return now - quotedAt >= QUOTE_FRESHNESS_TTL_MS;
}
