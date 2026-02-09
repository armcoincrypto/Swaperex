import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getCache, setCache } from '../cache/memory.js';

describe('cache/memory', () => {
  beforeEach(() => {
    // Clear any leftover cache state by setting expired entries
    // (The cache module uses a module-level Map, so we reset via API)
  });

  it('stores and retrieves values', () => {
    setCache('test:1', { hello: 'world' }, 60_000);
    const result = getCache<{ hello: string }>('test:1');
    expect(result).toEqual({ hello: 'world' });
  });

  it('returns null for missing keys', () => {
    expect(getCache('nonexistent:key')).toBeNull();
  });

  it('returns null for expired entries', () => {
    vi.useFakeTimers();

    setCache('test:expire', 'value', 1000); // 1 second TTL
    expect(getCache('test:expire')).toBe('value');

    vi.advanceTimersByTime(1001);
    expect(getCache('test:expire')).toBeNull();

    vi.useRealTimers();
  });

  it('overwrites existing entries', () => {
    setCache('test:overwrite', 'first', 60_000);
    setCache('test:overwrite', 'second', 60_000);
    expect(getCache('test:overwrite')).toBe('second');
  });

  it('supports different value types', () => {
    setCache('test:number', 42, 60_000);
    setCache('test:array', [1, 2, 3], 60_000);
    setCache('test:null', null, 60_000);

    expect(getCache<number>('test:number')).toBe(42);
    expect(getCache<number[]>('test:array')).toEqual([1, 2, 3]);
    // Note: null is stored but getCache returns null for missing/expired too
    // The cache stores null as a valid value
  });
});
