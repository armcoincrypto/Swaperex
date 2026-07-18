import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assertCommissionRouteCertified,
  explainCommissionRouteDenial,
  getCertifiedCommissionRoute,
  isCommissionRouteCertified,
  resolveCommissionTokenIdentity,
} from '@/utils/commissionRoutePolicy';
import { NATIVE_TOKEN_ADDRESS } from '@/tokens';
import { getFeaturedCommissionRoutes } from '@/constants/featuredCommissionRoutes';
import { getVerifiedPopularCommissionRoutes } from '@/constants/popularCommissionRoutes';
import { isUniswapWrapperV3AllowlistedPair } from '@/config/uniswapWrapperV3';
import { getTokenRouteSupport } from '@/utils/routeSupport';

const USDC_ETH = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const USDT_ETH = '0xdAC17F958D2ee523a2206206994597C13D831ec7';
const WETH = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2';
const USDT_BSC = '0x55d398326f99059fF775485246999027B3197955';
const WBNB = '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c';
const FAKE = '0x00000000000000000000000000000000000000Aa';

describe('commissionRoutePolicy registry', () => {
  it('certifies Ethereum native and WETH directions independently', () => {
    expect(
      isCommissionRouteCertified({
        chainId: 1,
        tokenIn: { symbol: 'ETH', address: NATIVE_TOKEN_ADDRESS, is_native: true },
        tokenOut: { symbol: 'USDC', address: USDC_ETH },
      }),
    ).toBe(true);
    expect(
      isCommissionRouteCertified({
        chainId: 1,
        tokenIn: { symbol: 'USDC', address: USDC_ETH },
        tokenOut: { symbol: 'ETH', address: NATIVE_TOKEN_ADDRESS, is_native: true },
      }),
    ).toBe(true);
    expect(
      isCommissionRouteCertified({
        chainId: 1,
        tokenIn: { symbol: 'WETH', address: WETH },
        tokenOut: { symbol: 'USDC', address: USDC_ETH },
      }),
    ).toBe(true);
  });

  it('keeps native ETH distinct from WETH', () => {
    const eth = resolveCommissionTokenIdentity(1, {
      symbol: 'ETH',
      address: NATIVE_TOKEN_ADDRESS,
      is_native: true,
    });
    const weth = resolveCommissionTokenIdentity(1, { symbol: 'WETH', address: WETH });
    expect(eth?.isNative).toBe(true);
    expect(weth?.isNative).toBe(false);
    expect(eth?.symbol).toBe('ETH');
    expect(weth?.symbol).toBe('WETH');
    expect(
      isCommissionRouteCertified({
        chainId: 1,
        tokenIn: { symbol: 'ETH', address: NATIVE_TOKEN_ADDRESS, is_native: true },
        tokenOut: { symbol: 'WETH', address: WETH },
      }),
    ).toBe(false);
    expect(explainCommissionRouteDenial({
      chainId: 1,
      tokenIn: { symbol: 'ETH', address: NATIVE_TOKEN_ADDRESS, is_native: true },
      tokenOut: { symbol: 'WETH', address: WETH },
    })).toBe('wrap_unwrap_not_supported');
  });

  it('certifies BNB native routes and rejects WBNB endpoint equivalents', () => {
    expect(
      isCommissionRouteCertified({
        chainId: 56,
        tokenIn: { symbol: 'BNB', address: NATIVE_TOKEN_ADDRESS, is_native: true },
        tokenOut: { symbol: 'USDT', address: USDT_BSC },
      }),
    ).toBe(true);
    expect(
      isCommissionRouteCertified({
        chainId: 56,
        tokenIn: { symbol: 'WBNB', address: WBNB },
        tokenOut: { symbol: 'USDT', address: USDT_BSC },
      }),
    ).toBe(false);
    expect(
      explainCommissionRouteDenial({
        chainId: 56,
        tokenIn: { symbol: 'WBNB', address: WBNB },
        tokenOut: { symbol: 'USDT', address: USDT_BSC },
      }),
    ).toBe('wrapped_native_endpoint_blocked');
  });

  it('rejects unsupported pairs, unknown chains, and symbol/address collisions', () => {
    expect(
      isCommissionRouteCertified({
        chainId: 1,
        tokenIn: 'WETH',
        tokenOut: 'SNX',
      }),
    ).toBe(false);
    expect(
      isCommissionRouteCertified({
        chainId: 137,
        tokenIn: 'WETH',
        tokenOut: 'USDC',
      }),
    ).toBe(false);
    expect(
      resolveCommissionTokenIdentity(1, { symbol: 'USDC', address: FAKE }),
    ).toBeNull();
    expect(
      isCommissionRouteCertified({
        chainId: 1,
        tokenIn: { symbol: 'WETH', address: WETH },
        tokenOut: { symbol: 'USDC', address: FAKE },
      }),
    ).toBe(false);
  });

  it('blocks PEPE and FDUSD policy denials', () => {
    expect(
      explainCommissionRouteDenial({ chainId: 1, tokenIn: 'WETH', tokenOut: 'PEPE' }),
    ).toBe('policy_blocked');
    expect(
      explainCommissionRouteDenial({ chainId: 56, tokenIn: 'BNB', tokenOut: 'FDUSD' }),
    ).toBe('policy_blocked');
  });

  it('assert throws unsupported_commission_route for uncertified pairs', () => {
    expect(() =>
      assertCommissionRouteCertified({ chainId: 1, tokenIn: 'WETH', tokenOut: 'PENDLE' }),
    ).toThrow(/not certified/i);
    try {
      assertCommissionRouteCertified({ chainId: 1, tokenIn: 'WETH', tokenOut: 'PENDLE' });
    } catch (err) {
      expect((err as Error & { swapErrorReasonCode?: string }).swapErrorReasonCode).toBe(
        'unsupported_commission_route',
      );
    }
  });

  it('returns a certified route object with fingerprint', () => {
    const route = getCertifiedCommissionRoute({
      chainId: 1,
      tokenIn: { symbol: 'WETH', address: WETH },
      tokenOut: { symbol: 'USDT', address: USDT_ETH },
    });
    expect(route?.pairKey).toBe('1|WETH|USDT');
    expect(route?.fingerprint).toContain(WETH.toLowerCase());
    expect(route?.direction).toBe('token-to-token');
  });
});

