import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  groupSignalEntries,
  getGroupKey,
  getSeverityLabel,
  getChainLabel,
  getTimeRangeMs,
  formatRelativeTime,
  getSeverityColor,
  getSeverityIcon,
  formatRecurrenceText,
  type SignalHistoryEntry,
} from '../signalHistoryStore';

// ── Helper to make test entries ──────────────────

function makeEntry(overrides: Partial<SignalHistoryEntry> = {}): SignalHistoryEntry {
  return {
    id: `sig_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    token: '0xdac17f958d2ee523a2206206994597c13d831ec7',
    tokenSymbol: 'USDT',
    chainId: 1,
    type: 'risk',
    severity: 'warning',
    confidence: 0.7,
    reason: 'test reason',
    timestamp: Date.now(),
    ...overrides,
  };
}

// ── getGroupKey ──────────────────────────────────

describe('getGroupKey', () => {
  it('creates key from chainId, token, type, severity', () => {
    const entry = makeEntry({ chainId: 1, token: '0xABC', type: 'risk', severity: 'warning' });
    expect(getGroupKey(entry)).toBe('1:0xabc:risk:warning');
  });

  it('normalizes token address to lowercase', () => {
    const a = makeEntry({ token: '0xABCDEF1234567890abcdef1234567890ABCDEF12' });
    const b = makeEntry({ token: '0xabcdef1234567890abcdef1234567890abcdef12' });
    expect(getGroupKey(a)).toBe(getGroupKey(b));
  });

  it('different severity = different key', () => {
    const a = makeEntry({ severity: 'warning' });
    const b = makeEntry({ severity: 'critical' });
    expect(getGroupKey(a)).not.toBe(getGroupKey(b));
  });

  it('different chain = different key', () => {
    const a = makeEntry({ chainId: 1 });
    const b = makeEntry({ chainId: 56 });
    expect(getGroupKey(a)).not.toBe(getGroupKey(b));
  });
});

// ── groupSignalEntries ──────────────────────────

describe('groupSignalEntries', () => {
  it('returns empty array for empty input', () => {
    expect(groupSignalEntries([])).toEqual([]);
  });

  it('single entry = single group with count 1', () => {
    const entry = makeEntry();
    const groups = groupSignalEntries([entry]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(1);
    expect(groups[0].latest).toBe(entry);
  });

  it('groups same token+type+severity+chain together', () => {
    const entries = [
      makeEntry({ timestamp: 1000 }),
      makeEntry({ timestamp: 2000 }),
      makeEntry({ timestamp: 3000 }),
    ];
    const groups = groupSignalEntries(entries);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(3);
  });

  it('different tokens = different groups', () => {
    const entries = [
      makeEntry({ token: '0xaaa0000000000000000000000000000000000001' }),
      makeEntry({ token: '0xbbb0000000000000000000000000000000000002' }),
    ];
    const groups = groupSignalEntries(entries);
    expect(groups).toHaveLength(2);
  });

  it('different types = different groups', () => {
    const entries = [
      makeEntry({ type: 'risk' }),
      makeEntry({ type: 'liquidity' }),
    ];
    const groups = groupSignalEntries(entries);
    expect(groups).toHaveLength(2);
  });

  it('tracks firstSeenAt and lastSeenAt correctly', () => {
    const entries = [
      makeEntry({ timestamp: 3000 }),
      makeEntry({ timestamp: 1000 }),
      makeEntry({ timestamp: 2000 }),
    ];
    const groups = groupSignalEntries(entries);
    expect(groups[0].firstSeenAt).toBe(1000);
    expect(groups[0].lastSeenAt).toBe(3000);
  });

  it('latest entry is the one with newest timestamp', () => {
    const old = makeEntry({ timestamp: 1000, reason: 'old' });
    const mid = makeEntry({ timestamp: 2000, reason: 'mid' });
    const newest = makeEntry({ timestamp: 3000, reason: 'newest' });
    const groups = groupSignalEntries([old, mid, newest]);
    expect(groups[0].latest.reason).toBe('newest');
  });

  it('maxConfidence is highest across group', () => {
    const entries = [
      makeEntry({ confidence: 0.5 }),
      makeEntry({ confidence: 0.9 }),
      makeEntry({ confidence: 0.7 }),
    ];
    const groups = groupSignalEntries(entries);
    expect(groups[0].maxConfidence).toBe(0.9);
  });

  it('sorts groups by most recent activity', () => {
    const ethToken = '0xaaa0000000000000000000000000000000000001';
    const bscToken = '0xbbb0000000000000000000000000000000000002';
    const entries = [
      makeEntry({ token: ethToken, timestamp: 1000 }),
      makeEntry({ token: bscToken, timestamp: 5000 }),
      makeEntry({ token: ethToken, timestamp: 2000 }),
    ];
    const groups = groupSignalEntries(entries);
    // BSC token group has latest activity (5000)
    expect(groups[0].token).toBe(bscToken);
    expect(groups[1].token).toBe(ethToken);
  });

  it('preserves tokenSymbol from latest entry', () => {
    const entries = [
      makeEntry({ timestamp: 1000, tokenSymbol: undefined }),
      makeEntry({ timestamp: 2000, tokenSymbol: 'USDT' }),
    ];
    const groups = groupSignalEntries(entries);
    expect(groups[0].tokenSymbol).toBe('USDT');
  });
});

// ── getSeverityLabel ─────────────────────────────

describe('getSeverityLabel', () => {
  it('maps critical to Critical', () => {
    expect(getSeverityLabel('critical')).toBe('Critical');
  });
  it('maps danger to High Risk', () => {
    expect(getSeverityLabel('danger')).toBe('High Risk');
  });
  it('maps warning to Caution', () => {
    expect(getSeverityLabel('warning')).toBe('Caution');
  });
  it('maps unknown to Unknown', () => {
    expect(getSeverityLabel('other')).toBe('Unknown');
  });
});

// ── getChainLabel ────────────────────────────────

describe('getChainLabel', () => {
  it('maps known chains', () => {
    expect(getChainLabel(1)).toBe('ETH');
    expect(getChainLabel(56)).toBe('BSC');
    expect(getChainLabel(8453)).toBe('Base');
    expect(getChainLabel(42161)).toBe('ARB');
  });
  it('returns Chain N for unknown', () => {
    expect(getChainLabel(999)).toBe('Chain 999');
  });
});

// ── getTimeRangeMs ───────────────────────────────

describe('getTimeRangeMs', () => {
  it('1h = 3600000ms', () => {
    expect(getTimeRangeMs('1h')).toBe(3_600_000);
  });
  it('6h = 21600000ms', () => {
    expect(getTimeRangeMs('6h')).toBe(21_600_000);
  });
  it('24h = 86400000ms', () => {
    expect(getTimeRangeMs('24h')).toBe(86_400_000);
  });
});

// ── formatRelativeTime ───────────────────────────

describe('formatRelativeTime', () => {
  it('returns Just now for < 60s', () => {
    expect(formatRelativeTime(Date.now() - 30_000)).toBe('Just now');
  });
  it('returns Xm ago for minutes', () => {
    expect(formatRelativeTime(Date.now() - 5 * 60_000)).toBe('5m ago');
  });
  it('returns Xh ago for hours', () => {
    expect(formatRelativeTime(Date.now() - 3 * 3_600_000)).toBe('3h ago');
  });
  it('returns Xd ago for days', () => {
    expect(formatRelativeTime(Date.now() - 2 * 86_400_000)).toBe('2d ago');
  });
});

// ── getSeverityColor ─────────────────────────────

describe('getSeverityColor', () => {
  it('returns red for critical', () => {
    expect(getSeverityColor('critical')).toContain('red');
  });
  it('returns orange for danger', () => {
    expect(getSeverityColor('danger')).toContain('orange');
  });
  it('returns yellow for warning', () => {
    expect(getSeverityColor('warning')).toContain('yellow');
  });
});

// ── getSeverityIcon ──────────────────────────────

describe('getSeverityIcon', () => {
  it('returns circle icons', () => {
    expect(getSeverityIcon('critical')).toBeTruthy();
    expect(getSeverityIcon('danger')).toBeTruthy();
    expect(getSeverityIcon('warning')).toBeTruthy();
  });
});

// ── formatRecurrenceText ─────────────────────────

describe('formatRecurrenceText', () => {
  it('returns First occurrence for non-repeat', () => {
    expect(formatRecurrenceText({
      occurrences24h: 1,
      lastSeen: null,
      isRepeat: false,
      trend: 'new',
      previousImpact: null,
      timeSinceLastSeconds: null,
    })).toBe('First occurrence');
  });

  it('returns count with trend for repeat', () => {
    const text = formatRecurrenceText({
      occurrences24h: 5,
      lastSeen: Date.now(),
      isRepeat: true,
      trend: 'increasing',
      previousImpact: null,
      timeSinceLastSeconds: null,
    });
    expect(text).toContain('5');
    expect(text).toContain('worsening');
  });

  it('uses improving for decreasing trend', () => {
    const text = formatRecurrenceText({
      occurrences24h: 3,
      lastSeen: Date.now(),
      isRepeat: true,
      trend: 'decreasing',
      previousImpact: null,
      timeSinceLastSeconds: null,
    });
    expect(text).toContain('improving');
  });
});
