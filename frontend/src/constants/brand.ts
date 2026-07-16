/**
 * Canonical brand hierarchy for the Kobbex DEX product.
 *
 * Product: Kobbex (primary, public-facing)
 * Domain: dex.kobbex.com
 */

export const BRAND = {
  productName: 'Kobbex',
  /** Primary display name (header, homepage title). */
  displayName: 'Kobbex',
  /** Secondary byline — intentionally empty for the unified Kobbex brand. */
  byline: '',
  /** Combined lockup for compact UI (header, wallet metadata). */
  lockupShort: 'Kobbex',
  /** SEO / legal alternate name (structured data only). */
  alternateName: 'Kobbex DEX',
  domain: 'dex.kobbex.com',
  origin: 'https://dex.kobbex.com',
} as const;

/** Page title: "{Section} — Kobbex" */
export function brandPageTitle(section: string): string {
  return `${section} — ${BRAND.lockupShort}`;
}
