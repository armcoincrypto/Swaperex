import { describe, it, expect } from 'vitest';
import {
  CHAINS,
  CHAIN_IDS,
  SUPPORTED_CHAIN_IDS,
  getChainById,
  getExplorerTxUrl,
  isSupportedChain,
} from '../chains';

describe('chain configuration', () => {
  // ─── SUPPORTED_CHAIN_IDS is derived from CHAIN_IDS ────────
  describe('SUPPORTED_CHAIN_IDS', () => {
    it('contains all declared CHAIN_IDS', () => {
      const declared = Object.values(CHAIN_IDS);
      expect(SUPPORTED_CHAIN_IDS).toEqual(expect.arrayContaining(declared));
      expect(SUPPORTED_CHAIN_IDS.length).toBe(declared.length);
    });

    it('includes all 9 EVM chains', () => {
      expect(SUPPORTED_CHAIN_IDS).toContain(1);      // Ethereum
      expect(SUPPORTED_CHAIN_IDS).toContain(56);     // BSC
      expect(SUPPORTED_CHAIN_IDS).toContain(137);    // Polygon
      expect(SUPPORTED_CHAIN_IDS).toContain(42161);  // Arbitrum
      expect(SUPPORTED_CHAIN_IDS).toContain(10);     // Optimism
      expect(SUPPORTED_CHAIN_IDS).toContain(43114);  // Avalanche
      expect(SUPPORTED_CHAIN_IDS).toContain(100);    // Gnosis
      expect(SUPPORTED_CHAIN_IDS).toContain(250);    // Fantom
      expect(SUPPORTED_CHAIN_IDS).toContain(8453);   // Base
    });
  });

  // ─── Explorer URLs per chain ──────────────────────────────
  describe('getExplorerTxUrl', () => {
    const txHash = '0xabc123def456';

    it.each([
      [1, 'etherscan.io'],
      [56, 'bscscan.com'],
      [137, 'polygonscan.com'],
      [42161, 'arbiscan.io'],
      [10, 'optimistic.etherscan.io'],
      [43114, 'snowtrace.io'],
      [100, 'gnosisscan.io'],
      [250, 'ftmscan.com'],
      [8453, 'basescan.org'],
    ] as const)('chain %d returns URL containing %s', (chainId, domain) => {
      const url = getExplorerTxUrl(chainId, txHash);
      expect(url).toContain(domain);
      expect(url).toContain(txHash);
      expect(url).toContain('/tx/');
    });

    it('returns empty string for unknown chain', () => {
      expect(getExplorerTxUrl(999, txHash)).toBe('');
    });
  });

  // ─── CHAINS config completeness ───────────────────────────
  describe('CHAINS config', () => {
    it('every chain has required fields', () => {
      for (const [name, config] of Object.entries(CHAINS)) {
        expect(config.id, `${name}.id`).toBeGreaterThan(0);
        expect(config.name, `${name}.name`).toBeTruthy();
        expect(config.symbol, `${name}.symbol`).toBeTruthy();
        expect(config.rpcUrl, `${name}.rpcUrl`).toMatch(/^https?:\/\//);
        expect(config.explorerUrl, `${name}.explorerUrl`).toMatch(/^https:\/\//);
        expect(config.explorerTxPath, `${name}.explorerTxPath`).toBe('/tx/');
        expect(config.nativeDecimals, `${name}.nativeDecimals`).toBe(18);
        expect(config.wrappedNativeAddress, `${name}.wrappedNativeAddress`).toMatch(/^0x/);
      }
    });

    it('CHAIN_IDS match CHAINS config IDs', () => {
      for (const [name, id] of Object.entries(CHAIN_IDS)) {
        const chain = CHAINS[name as keyof typeof CHAINS];
        expect(chain.id).toBe(id);
      }
    });
  });

  // ─── Utility functions ────────────────────────────────────
  describe('getChainById', () => {
    it('finds Ethereum by ID', () => {
      const chain = getChainById(1);
      expect(chain).toBeDefined();
      expect(chain!.name).toBe('Ethereum');
    });

    it('finds Base by ID', () => {
      const chain = getChainById(8453);
      expect(chain).toBeDefined();
      expect(chain!.name).toBe('Base');
    });

    it('returns undefined for unknown ID', () => {
      expect(getChainById(999)).toBeUndefined();
    });
  });

  describe('isSupportedChain', () => {
    it('returns true for all CHAIN_IDS', () => {
      for (const id of Object.values(CHAIN_IDS)) {
        expect(isSupportedChain(id)).toBe(true);
      }
    });

    it('returns false for unsupported chain', () => {
      expect(isSupportedChain(999)).toBe(false);
    });
  });
});
