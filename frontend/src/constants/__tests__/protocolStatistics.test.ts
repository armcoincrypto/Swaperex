import { describe, expect, it } from 'vitest';
import { getProtocolStatistics } from '@/constants/protocolStatistics';
import { COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS } from '@/constants/commissionCoverage';
import { HOMEPAGE_PROTOCOL_STATS } from '@/constants/homepageProductCopy';

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
    expect(routesStat?.label).toMatch(/Certified directional routes/i);
  });

  it('fails if homepage / intel labels drift from single registry total (P18.2 invariant)', () => {
    const stats = getProtocolStatistics();
    const networksStat = HOMEPAGE_PROTOCOL_STATS.find((s) => s.id === 'networks');
    expect(networksStat?.value).toBe(String(stats.swapEnabledNetworks));
    // No hardcoded alternate totals in homepage strip
    for (const row of HOMEPAGE_PROTOCOL_STATS) {
      if (row.id === 'routes') {
        expect(Number(row.value)).toBe(COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS.size);
      }
    }
  });
});
