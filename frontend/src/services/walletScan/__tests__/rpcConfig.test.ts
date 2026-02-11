import { describe, it, expect } from 'vitest';
import {
  getRpcEndpoints, getChainDisplayName, getChainNativeSymbol, ALL_SCAN_CHAINS,
  DEGRADED_AFTER_SEC, getExplorerTokenUrl, getExplorerAddressUrl, getDexScreenerUrl,
} from '../rpcConfig';

describe('walletScan/rpcConfig', () => {
  describe('ALL_SCAN_CHAINS', () => {
    it('contains exactly 3 chains', () => {
      expect(ALL_SCAN_CHAINS).toHaveLength(3);
      expect(ALL_SCAN_CHAINS).toContain('ethereum');
      expect(ALL_SCAN_CHAINS).toContain('bsc');
      expect(ALL_SCAN_CHAINS).toContain('polygon');
    });
  });

  describe('DEGRADED_AFTER_SEC', () => {
    it('is a reasonable timeout', () => {
      expect(DEGRADED_AFTER_SEC).toBeGreaterThanOrEqual(10);
      expect(DEGRADED_AFTER_SEC).toBeLessThanOrEqual(30);
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
      expect(ethRpcs[0].name).toBe('Cloudflare');
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

  describe('explorer URLs', () => {
    it('generates correct Etherscan token URL', () => {
      const url = getExplorerTokenUrl('ethereum', '0xdAC17F958D2ee523a2206206994597C13D831ec7');
      expect(url).toBe('https://etherscan.io/token/0xdAC17F958D2ee523a2206206994597C13D831ec7');
    });

    it('generates correct BscScan address URL', () => {
      const url = getExplorerAddressUrl('bsc', '0x1234');
      expect(url).toBe('https://bscscan.com/address/0x1234');
    });

    it('generates correct PolygonScan URL', () => {
      const url = getExplorerTokenUrl('polygon', '0xabcd');
      expect(url).toBe('https://polygonscan.com/token/0xabcd');
    });

    it('generates correct DexScreener URL', () => {
      const url = getDexScreenerUrl('ethereum', '0xtest');
      expect(url).toBe('https://dexscreener.com/ethereum/0xtest');
    });

    it('generates correct DexScreener URL for BSC', () => {
      const url = getDexScreenerUrl('bsc', '0xtest');
      expect(url).toBe('https://dexscreener.com/bsc/0xtest');
    });
  });
});
