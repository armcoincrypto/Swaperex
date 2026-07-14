/**
 * P9.1 — Compact trust/value strip for the trade homepage (display-only).
 */

import { HOMEPAGE_TRUST_STRIP } from '@/constants/homepageProductCopy';

const TRUST_PILLS = [
  'Self-Custody',
  'Certified Routes',
  'Live Quotes',
  'No Registration',
  'Ethereum & BNB Chain',
] as const;

export function HomepageTrustStrip() {
  return (
    <section
      className="homepage-trust-strip mb-4 sm:mb-5"
      aria-label="Swaperex product trust highlights"
    >
      <p className="sr-only">{HOMEPAGE_TRUST_STRIP}</p>
      <ul className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5 lg:justify-start">
        {TRUST_PILLS.map((label) => (
          <li key={label}>
            <span className="homepage-trust-pill">{label}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default HomepageTrustStrip;
