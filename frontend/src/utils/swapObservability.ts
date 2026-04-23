/**
 * Structured one-line swap observability for browser console / log drains.
 *
 * Grep: [swap:obs]
 * Each line is JSON: { event, ts, ...fields } — no BigInt/symbol values.
 */

export type SwapObsValue = string | number | boolean | null | undefined;

export function swapObsLog(event: string, fields: Record<string, SwapObsValue> = {}): void {
  try {
    const payload: Record<string, SwapObsValue | number> = { event, ts: Date.now(), ...fields };
    console.info('[swap:obs]', JSON.stringify(payload));
  } catch {
    // Never break swap flow on logging
  }
}
