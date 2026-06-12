import type { RouteIntelBadge as Badge } from '@/constants/tradingIntelligence';
import { routeIntelBadgeLabel } from '@/constants/tradingIntelligence';

const BADGE_CLASS: Record<Badge, string> = {
  'most-used': 'border-accent/35 bg-accent/10 text-accent',
  trending: 'border-cyan/30 bg-cyan/10 text-cyan',
  audited: 'border-emerald-700/35 bg-emerald-900/25 text-emerald-100/95',
};

export function RouteIntelBadgePill({ badge }: { badge: Badge }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide border ${BADGE_CLASS[badge]}`}
    >
      {routeIntelBadgeLabel(badge)}
    </span>
  );
}
