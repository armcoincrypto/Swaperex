/**
 * P9.3 — Protocol credibility cards (static audited facts only).
 */

import {
  HOMEPAGE_FEE_STATS,
  HOMEPAGE_PROTOCOL_STATS,
} from '@/constants/homepageProductCopy';

export function HomepageProtocolStats() {
  return (
    <section
      className="homepage-protocol-stats mt-8 sm:mt-10"
      aria-labelledby="homepage-protocol-stats-heading"
    >
      <h2 id="homepage-protocol-stats-heading" className="sr-only">
        Protocol statistics
      </h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
            <span className="text-dark-400">{network} fee:</span> {fee}
          </span>
        ))}
      </div>
    </section>
  );
}

export default HomepageProtocolStats;
