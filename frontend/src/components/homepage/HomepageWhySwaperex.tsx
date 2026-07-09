/**
 * P9.4 — Why Swaperex trust section (display-only).
 */

import { HOMEPAGE_WHY_CARDS } from '@/constants/homepageProductCopy';

export function HomepageWhySwaperex() {
  return (
    <section
      className="homepage-why-swaperex mt-8 sm:mt-10"
      aria-labelledby="homepage-why-heading"
    >
      <h2
        id="homepage-why-heading"
        className="text-sm font-semibold uppercase tracking-wider text-dark-300 mb-4"
      >
        Why Swaperex
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {HOMEPAGE_WHY_CARDS.map((card) => (
          <article key={card.title} className="homepage-why-card">
            <h3 className="text-sm font-semibold text-white mb-2">{card.title}</h3>
            <p className="text-xs sm:text-sm text-dark-400 leading-relaxed">{card.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

export default HomepageWhySwaperex;
