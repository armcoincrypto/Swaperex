/**
 * Structured one-line swap observability for browser console / log drains.
 *
 * Grep: [swap:obs]
 * Each line is JSON: { event, ts, ...fields } — no BigInt/symbol values.
 */

export type SwapObsValue = string | number | boolean | null | undefined;

function swapObsEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  const raw = import.meta.env.VITE_DEBUG_SWAP;
  if (typeof raw !== 'string') return false;
  return ['1', 'true', 'yes', 'on'].includes(raw.trim().toLowerCase());
}

export function swapObsLog(event: string, fields: Record<string, SwapObsValue> = {}): void {
  if (!swapObsEnabled()) return;
  try {
    const payload: Record<string, SwapObsValue | number> = { event, ts: Date.now(), ...fields };
    console.info('[swap:obs]', JSON.stringify(payload));
  } catch {
    // Never break swap flow on logging
  }
}
