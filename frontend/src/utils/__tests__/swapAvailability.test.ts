import { describe, expect, it } from 'vitest';
import {
  buildCertifiedSwapNavigation,
  getCertifiedRoutesForToken,
  getSwapAvailability,
  hasAnyCertifiedSwapRoute,
  isExecutableSwapCta,
  selectPreferredCertifiedCounterpart,
} from '@/utils/swapAvailability';
import { isCommissionRouteCertified } from '@/utils/commissionRoutePolicy';
import { NATIVE_TOKEN_ADDRESS } from '@/tokens';

describe('swapAvailability helpers', () => {
  it('marks Ethereum certified tokens executable with a certified counterpart', () => {
    expect(hasAnyCertifiedSwapRoute({ chainId: 1, token: 'WETH' })).toBe(true);
    expect(isExecutableSwapCta({ chainId: 1, token: 'ETH' })).toBe(true);
    const nav = buildCertifiedSwapNavigation({ chainId: 1, token: 'WETH' });
    expect(nav).not.toBeNull();
    expect(
      isCommissionRouteCertified({
        chainId: nav!.chainId,
        tokenIn: nav!.fromSymbol,
        tokenOut: nav!.toSymbol,
      }),
    ).toBe(true);
  });

  it('marks BNB certified tokens executable and prefers native/hub counterparts', () => {
    expect(hasAnyCertifiedSwapRoute({ chainId: 56, token: 'BNB' })).toBe(true);
    expect(isExecutableSwapCta({ chainId: 56, token: 'CAKE' })).toBe(true);
    const counterpart = selectPreferredCertifiedCounterpart({ chainId: 56, token: 'BNB' });
    expect(counterpart).toBeTruthy();
    expect(
      isCommissionRouteCertified({ chainId: 56, tokenIn: 'BNB', tokenOut: counterpart! }),
    ).toBe(true);
  });

  it('marks Polygon and Arbitrum as view-only', () => {
    expect(getSwapAvailability({ chainId: 137, tokenIn: 'USDC' }).status).toBe('view_only');
    expect(getSwapAvailability({ chainId: 42161, tokenIn: 'ETH' }).status).toBe('view_only');
    expect(isExecutableSwapCta({ chainId: 137, token: 'USDC' })).toBe(false);
  });

  it('keeps native and wrapped identities distinct and non-executable as wrap pairs', () => {
    expect(
      getSwapAvailability({
        chainId: 1,
        tokenIn: { symbol: 'ETH', address: NATIVE_TOKEN_ADDRESS, is_native: true },
        tokenOut: 'WETH',
      }).status,
    ).toBe('unsupported');
    expect(
      getSwapAvailability({
        chainId: 56,
        tokenIn: { symbol: 'BNB', address: NATIVE_TOKEN_ADDRESS, is_native: true },
        tokenOut: 'WBNB',
      }).status,
    ).toBe('unsupported');
    expect(isExecutableSwapCta({ chainId: 56, token: 'WBNB' })).toBe(false);
  });

  it('blocks PEPE, FDUSD, SNX, and unknown tokens', () => {
    expect(getSwapAvailability({ chainId: 1, tokenIn: 'PEPE' }).status).toBe('policy_blocked');
    expect(getSwapAvailability({ chainId: 56, tokenIn: 'FDUSD' }).status).toBe('policy_blocked');
    expect(getSwapAvailability({ chainId: 1, tokenIn: 'SNX' }).status).toBe('unsupported');
    expect(getSwapAvailability({ chainId: 1, tokenIn: 'NOTAREALTOKEN' }).status).toBe('unsupported');
    expect(getCertifiedRoutesForToken({ chainId: 1, token: 'PENDLE' })).toHaveLength(0);
  });

  it('never builds a WBNB endpoint navigation target', () => {
    const nav = buildCertifiedSwapNavigation({ chainId: 56, token: 'WBNB' });
    expect(nav).toBeNull();
    const usdtNav = buildCertifiedSwapNavigation({ chainId: 56, token: 'USDT' });
    expect(usdtNav?.fromSymbol === 'WBNB' || usdtNav?.toSymbol === 'WBNB').toBe(false);
  });
});
