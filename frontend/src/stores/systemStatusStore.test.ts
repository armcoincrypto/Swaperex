import { describe, expect, it } from 'vitest';
import {
  SYSTEM_STATUS_STALE_MS,
  getSystemDisplayLabel,
  resolveSystemDisplayStatus,
} from './systemStatusStore';

describe('resolveSystemDisplayStatus', () => {
  const now = 1_700_000_000_000;

  it('returns unknown before any successful check', () => {
    expect(
      resolveSystemDisplayStatus({
        status: 'degraded',
        lastCheck: null,
        failureCount: 0,
        now,
      }),
    ).toBe('unknown');
  });

  it('returns unavailable when checks fail without prior success', () => {
    expect(
      resolveSystemDisplayStatus({
        status: 'unavailable',
        lastCheck: null,
        failureCount: 2,
        now,
      }),
    ).toBe('unavailable');
  });

  it('returns stale when last successful check is older than threshold', () => {
    expect(
      resolveSystemDisplayStatus({
        status: 'stable',
        lastCheck: now - SYSTEM_STATUS_STALE_MS - 1,
        failureCount: 0,
        now,
      }),
    ).toBe('stale');
  });

  it('returns fresh stable when evidence is recent', () => {
    expect(
      resolveSystemDisplayStatus({
        status: 'stable',
        lastCheck: now - 30_000,
        failureCount: 0,
        now,
      }),
    ).toBe('stable');
  });
});

describe('getSystemDisplayLabel', () => {
  it('does not claim all systems operational', () => {
    const label = getSystemDisplayLabel('stable', 'footer');
    expect(label.toLowerCase()).not.toContain('all systems');
    expect(label.toLowerCase()).not.toContain('operational');
  });

  it('uses bounded language for unknown and stale states', () => {
    expect(getSystemDisplayLabel('unknown', 'footer')).toBe('Checking status');
    expect(getSystemDisplayLabel('stale', 'footer')).toBe('Status delayed');
  });
});
