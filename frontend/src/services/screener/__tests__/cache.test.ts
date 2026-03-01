import { describe, it, expect, beforeEach, vi } from 'vitest';
import { cacheGet, cacheSet, cacheClear, cacheHas } from '../cache';

describe('screener cache', () => {
  beforeEach(() => {
    cacheClear();
  });

  it('returns null for missing key', () => {
    expect(cacheGet('nonexistent')).toBeNull();
  });

  it('stores and retrieves value', () => {
    cacheSet('test-key', { foo: 'bar' }, 60_000);
    expect(cacheGet('test-key')).toEqual({ foo: 'bar' });
  });

  it('cacheHas returns true for existing key', () => {
    cacheSet('exists', 42, 60_000);
    expect(cacheHas('exists')).toBe(true);
    expect(cacheHas('missing')).toBe(false);
  });

  it('returns null for expired entries', () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    cacheSet('expiring', 'data', 1000); // 1 second TTL
    expect(cacheGet('expiring')).toBe('data');

    // Advance past TTL
    vi.setSystemTime(now + 1500);
    expect(cacheGet('expiring')).toBeNull();

    vi.useRealTimers();
  });

  it('cacheClear removes all entries', () => {
    cacheSet('a', 1, 60_000);
    cacheSet('b', 2, 60_000);
    cacheClear();
    expect(cacheGet('a')).toBeNull();
    expect(cacheGet('b')).toBeNull();
  });

  it('handles non-string data types', () => {
    cacheSet('array', [1, 2, 3], 60_000);
    expect(cacheGet('array')).toEqual([1, 2, 3]);

    cacheSet('number', 42, 60_000);
    expect(cacheGet('number')).toBe(42);

    cacheSet('nested', { a: { b: 'c' } }, 60_000);
    expect(cacheGet('nested')).toEqual({ a: { b: 'c' } });
  });

  it('overwrites existing keys', () => {
    cacheSet('key', 'old', 60_000);
    cacheSet('key', 'new', 60_000);
    expect(cacheGet('key')).toBe('new');
  });
});
