import { describe, it, expect } from 'vitest';
import { DEFAULT_DUST_SETTINGS, type ScannedToken, type DustFilterSettings } from '../types';

// Replicate the dust classification logic from WalletScan.tsx for testing
function classifyDust(token: ScannedToken, settings: DustFilterSettings) {
  const bal = parseFloat(token.balance);
  const isDust = token.usdValue !== undefined
    ? token.usdValue < settings.dustUsdThreshold
    : bal < settings.dustBalanceThreshold;
  const isSpam = token.riskLevel === 'high' && !token.isNative;
  return { isDust: isDust && !token.isNative, isSpam };
}

function makeToken(overrides: Partial<ScannedToken> = {}): ScannedToken {
  return {
    chainId: 1,
    chainName: 'ethereum',
    address: '0xtest',
    symbol: 'TEST',
    name: 'Test Token',
    decimals: 18,
    balance: '1.0',
    source: 'known',
    isWatched: false,
    isNative: false,
    ...overrides,
  };
}

describe('dustFilter', () => {
  describe('DEFAULT_DUST_SETTINGS', () => {
    it('has sensible defaults', () => {
      expect(DEFAULT_DUST_SETTINGS.hideDust).toBe(true);
      expect(DEFAULT_DUST_SETTINGS.hideSpam).toBe(true);
      expect(DEFAULT_DUST_SETTINGS.dustUsdThreshold).toBe(0.01);
      expect(DEFAULT_DUST_SETTINGS.dustBalanceThreshold).toBe(0.0001);
    });
  });

  describe('classifyDust', () => {
    it('marks low USD value tokens as dust', () => {
      const token = makeToken({ balance: '0.001', usdValue: 0.001 });
      const result = classifyDust(token, DEFAULT_DUST_SETTINGS);
      expect(result.isDust).toBe(true);
    });

    it('does not mark tokens with sufficient USD value as dust', () => {
      const token = makeToken({ balance: '0.001', usdValue: 1.5 });
      const result = classifyDust(token, DEFAULT_DUST_SETTINGS);
      expect(result.isDust).toBe(false);
    });

    it('uses balance threshold when no USD value', () => {
      const token = makeToken({ balance: '0.00001' });
      const result = classifyDust(token, DEFAULT_DUST_SETTINGS);
      expect(result.isDust).toBe(true);
    });

    it('does not mark tokens with sufficient balance as dust', () => {
      const token = makeToken({ balance: '1.0' });
      const result = classifyDust(token, DEFAULT_DUST_SETTINGS);
      expect(result.isDust).toBe(false);
    });

    it('never marks native tokens as dust', () => {
      const token = makeToken({ balance: '0.0000001', isNative: true });
      const result = classifyDust(token, DEFAULT_DUST_SETTINGS);
      expect(result.isDust).toBe(false);
    });

    it('marks high-risk non-native tokens as spam', () => {
      const token = makeToken({ riskLevel: 'high' });
      const result = classifyDust(token, DEFAULT_DUST_SETTINGS);
      expect(result.isSpam).toBe(true);
    });

    it('does not mark high-risk native tokens as spam', () => {
      const token = makeToken({ riskLevel: 'high', isNative: true });
      const result = classifyDust(token, DEFAULT_DUST_SETTINGS);
      expect(result.isSpam).toBe(false);
    });

    it('does not mark low-risk tokens as spam', () => {
      const token = makeToken({ riskLevel: 'low' });
      const result = classifyDust(token, DEFAULT_DUST_SETTINGS);
      expect(result.isSpam).toBe(false);
    });

    it('respects custom thresholds', () => {
      const settings: DustFilterSettings = {
        ...DEFAULT_DUST_SETTINGS,
        dustUsdThreshold: 10,
      };
      const token = makeToken({ usdValue: 5 });
      const result = classifyDust(token, settings);
      expect(result.isDust).toBe(true);
    });
  });
});
