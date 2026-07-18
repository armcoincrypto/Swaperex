import { describe, expect, it } from 'vitest';
import {
  COMMISSION_AUDIT_BLOCKED_PAIR_KEYS,
  COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS,
  COMMISSION_COVERAGE_AUDIT_AT,
  isCommissionPairAuditBlocked,
  isCommissionPairAuditSupported,
} from '@/constants/commissionCoverage';
import { getFeaturedCommissionRoutes } from '@/constants/featuredCommissionRoutes';
import { getVerifiedPopularCommissionRoutes } from '@/constants/popularCommissionRoutes';
import { getTokenRouteSupport } from '@/utils/routeSupport';

describe('commissionCoverage consistency', () => {
  it('stamps the 2026-07-18 route-truth audit', () => {
    expect(COMMISSION_COVERAGE_AUDIT_AT.startsWith('2026-07-18')).toBe(true);
    expect(COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS.size).toBeGreaterThanOrEqual(40);
  });

  it('never marks a blocked pair as supported', () => {
    for (const key of COMMISSION_AUDIT_BLOCKED_PAIR_KEYS) {
      expect(COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS.has(key)).toBe(false);
    }
  });

  it('blocks non-executable WBNB ERC-20 commission legs', () => {
    expect(isCommissionPairAuditBlocked(56, 'WBNB', 'USDT')).toBe(true);
    expect(isCommissionPairAuditSupported(56, 'WBNB', 'USDT')).toBe(false);
    expect(isCommissionPairAuditSupported(56, 'BNB', 'USDT')).toBe(true);
  });

  it('keeps popular and featured catalogs inside the certified allowlist', () => {
    const popular = getVerifiedPopularCommissionRoutes();
    const featured = getFeaturedCommissionRoutes();
    expect(popular.length).toBeGreaterThan(0);
    expect(featured.length).toBeGreaterThan(0);
    for (const route of [...popular, ...featured]) {
      expect(isCommissionPairAuditSupported(route.chainId, route.fromSymbol, route.toSymbol)).toBe(
        true,
      );
      if (route.bidirectional) {
        expect(
          isCommissionPairAuditSupported(route.chainId, route.toSymbol, route.fromSymbol),
        ).toBe(true);
      }
      expect(route.fromSymbol.toUpperCase()).not.toBe('WBNB');
      expect(route.toSymbol.toUpperCase()).not.toBe('WBNB');
    }
  });

  it('marks certified symbols as supported in picker soft tiers', () => {
    expect(getTokenRouteSupport(1, 'CRV')).toBe('supported');
    expect(getTokenRouteSupport(1, 'ONDO')).toBe('supported');
    expect(getTokenRouteSupport(56, 'BTCB')).toBe('supported');
    expect(getTokenRouteSupport(1, 'SNX')).toBe('limited');
    expect(getTokenRouteSupport(56, 'FDUSD')).toBe('limited');
    // WBNB remains listed for balances, but ERC-20 commission legs are blocked.
    expect(getTokenRouteSupport(56, 'WBNB')).toBe('limited');
  });
});
