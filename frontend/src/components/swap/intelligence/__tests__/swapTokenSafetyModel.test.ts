import { describe, expect, it } from 'vitest';
import { ownershipAndSupplySignalsFromRaw } from '@/components/swap/intelligence/swapTokenSafetyModel';

describe('token safety ownership / supply wording', () => {
  it('avoids claiming ownership is renounced', () => {
    const [ownership] = ownershipAndSupplySignalsFromRaw({
      owner_address: '0x1111111111111111111111111111111111111111',
    });
    expect(ownership.label).toBe('Ownership risk signal');
    expect(ownership.detail).toBe('No high-risk ownership flag detected');
    expect(ownership.detail.toLowerCase()).not.toMatch(/renounced/);
  });

  it('uses supply-control risk language for mintability', () => {
    const [, supply] = ownershipAndSupplySignalsFromRaw({
      is_mintable: '1',
    });
    expect(supply.label).toBe('Supply controls');
    expect(supply.detail).toMatch(/supply-management capabilities/i);
    expect(supply.detail.toLowerCase()).not.toMatch(/additional supply can be minted/);
  });

  it('marks unavailable ownership/supply when data missing', () => {
    const [ownership, supply] = ownershipAndSupplySignalsFromRaw({});
    expect(ownership.detail).toBe('Ownership data unavailable');
    expect(supply.detail).toBe('Supply-control data unavailable');
  });
});
