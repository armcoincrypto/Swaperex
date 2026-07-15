/**
 * P9.1 / P20 — Compact trust strip near the swap form (≤3 signals).
 */

import {
  HOMEPAGE_TRUST_PILLS,
  HOMEPAGE_TRUST_STRIP,
} from '@/constants/homepageProductCopy';

export function HomepageTrustStrip() {
  return (
    <section
      className="homepage-trust-strip mb-3 sm:mb-4"
      aria-label="Swaperex product trust highlights"
    >
      <p className="text-xs sm:text-sm text-dark-400 text-center lg:text-left leading-snug mb-2.5">
        {HOMEPAGE_TRUST_STRIP}
      </p>
      <ul className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5 lg:justify-start">
        {HOMEPAGE_TRUST_PILLS.map((label) => (
          <li key={label}>
            <span className="homepage-trust-pill" aria-hidden>
              {label}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default HomepageTrustStrip;
