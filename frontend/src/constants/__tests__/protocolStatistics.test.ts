import { describe, expect, it } from 'vitest';
import { getProtocolStatistics } from '@/constants/protocolStatistics';
import { COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS } from '@/constants/commissionCoverage';
import {
  HOMEPAGE_PROTOCOL_STATS,
  HOMEPAGE_TRUST_PILLS,
  HOMEPAGE_TRUST_PRINCIPLES,
} from '@/constants/homepageProductCopy';
import { SWAP_SURFACE_COPY } from '@/constants/swapSurfaceCopy';

describe('protocolStatistics', () => {
  it('derives directional routes from commission registry', () => {
    const stats = getProtocolStatistics();
    expect(stats.certifiedDirectionalRoutes).toBe(COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS.size);
    expect(stats.swapEnabledNetworks).toBe(2);
    expect(stats.routesOnNetwork(1) + stats.routesOnNetwork(56)).toBe(
      stats.certifiedDirectionalRoutes,
    );
  });

  it('keeps homepage stats aligned with registry', () => {
    const routesStat = HOMEPAGE_PROTOCOL_STATS.find((s) => s.id === 'routes');
    expect(routesStat?.value).toBe(String(COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS.size));
    expect(routesStat?.label).toMatch(/Production-certified routes/i);
  });

  it('fails if homepage / intel labels drift from single registry total (P18.2 invariant)', () => {
    const stats = getProtocolStatistics();
    const networksStat = HOMEPAGE_PROTOCOL_STATS.find((s) => s.id === 'networks');
    expect(networksStat?.value).toBe(String(stats.swapEnabledNetworks));
    for (const row of HOMEPAGE_PROTOCOL_STATS) {
      if (row.id === 'routes') {
        expect(Number(row.value)).toBe(COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS.size);
      }
      if (row.id === 'pairs') {
        expect(Number(row.value)).toBe(stats.supportedPairEntries);
      }
    }
  });

  it('keeps custody principles out of protocol statistics (P20)', () => {
    expect(HOMEPAGE_PROTOCOL_STATS.some((s) => s.id === 'custody')).toBe(false);
    expect(HOMEPAGE_TRUST_PRINCIPLES.some((s) => s.id === 'custody')).toBe(true);
    expect(HOMEPAGE_TRUST_PILLS).toHaveLength(3);
  });
});

describe('P20 public terminology', () => {
  it('does not expose commission-route wording in public route titles', () => {
    expect(SWAP_SURFACE_COPY.popularCommissionRoutesTitle).toBe('Popular routes');
    expect(SWAP_SURFACE_COPY.auditedCommissionRouteBadge).toBe('Production-certified route');
    expect(SWAP_SURFACE_COPY.popularCommissionRoutesTitle.toLowerCase()).not.toMatch(/commission/);
    expect(SWAP_SURFACE_COPY.featuredCommissionRoutesHint.toLowerCase()).not.toMatch(/commission/);
  });
});
