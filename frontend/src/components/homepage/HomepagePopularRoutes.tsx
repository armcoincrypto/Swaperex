/**
 * P9.6 / P20 — Popular production-certified routes (catalog only).
 */

import {
  getVerifiedPopularCommissionRoutes,
  groupPopularCommissionRoutes,
} from '@/constants/popularCommissionRoutes';
import { MobileCollapsibleSection } from '@/components/homepage/MobileCollapsibleSection';

interface HomepagePopularRoutesProps {
  activeChainId?: number;
}

const DISPLAY_LIMIT_PER_CHAIN = 6;

export function HomepagePopularRoutes({ activeChainId = 1 }: HomepagePopularRoutesProps) {
  const routes = getVerifiedPopularCommissionRoutes();
  const groups = groupPopularCommissionRoutes(routes, activeChainId);

  return (
    <MobileCollapsibleSection
      title="Popular Routes"
      summary="Select a production-certified pair to explore — not a live activity feed."
      headingId="homepage-popular-routes-heading"
      className="homepage-popular-routes"
    >
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
    </MobileCollapsibleSection>
  );
}

export default HomepagePopularRoutes;
