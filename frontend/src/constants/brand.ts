/**
 * P16.8 — Canonical brand hierarchy for Swaperex.
 *
 * Product: Swaperex (primary)
 * Parent: Kobbex (byline)
 * Domain: dex.kobbex.com
 */

export const BRAND = {
  productName: 'Swaperex',
  /** Primary display name (header, homepage title). */
  displayName: 'Swaperex',
  byline: 'by Kobbex',
  /** Combined lockup for compact UI (header, wallet metadata). */
  lockupShort: 'Swaperex by Kobbex',
  /** SEO / legal alternate name (structured data only). */
  alternateName: 'Kobbex DEX',
  domain: 'dex.kobbex.com',
  origin: 'https://dex.kobbex.com',
} as const;

/** Page title: "{Section} — Swaperex by Kobbex" */
export function brandPageTitle(section: string): string {
  return `${section} — ${BRAND.lockupShort}`;
}
