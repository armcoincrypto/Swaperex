import { describe, expect, it } from 'vitest';
import { scannerLiquiditySignalFromDex } from '@/services/tokenSecurity';

describe('scanner liquidity wording', () => {
  it('treats missing scanner DEX data as unavailable, not zero', () => {
    const signal = scannerLiquiditySignalFromDex(undefined);
    expect(signal.label).toBe('Token scanner liquidity data');
    expect(signal.value).toBe('Unavailable');
    expect(signal.level).toBe('unknown');
    expect(signal.value.toLowerCase()).not.toMatch(/none found/);
  });

  it('still formats explicit liquidity when provided', () => {
    const signal = scannerLiquiditySignalFromDex([{ liquidity: '52600000' }]);
    expect(signal.value).toMatch(/\$52/);
  });
});
