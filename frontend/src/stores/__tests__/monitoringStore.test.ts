import { describe, it, expect } from 'vitest';
import { getUniqueChains, getChainLabel, SUPPORTED_CHAINS } from '../monitoringStore';

describe('monitoringStore', () => {
  describe('getUniqueChains', () => {
    it('returns unique sorted chain IDs', () => {
      const tokens = [
        { chainId: 56 },
        { chainId: 1 },
        { chainId: 56 },
        { chainId: 1 },
        { chainId: 8453 },
      ];
      expect(getUniqueChains(tokens)).toEqual([1, 56, 8453]);
    });

    it('returns empty array for empty input', () => {
      expect(getUniqueChains([])).toEqual([]);
    });

    it('handles single chain', () => {
      expect(getUniqueChains([{ chainId: 137 }])).toEqual([137]);
    });
  });

  describe('getChainLabel', () => {
    it('returns ETH for chainId 1', () => {
      expect(getChainLabel(1)).toBe('ETH');
    });

    it('returns BSC for chainId 56', () => {
      expect(getChainLabel(56)).toBe('BSC');
    });

    it('returns Polygon for chainId 137', () => {
      expect(getChainLabel(137)).toBe('Polygon');
    });

    it('returns Base for chainId 8453', () => {
      expect(getChainLabel(8453)).toBe('Base');
    });

    it('returns Arbitrum for chainId 42161', () => {
      expect(getChainLabel(42161)).toBe('Arbitrum');
    });

    it('returns fallback for unknown chain', () => {
      expect(getChainLabel(999)).toBe('Chain 999');
    });
  });

  describe('SUPPORTED_CHAINS', () => {
    it('contains ETH, BSC, Polygon, Base, Arbitrum', () => {
      expect(SUPPORTED_CHAINS).toHaveLength(5);
      const ids = SUPPORTED_CHAINS.map((c) => c.id);
      expect(ids).toContain(1);
      expect(ids).toContain(56);
      expect(ids).toContain(137);
      expect(ids).toContain(8453);
      expect(ids).toContain(42161);
    });

    it('each chain has id and label', () => {
      SUPPORTED_CHAINS.forEach((chain) => {
        expect(chain.id).toBeGreaterThan(0);
        expect(chain.label.length).toBeGreaterThan(0);
      });
    });
  });
});
