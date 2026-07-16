import { describe, expect, it } from 'vitest';
import {
  buildTokenSafetySummaryLines,
  getTokenSafetyCriticalAlerts,
  hasTokenSafetyHighRisk,
  ownershipAndSupplySignalsFromRaw,
  type SwapTokenSafetySignal,
} from '@/components/swap/intelligence/swapTokenSafetyModel';

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

describe('token safety compact summary', () => {
  const sampleSignals: SwapTokenSafetySignal[] = [
    {
      id: 'contract',
      label: 'Contract verification',
      status: 'ok',
      detail: 'Contract source code verified',
    },
    {
      id: 'ownership',
      label: 'Ownership risk signal',
      status: 'ok',
      detail: 'No high-risk ownership flag detected',
    },
    {
      id: 'mintability',
      label: 'Supply controls',
      status: 'warn',
      detail: 'Issuer or contract may retain supply-management capabilities',
    },
    {
      id: 'liquidity',
      label: 'Token scanner liquidity data',
      status: 'unknown',
      detail: 'Liquidity data unavailable',
    },
    { id: 'proxy', label: 'Proxy', status: 'unknown', detail: 'Proxy status unavailable' },
  ];

  it('renders exactly four compact summary categories', () => {
    const lines = buildTokenSafetySummaryLines({ signals: sampleSignals, hasToken: true });
    expect(lines).toHaveLength(4);
    expect(lines.map((line) => line.categoryLabel)).toEqual([
      'Contract',
      'Ownership',
      'Supply controls',
      'Liquidity scan',
    ]);
  });

  it('keeps unavailable distinct from safe or zero', () => {
    const lines = buildTokenSafetySummaryLines({ signals: sampleSignals, hasToken: true });
    const liquidity = lines.find((line) => line.id === 'liquidity');
    expect(liquidity?.value).toBe('Liquidity data unavailable');
    expect(liquidity?.value.toLowerCase()).not.toMatch(/passed|safe|0 liquidity|no liquidity risk/);
  });

  it('shows loading without passed values', () => {
    const lines = buildTokenSafetySummaryLines({ signals: null, loading: true, hasToken: true });
    expect(lines.every((line) => line.value === 'Analysis loading')).toBe(true);
    expect(lines.every((line) => line.status === 'loading')).toBe(true);
  });

  it('surfaces critical alerts from canonical signals', () => {
    const riskSignals: SwapTokenSafetySignal[] = [
      ...sampleSignals,
      {
        id: 'holders',
        label: 'Holder concentration',
        status: 'risk',
        detail: 'Top holder ~60% of supply',
      },
    ];
    expect(hasTokenSafetyHighRisk(riskSignals)).toBe(true);
    expect(getTokenSafetyCriticalAlerts(riskSignals).length).toBeGreaterThan(0);
  });
});
