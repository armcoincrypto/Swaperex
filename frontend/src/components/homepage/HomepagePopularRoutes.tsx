/**
 * P9.6 / P20 / P21.3 — Popular production-certified routes.
 * Executable chips deep-link through shared certified navigation helpers.
 */

import { Link } from 'react-router-dom';
import {
  getVerifiedPopularCommissionRoutes,
  groupPopularCommissionRoutes,
} from '@/constants/popularCommissionRoutes';
import { MobileCollapsibleSection } from '@/components/homepage/MobileCollapsibleSection';
import { resolveHomepageRouteChip } from '@/utils/homepageRouteChips';
import { logRevenueTelemetry } from '@/utils/revenueTelemetry';

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
      summary="Open a production-certified pair in Swap — not a live activity feed."
      headingId="homepage-popular-routes-heading"
      className="homepage-popular-routes"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {groups.map((group) => (
          <div key={group.chainId} className="homepage-popular-routes__group">
            <p className="text-xs font-medium text-dark-300 mb-2">{group.chainLabel}</p>
            <ul className="flex flex-wrap gap-2" role="list">
              {group.routes.slice(0, DISPLAY_LIMIT_PER_CHAIN).map((route) => {
                const chip = resolveHomepageRouteChip(route);
                const key = `${chip.chainId}-${chip.tokenIn}-${chip.tokenOut}`;

                if (chip.mode === 'executable' && chip.search) {
                  const href = `/swap?${chip.search}`;
                  const accessibleName = `Swap ${chip.tokenIn} to ${chip.tokenOut} on ${chip.chainLabel}`;
                  return (
                    <li key={key}>
                      <Link
                        to={href}
                        className="homepage-route-chip homepage-route-chip--action"
                        title={`${chip.label} · ${chip.chainLabel}`}
                        aria-label={accessibleName}
                        onClick={() => {
                          logRevenueTelemetry('pair_selected', {
                            chainId: chip.chainId,
                            fromSymbol: chip.tokenIn,
                            toSymbol: chip.tokenOut,
                            pairKey: `${chip.chainId}|${chip.tokenIn}|${chip.tokenOut}`,
                            source: 'homepage_chip',
                          });
                        }}
                      >
                        {chip.label}
                      </Link>
                    </li>
                  );
                }

                return (
                  <li key={key}>
                    <span
                      className="homepage-route-chip homepage-route-chip--info"
                      title={chip.label}
                    >
                      {chip.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </MobileCollapsibleSection>
  );
}

export default HomepagePopularRoutes;
