/**
 * fetchWithTimeout - Reliable HTTP fetch with timeout and retry
 *
 * Features:
 * - Configurable timeout (default 15s)
 * - Retry on 429/5xx with jitter (default 1 retry)
 * - Provider-aware error messages for user-facing display
 *
 * Usage:
 *   const data = await fetchWithTimeout(url, { headers }, {
 *     timeoutMs: 15000,
 *     retries: 1,
 *     retryOn: [429, 500, 502, 503, 504],
 *     provider: '1inch',
 *   });
 */

export interface FetchWithTimeoutOptions {
  /** Timeout in milliseconds (default: 15000) */
  timeoutMs?: number;
  /** Number of retries on retryable status codes (default: 1) */
  retries?: number;
  /** HTTP status codes to retry on (default: [429, 500, 502, 503, 504]) */
  retryOn?: number[];
  /** Provider name for user-facing error messages (e.g. '1inch', 'Uniswap') */
  provider?: string;
}

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RETRIES = 1;
const DEFAULT_RETRY_ON = [429, 500, 502, 503, 504];
const JITTER_MIN_MS = 1500;
const JITTER_MAX_MS = 2500;

/**
 * Generate random jitter between min and max ms
 */
function randomJitter(): number {
  return JITTER_MIN_MS + Math.random() * (JITTER_MAX_MS - JITTER_MIN_MS);
}

/**
 * Sleep for given ms
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Create a user-friendly error message including provider name
 */
function makeErrorMessage(provider: string | undefined, status: number): string {
  const prefix = provider ? `${provider}: ` : '';
  if (status === 429) {
    return `${prefix}Rate limited. Please try again in a few seconds.`;
  }
  if (status >= 500) {
    return `${prefix}Service temporarily unavailable (${status}). Please try again.`;
  }
  return `${prefix}Request failed with status ${status}.`;
}

/**
 * Fetch with timeout and optional retry.
 *
 * @throws {Error} on timeout, network failure, or non-retryable HTTP error
 * @returns The Response object (caller should check .ok / parse body)
 */
export async function fetchWithTimeout(
  url: string | URL,
  init?: RequestInit,
  opts?: FetchWithTimeoutOptions,
): Promise<Response> {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    retries = DEFAULT_RETRIES,
    retryOn = DEFAULT_RETRY_ON,
    provider,
  } = opts ?? {};

  let lastError: Error | null = null;
  const maxAttempts = 1 + retries;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        ...init,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // If response is retryable and we have retries left, retry with jitter
      if (retryOn.includes(response.status) && attempt < maxAttempts - 1) {
        const jitter = randomJitter();
        console.warn(
          `[fetchWithTimeout] ${provider || 'fetch'} returned ${response.status}, retrying in ${Math.round(jitter)}ms (attempt ${attempt + 1}/${maxAttempts})`,
        );
        await sleep(jitter);
        continue;
      }

      return response;
    } catch (err) {
      clearTimeout(timeoutId);

      if (err instanceof DOMException && err.name === 'AbortError') {
        lastError = new Error(
          `${provider ? provider + ': ' : ''}Request timed out after ${timeoutMs / 1000}s. Please try again.`,
        );
      } else if (err instanceof Error) {
        // Network error (offline, DNS, CORS, etc.)
        lastError = new Error(
          `${provider ? provider + ': ' : ''}Network error: ${err.message}`,
        );
      } else {
        lastError = new Error(
          `${provider ? provider + ': ' : ''}Unknown fetch error`,
        );
      }

      // Retry on network errors if retries remain
      if (attempt < maxAttempts - 1) {
        const jitter = randomJitter();
        console.warn(
          `[fetchWithTimeout] ${provider || 'fetch'} network error, retrying in ${Math.round(jitter)}ms (attempt ${attempt + 1}/${maxAttempts})`,
        );
        await sleep(jitter);
        continue;
      }
    }
  }

  throw lastError ?? new Error('fetchWithTimeout: unexpected failure');
}

export { makeErrorMessage };
export default fetchWithTimeout;