describe('catalog alignment with execution policy', () => {
  it('keeps featured and popular routes inside the certified set', () => {
    for (const route of [...getFeaturedCommissionRoutes(), ...getVerifiedPopularCommissionRoutes()]) {
      expect(
        isCommissionRouteCertified({
          chainId: route.chainId,
          tokenIn: route.fromSymbol,
          tokenOut: route.toSymbol,
        }),
      ).toBe(true);
      expect(route.fromSymbol.toUpperCase()).not.toBe('WBNB');
      expect(route.toSymbol.toUpperCase()).not.toBe('WBNB');
    }
  });

  it('does not treat soft picker tiers as executable certification', () => {
    expect(getTokenRouteSupport(1, 'SNX')).toBe('limited');
    expect(isCommissionRouteCertified({ chainId: 1, tokenIn: 'WETH', tokenOut: 'SNX' })).toBe(false);
    expect(getTokenRouteSupport(56, 'WBNB')).toBe('limited');
    expect(isCommissionRouteCertified({ chainId: 56, tokenIn: 'WBNB', tokenOut: 'USDT' })).toBe(false);
  });

  it('keeps V3 canary pairs inside certified WETH majors', () => {
    expect(isUniswapWrapperV3AllowlistedPair('WETH', 'USDC')).toBe(true);
    expect(isUniswapWrapperV3AllowlistedPair('WETH', 'SNX')).toBe(false);
    expect(isUniswapWrapperV3AllowlistedPair('WETH', 'PENDLE')).toBe(false);
    expect(isCommissionRouteCertified({ chainId: 1, tokenIn: 'WETH', tokenOut: 'CRV' })).toBe(true);
  });
});

describe('quoteAggregator commission gate', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  it('does not call wrapper quote paths for uncertified pairs when commission-required', async () => {
    vi.stubEnv('VITE_COMMISSION_REQUIRED', 'true');
    const { getAggregatedQuote } = await import('@/services/quoteAggregator');
    await expect(getAggregatedQuote('WETH', 'SNX', '0.01', 1, 0.5, 'best')).rejects.toThrow(
      /not certified|Commission route/i,
    );
    await expect(getAggregatedQuote('WBNB', 'USDT', '0.1', 56, 0.5, 'best')).rejects.toThrow(
      /not certified|Commission route/i,
    );
    await expect(getAggregatedQuote('ETH', 'WETH', '0.01', 1, 0.5, 'best')).rejects.toThrow(
      /not certified|Commission route/i,
    );
    await expect(getAggregatedQuote('BNB', 'WBNB', '0.1', 56, 0.5, 'best')).rejects.toThrow(
      /not certified|Commission route/i,
    );
  });
});
