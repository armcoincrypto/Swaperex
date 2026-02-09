/**
 * Token Intelligence - Unit Tests
 *
 * Tests for the helper functions used by the Token Intelligence panel.
 * Uses the same vitest setup as other frontend tests.
 */

import { describe, it, expect } from 'vitest';

// ── Address Validation ────────────────────────────────────────────

function isValidEthAddress(addr: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(addr);
}

function detectInputType(input: string): 'address' | 'ens' | 'native' | 'invalid' {
  if (!input.trim()) return 'invalid';
  if (isValidEthAddress(input)) return 'address';
  if (input.endsWith('.eth') || input.endsWith('.bnb')) return 'ens';
  if (['ETH', 'BNB', 'MATIC', 'AVAX'].includes(input.toUpperCase())) return 'native';
  return 'invalid';
}

function getInputHelp(input: string): string | null {
  const type = detectInputType(input);
  if (type === 'ens') return 'ENS names are not supported yet. Please paste the token contract address.';
  if (type === 'native') return 'Native tokens (ETH, BNB) are not ERC-20 contracts. Enter a token contract address instead.';
  if (input.length > 0 && input.length < 42 && input.startsWith('0x')) return 'Address looks incomplete. Should be 42 characters (0x + 40 hex).';
  return null;
}

describe('Token Intelligence helpers', () => {
  describe('isValidEthAddress', () => {
    it('accepts valid checksummed address', () => {
      expect(isValidEthAddress('0xdAC17F958D2ee523a2206206994597C13D831ec7')).toBe(true);
    });

    it('accepts valid lowercase address', () => {
      expect(isValidEthAddress('0xdac17f958d2ee523a2206206994597c13d831ec7')).toBe(true);
    });

    it('rejects empty string', () => {
      expect(isValidEthAddress('')).toBe(false);
    });

    it('rejects too-short address', () => {
      expect(isValidEthAddress('0x1234')).toBe(false);
    });

    it('rejects address without 0x prefix', () => {
      expect(isValidEthAddress('dac17f958d2ee523a2206206994597c13d831ec7')).toBe(false);
    });

    it('rejects address with invalid hex characters', () => {
      expect(isValidEthAddress('0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ')).toBe(false);
    });

    it('rejects ENS names', () => {
      expect(isValidEthAddress('vitalik.eth')).toBe(false);
    });
  });

  describe('detectInputType', () => {
    it('detects valid addresses', () => {
      expect(detectInputType('0xdAC17F958D2ee523a2206206994597C13D831ec7')).toBe('address');
    });

    it('detects ENS names', () => {
      expect(detectInputType('vitalik.eth')).toBe('ens');
      expect(detectInputType('token.bnb')).toBe('ens');
    });

    it('detects native tokens', () => {
      expect(detectInputType('ETH')).toBe('native');
      expect(detectInputType('BNB')).toBe('native');
      expect(detectInputType('eth')).toBe('native'); // case-insensitive
      expect(detectInputType('MATIC')).toBe('native');
    });

    it('returns invalid for empty input', () => {
      expect(detectInputType('')).toBe('invalid');
      expect(detectInputType('   ')).toBe('invalid');
    });

    it('returns invalid for random text', () => {
      expect(detectInputType('hello')).toBe('invalid');
      expect(detectInputType('123')).toBe('invalid');
    });
  });

  describe('getInputHelp', () => {
    it('returns ENS help for .eth names', () => {
      const help = getInputHelp('vitalik.eth');
      expect(help).toBeTruthy();
      expect(help!.toLowerCase()).toContain('ens');
    });

    it('returns native token help for ETH/BNB', () => {
      const help = getInputHelp('ETH');
      expect(help).toBeTruthy();
      expect(help!.toLowerCase()).toContain('native');
    });

    it('returns incomplete address help', () => {
      const help = getInputHelp('0x1234');
      expect(help).toBeTruthy();
      expect(help!).toContain('42 characters');
    });

    it('returns null for valid address', () => {
      expect(getInputHelp('0xdAC17F958D2ee523a2206206994597C13D831ec7')).toBeNull();
    });

    it('returns null for empty input', () => {
      expect(getInputHelp('')).toBeNull();
    });
  });
});

// ── Severity Badge ────────────────────────────────────────────────

type OverallSeverity = 'critical' | 'danger' | 'warning' | 'safe' | 'unknown';

function getSeverityBadge(severity: OverallSeverity): { bg: string; text: string; label: string } {
  switch (severity) {
    case 'critical': return { bg: 'bg-red-900/40 border-red-700/50', text: 'text-red-400', label: 'CRITICAL' };
    case 'danger': return { bg: 'bg-orange-900/40 border-orange-700/50', text: 'text-orange-400', label: 'DANGER' };
    case 'warning': return { bg: 'bg-yellow-900/40 border-yellow-700/50', text: 'text-yellow-400', label: 'WARNING' };
    case 'safe': return { bg: 'bg-green-900/40 border-green-700/50', text: 'text-green-400', label: 'SAFE' };
    default: return { bg: 'bg-dark-700 border-dark-600', text: 'text-dark-400', label: 'UNKNOWN' };
  }
}

describe('getSeverityBadge', () => {
  it('returns red styling for critical', () => {
    const badge = getSeverityBadge('critical');
    expect(badge.label).toBe('CRITICAL');
    expect(badge.text).toContain('red');
  });

  it('returns orange styling for danger', () => {
    const badge = getSeverityBadge('danger');
    expect(badge.label).toBe('DANGER');
    expect(badge.text).toContain('orange');
  });

  it('returns yellow styling for warning', () => {
    const badge = getSeverityBadge('warning');
    expect(badge.label).toBe('WARNING');
    expect(badge.text).toContain('yellow');
  });

  it('returns green styling for safe', () => {
    const badge = getSeverityBadge('safe');
    expect(badge.label).toBe('SAFE');
    expect(badge.text).toContain('green');
  });

  it('returns neutral styling for unknown', () => {
    const badge = getSeverityBadge('unknown');
    expect(badge.label).toBe('UNKNOWN');
  });
});

// ── Provider Badge ────────────────────────────────────────────────

interface ProviderInfo {
  status: 'ok' | 'unavailable' | 'timeout' | 'error';
  latencyMs: number;
  error?: string;
}

function getProviderBadge(info: ProviderInfo): { color: string; label: string } {
  switch (info.status) {
    case 'ok': return { color: 'text-green-400', label: `OK (${info.latencyMs}ms)` };
    case 'timeout': return { color: 'text-yellow-400', label: 'Timeout' };
    case 'error': return { color: 'text-red-400', label: 'Error' };
    default: return { color: 'text-dark-500', label: 'Unavailable' };
  }
}

describe('getProviderBadge', () => {
  it('shows OK with latency for healthy provider', () => {
    const badge = getProviderBadge({ status: 'ok', latencyMs: 150 });
    expect(badge.label).toBe('OK (150ms)');
    expect(badge.color).toContain('green');
  });

  it('shows Timeout for slow provider', () => {
    const badge = getProviderBadge({ status: 'timeout', latencyMs: 8000 });
    expect(badge.label).toBe('Timeout');
    expect(badge.color).toContain('yellow');
  });

  it('shows Error for failed provider', () => {
    const badge = getProviderBadge({ status: 'error', latencyMs: 50, error: 'API down' });
    expect(badge.label).toBe('Error');
    expect(badge.color).toContain('red');
  });

  it('shows Unavailable for unknown status', () => {
    const badge = getProviderBadge({ status: 'unavailable', latencyMs: 0 });
    expect(badge.label).toBe('Unavailable');
  });
});
