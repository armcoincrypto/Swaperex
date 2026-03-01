type Entry<T> = {
  value: T;
  expires: number;
};

const cache = new Map<string, Entry<any>>();

export function getCache<T>(key: string): T | null {
  const item = cache.get(key);
  if (!item || Date.now() > item.expires) {
    cache.delete(key);
    return null;
  }
  return item.value;
}

export function setCache<T>(key: string, value: T, ttlMs: number) {
  cache.set(key, { value, expires: Date.now() + ttlMs });
}
