import { describe, it, expect } from 'vitest';
import {
  getExplorerUrl,
  getChainName,
  getChainIcon,
  formatBalance,
  shortenAddress,
} from '../format';

describe('format utilities', () => {
  // ─── Explorer URLs (delegates to chains.ts) ───────────────
  describe('getExplorerUrl', () => {
    const txHash = '0xdeadbeef';

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
      const url = getExplorerUrl(chainId, txHash);
      expect(url).toContain(domain);
      expect(url).toContain(txHash);
      expect(url).toContain('/tx/');
    });

    it('falls back to etherscan.io for unknown chain', () => {
      const url = getExplorerUrl(999, txHash);
      expect(url).toContain('etherscan.io');
      expect(url).toContain(txHash);
    });
  });

  // ─── Chain Names (delegates to chains.ts) ─────────────────
  describe('getChainName', () => {
    it.each([
      [1, 'Ethereum'],
      [56, 'BNB Chain'],
      [137, 'Polygon'],
      [42161, 'Arbitrum One'],
      [10, 'Optimism'],
      [43114, 'Avalanche C-Chain'],
      [100, 'Gnosis Chain'],
      [250, 'Fantom'],
      [8453, 'Base'],
    ] as const)('chain %d returns %s', (chainId, expectedName) => {
      expect(getChainName(chainId)).toBe(expectedName);
    });

    it('returns fallback for unknown chain', () => {
      expect(getChainName(999)).toBe('Chain 999');
    });
  });

  // ─── Chain Icons ──────────────────────────────────────────
  describe('getChainIcon', () => {
    it.each([
      [1, 'ethereum'],
      [56, 'bnb'],
      [137, 'polygon'],
      [42161, 'arbitrum'],
      [10, 'optimism'],
      [43114, 'avalanche'],
      [100, 'gnosis'],
      [250, 'fantom'],
      [8453, 'base'],
    ] as const)('chain %d has an icon path', (chainId, expected) => {
      const icon = getChainIcon(chainId);
      expect(icon).toContain(expected);
      expect(icon).toMatch(/\.svg$/);
    });

    it('returns default for unknown chain', () => {
      expect(getChainIcon(999)).toContain('default.svg');
    });
  });

  // ─── formatBalance ────────────────────────────────────────
  describe('formatBalance', () => {
    it('formats zero', () => {
      expect(formatBalance('0')).toBe('0');
    });

    it('formats tiny amount', () => {
      expect(formatBalance('0.00001')).toBe('<0.0001');
    });

    it('formats normal amount', () => {
      const result = formatBalance('1.2345');
      expect(result).toContain('1.234');
    });
  });

  // ─── shortenAddress ───────────────────────────────────────
  describe('shortenAddress', () => {
    it('shortens a standard address', () => {
      const result = shortenAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f2bD18');
      expect(result).toBe('0x742d...bD18');
    });

    it('returns empty for empty input', () => {
      expect(shortenAddress('')).toBe('');
    });
  });
});
