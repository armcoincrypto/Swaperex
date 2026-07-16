/**
 * P9.4 / P20 — Why Swaperex (value props + custody principles).
 */

import {
  HOMEPAGE_TRUST_PRINCIPLES,
  HOMEPAGE_WHY_CARDS,
} from '@/constants/homepageProductCopy';
import { MobileCollapsibleSection } from '@/components/homepage/MobileCollapsibleSection';

export function HomepageWhySwaperex() {
  return (
    <MobileCollapsibleSection
      title="Why Kobbex"
      summary="Self-custody, certified routes, and transparent fees"
      headingId="homepage-why-heading"
      className="homepage-why-swaperex"
      defaultOpen={false}
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {HOMEPAGE_WHY_CARDS.map((card) => (
          <article key={card.title} className="homepage-why-card">
            <h3 className="text-sm font-semibold text-white mb-2">{card.title}</h3>
            <p className="text-xs sm:text-sm text-dark-400 leading-relaxed">{card.body}</p>
          </article>
        ))}
      </div>
      <ul className="mt-4 flex flex-wrap gap-3 text-[11px] text-dark-500">
        {HOMEPAGE_TRUST_PRINCIPLES.map((p) => (
          <li key={p.id} className="rounded-lg border border-white/[0.06] px-2.5 py-1.5">
            <span className="text-dark-200 font-medium tabular-nums">{p.value}</span>{' '}
            {p.label}
          </li>
        ))}
      </ul>
    </MobileCollapsibleSection>
  );
}

export default HomepageWhySwaperex;
