/**
 * Screener Cache
 *
 * Two-layer caching: in-memory (fast) + localStorage (persistent fallback).
 * Each key has an independent TTL. Expired entries return null.
 */

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const memoryCache = new Map<string, CacheEntry<unknown>>();

const LS_PREFIX = 'swaperex-screener-cache:';

/** Get from cache (memory first, then localStorage) */
export function cacheGet<T>(key: string): T | null {
  // Memory check
  const mem = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (mem && Date.now() < mem.expiresAt) {
    return mem.data;
  }
  if (mem) memoryCache.delete(key);

  // localStorage fallback
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    if (raw) {
      const entry: CacheEntry<T> = JSON.parse(raw);
      if (Date.now() < entry.expiresAt) {
        // Promote back to memory
        memoryCache.set(key, entry);
        return entry.data;
      }
      localStorage.removeItem(LS_PREFIX + key);
    }
  } catch {
    // Corrupt data - ignore
  }

  return null;
}

/** Set in both memory and localStorage */
export function cacheSet<T>(key: string, data: T, ttlMs: number): void {
  const entry: CacheEntry<T> = { data, expiresAt: Date.now() + ttlMs };
  memoryCache.set(key, entry);
  try {
    localStorage.setItem(LS_PREFIX + key, JSON.stringify(entry));
  } catch {
    // localStorage full or disabled - memory-only is fine
  }
}

/** Check if key exists and is not expired */
export function cacheHas(key: string): boolean {
  return cacheGet(key) !== null;
}

/** Clear all screener cache entries from memory and localStorage */
export function cacheClear(): void {
  memoryCache.clear();
  try {
    const keys = Object.keys(localStorage).filter(k => k.startsWith(LS_PREFIX));
    for (const k of keys) localStorage.removeItem(k);
  } catch {
    // Ignore
  }
}

/** Purge expired entries (call periodically) */
export function cachePurge(): void {
  const now = Date.now();
  for (const [key, entry] of memoryCache) {
    if (now >= entry.expiresAt) memoryCache.delete(key);
  }
}
