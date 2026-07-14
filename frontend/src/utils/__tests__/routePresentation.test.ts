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
      'PancakeSwap V3 via Swaperex Wrapper V2',
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
      'Uniswap V3 via Swaperex Wrapper V2',
    );
    expect(swapAggregatorProviderLabel('pancakeswap-v3-wrapper-v2')).not.toMatch(/canary/i);
  });
});
