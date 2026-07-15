/**
 * P9.3 / P20 — Network coverage metrics (registry-derived; principles live under Why Swaperex).
 */

import {
  HOMEPAGE_FEE_STATS,
  HOMEPAGE_PROTOCOL_STATS,
} from '@/constants/homepageProductCopy';
import { MobileCollapsibleSection } from '@/components/homepage/MobileCollapsibleSection';

function StatsBody() {
  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {HOMEPAGE_PROTOCOL_STATS.map((stat) => (
          <div key={stat.id} className="homepage-stat-card">
            <p className="homepage-stat-card__value">{stat.value}</p>
            <p className="homepage-stat-card__label">{stat.label}</p>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-[11px] text-dark-500 lg:justify-start">
        {HOMEPAGE_FEE_STATS.map(({ network, fee }) => (
          <span key={network}>
            <span className="text-dark-400">{network} platform fee:</span> {fee}
          </span>
        ))}
      </div>
    </>
  );
}

export function HomepageProtocolStats() {
  return (
    <MobileCollapsibleSection
      title="Network Overview"
      summary="Supported networks, routes, and platform fees"
      headingId="homepage-protocol-stats-heading"
      className="homepage-protocol-stats"
    >
      <StatsBody />
    </MobileCollapsibleSection>
  );
}

export default HomepageProtocolStats;
