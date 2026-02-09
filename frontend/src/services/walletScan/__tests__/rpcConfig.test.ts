import { describe, it, expect } from 'vitest';
import { getRpcEndpoints, getChainDisplayName, getChainNativeSymbol, ALL_SCAN_CHAINS } from '../rpcConfig';

describe('walletScan/rpcConfig', () => {
  describe('ALL_SCAN_CHAINS', () => {
    it('contains exactly 3 chains', () => {
      expect(ALL_SCAN_CHAINS).toHaveLength(3);
      expect(ALL_SCAN_CHAINS).toContain('ethereum');
      expect(ALL_SCAN_CHAINS).toContain('bsc');
      expect(ALL_SCAN_CHAINS).toContain('polygon');
    });
  });

  describe('getRpcEndpoints', () => {
    it('returns multiple RPCs for each chain', () => {
      for (const chain of ALL_SCAN_CHAINS) {
        const rpcs = getRpcEndpoints(chain);
        expect(rpcs.length).toBeGreaterThanOrEqual(2);
        for (const rpc of rpcs) {
          expect(rpc.url).toMatch(/^https:\/\//);
          expect(rpc.name).toBeTruthy();
          expect(rpc.timeout).toBeGreaterThanOrEqual(5000);
        }
      }
    });

    it('returns primary RPC first', () => {
      const ethRpcs = getRpcEndpoints('ethereum');
      expect(ethRpcs[0].name).toBe('LlamaRPC');
    });
  });

  describe('getChainDisplayName', () => {
    it('returns human-readable names', () => {
      expect(getChainDisplayName('ethereum')).toBe('Ethereum');
      expect(getChainDisplayName('bsc')).toBe('BSC');
      expect(getChainDisplayName('polygon')).toBe('Polygon');
    });
  });

  describe('getChainNativeSymbol', () => {
    it('returns correct native token symbols', () => {
      expect(getChainNativeSymbol('ethereum')).toBe('ETH');
      expect(getChainNativeSymbol('bsc')).toBe('BNB');
      expect(getChainNativeSymbol('polygon')).toBe('MATIC');
    });
  });
});
