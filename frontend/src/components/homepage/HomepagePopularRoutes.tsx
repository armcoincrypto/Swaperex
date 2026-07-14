/**
 * P9.6 — Popular certified routes (catalog only; no fake activity feed).
 */

import {
  getVerifiedPopularCommissionRoutes,
  groupPopularCommissionRoutes,
} from '@/constants/popularCommissionRoutes';

interface HomepagePopularRoutesProps {
  activeChainId?: number;
}

const DISPLAY_LIMIT_PER_CHAIN = 6;

export function HomepagePopularRoutes({ activeChainId = 1 }: HomepagePopularRoutesProps) {
  const routes = getVerifiedPopularCommissionRoutes();
  const groups = groupPopularCommissionRoutes(routes, activeChainId);

  return (
    <section
      className="homepage-popular-routes mt-8 sm:mt-10"
      aria-labelledby="homepage-popular-routes-heading"
    >
      <h2
        id="homepage-popular-routes-heading"
        className="text-sm font-semibold uppercase tracking-wider text-dark-300 mb-1"
      >
        Popular certified routes
      </h2>
      <p className="text-xs text-dark-500 mb-4">
        Production-certified pairs from the internal commission audit — not live swap activity.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {groups.map((group) => (
          <div key={group.chainId} className="homepage-popular-routes__group">
            <p className="text-xs font-medium text-dark-300 mb-2">{group.chainLabel}</p>
            <ul className="flex flex-wrap gap-2" role="list">
              {group.routes.slice(0, DISPLAY_LIMIT_PER_CHAIN).map((route) => (
                <li key={`${route.chainId}-${route.label}`}>
                  <span className="homepage-route-chip" title={route.label}>
                    {route.label}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

export default HomepagePopularRoutes;
