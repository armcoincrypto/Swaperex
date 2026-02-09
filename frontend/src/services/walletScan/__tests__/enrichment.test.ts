import { describe, it, expect } from 'vitest';
import { parseRiskFactors, computeRiskLevel, applyEnrichment } from '../enrichment';
import type { ScannedToken } from '../types';

describe('walletScan/enrichment', () => {
  describe('parseRiskFactors', () => {
    it('detects honeypot as danger', () => {
      const factors = parseRiskFactors({ is_honeypot: '1' });
      expect(factors).toContainEqual(expect.objectContaining({ key: 'honeypot', severity: 'danger' }));
    });

    it('detects high sell tax as danger', () => {
      const factors = parseRiskFactors({ sell_tax: '0.15' });
      expect(factors).toContainEqual(expect.objectContaining({ key: 'sell_tax', severity: 'danger' }));
    });

    it('detects moderate sell tax as warn', () => {
      const factors = parseRiskFactors({ sell_tax: '0.08' });
      expect(factors).toContainEqual(expect.objectContaining({ key: 'sell_tax', severity: 'warn' }));
    });

    it('detects proxy contract as warn', () => {
      const factors = parseRiskFactors({ is_proxy: '1' });
      expect(factors).toContainEqual(expect.objectContaining({ key: 'proxy', severity: 'warn' }));
    });

    it('detects open source as info', () => {
      const factors = parseRiskFactors({ is_open_source: '1' });
      expect(factors).toContainEqual(expect.objectContaining({ key: 'open_source', severity: 'info' }));
    });

    it('returns empty array for clean token', () => {
      const factors = parseRiskFactors({ is_open_source: '0', sell_tax: '0' });
      expect(factors).toEqual([]);
    });

    it('handles multiple risk factors', () => {
      const factors = parseRiskFactors({
        is_honeypot: '1',
        is_blacklisted: '1',
        sell_tax: '0.20',
      });
      expect(factors.length).toBe(3);
      expect(factors.filter(f => f.severity === 'danger').length).toBe(2);
    });
  });

  describe('computeRiskLevel', () => {
    it('returns high when danger factors exist', () => {
      expect(computeRiskLevel([
        { key: 'honeypot', label: 'Honeypot', severity: 'danger', value: 'yes' },
      ])).toBe('high');
    });

    it('returns medium when only warn factors exist', () => {
      expect(computeRiskLevel([
        { key: 'proxy', label: 'Proxy', severity: 'warn', value: 'yes' },
      ])).toBe('medium');
    });

    it('returns low when only info factors exist', () => {
      expect(computeRiskLevel([
        { key: 'open_source', label: 'Open source', severity: 'info', value: 'yes' },
      ])).toBe('low');
    });

    it('returns unknown when no factors', () => {
      expect(computeRiskLevel([])).toBe('unknown');
    });

    it('returns high when mixed danger and warn', () => {
      expect(computeRiskLevel([
        { key: 'proxy', label: 'Proxy', severity: 'warn', value: 'yes' },
        { key: 'honeypot', label: 'Honeypot', severity: 'danger', value: 'yes' },
      ])).toBe('high');
    });
  });

  describe('applyEnrichment', () => {
    it('merges risk levels into tokens', () => {
      const tokens: ScannedToken[] = [{
        chainId: 1, chainName: 'ethereum',
        address: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
        symbol: 'USDT', name: 'Tether', decimals: 6,
        balance: '100', source: 'known', isWatched: false, isNative: false,
      }];

      const enrichment = {
        tokens: [{
          address: '0xdac17f958d2ee523a2206206994597c13d831ec7',
          chainId: 1, symbol: 'USDT', riskLevel: 'low' as const,
          riskFactors: [{ key: 'open_source', label: 'Open source', severity: 'info' as const, value: 'Verified' }],
        }],
        timestamp: Date.now(),
        cached: false,
      };

      const result = applyEnrichment(tokens, enrichment);
      expect(result[0].riskLevel).toBe('low');
      expect(result[0].riskFactors).toHaveLength(1);
    });

    it('leaves tokens unchanged when no matching enrichment', () => {
      const tokens: ScannedToken[] = [{
        chainId: 1, chainName: 'ethereum',
        address: '0x0000000000000000000000000000000000000001',
        symbol: 'TEST', name: 'Test', decimals: 18,
        balance: '1', source: 'known', isWatched: false, isNative: false,
      }];

      const enrichment = { tokens: [], timestamp: Date.now(), cached: false };
      const result = applyEnrichment(tokens, enrichment);
      expect(result[0].riskLevel).toBeUndefined();
    });
  });
});
