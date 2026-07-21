import { describe, expect, it } from 'vitest';
import {
  getRouteDisplayName,
  getRouteShortName,
  getRouteSupportIdentifier,
  getRouteExplanation,
} from '@/utils/routePresentation';
import { swapAggregatorProviderLabel } from '@/utils/format';

describe('routePresentation', () => {
  it('uses canonical Wrapper V2 naming without canary', () => {
    expect(getRouteDisplayName('pancakeswap-v3-wrapper-v2')).toBe(
      'PancakeSwap V3 via Kobbex Wrapper V2',
    );
    expect(getRouteShortName('pancakeswap-v3-wrapper-v2')).toBe('PancakeSwap V3');
    expect(getRouteSupportIdentifier('pancakeswap-v3-wrapper-v2')).toBe(
      'pancakeswap-v3-wrapper-v2',
    );
    expect(getRouteExplanation('pancakeswap-v3-wrapper-v2').toLowerCase()).not.toMatch(
      /canary|pilot|experimental/,
    );
  });

  it('keeps aggregator label aligned with presentation', () => {
    expect(swapAggregatorProviderLabel('uniswap-v3-wrapper-v2')).toBe(
      'Uniswap V3 via Kobbex Wrapper V2',
    );
    expect(swapAggregatorProviderLabel('pancakeswap-v3-wrapper-v2')).not.toMatch(/canary/i);
  });

  it('aligns quoteAggregator preference labels with canonical presentation (P18.2)', async () => {
    const { formatQuoteRoutePreferenceLabel } = await import('@/services/quoteAggregator');
    expect(formatQuoteRoutePreferenceLabel('pancakeswap-v3-wrapper-v2')).toBe(
      getRouteDisplayName('pancakeswap-v3-wrapper-v2'),
    );
    expect(formatQuoteRoutePreferenceLabel('uniswap-v3-wrapper-v2')).toBe(
      getRouteDisplayName('uniswap-v3-wrapper-v2'),
    );
    expect(formatQuoteRoutePreferenceLabel('best')).toBe('Certified route');
  });
});
