/**
 * P4 — Client-side JSON-LD for public routes (no SSR). No reviews, ratings, or fabricated entities.
 */

import { KOBBEX_DEX_LANDING_FAQ } from '@/constants/kobbexDexLandingFaq';

const SCRIPT_ID = 'kobbex-dex-structured-data';

function setJsonLdScript(json: object): void {
  if (typeof document === 'undefined') return;
  let el = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement('script');
    el.id = SCRIPT_ID;
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(json);
}

function buildFaqMainEntity() {
  return KOBBEX_DEX_LANDING_FAQ.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: {
      '@type': 'Answer',
      text: item.answer,
    },
  }));
}

/**
 * Injects or updates a single `@graph` document: Organization + WebSite on all
 * listed public paths; FAQPage only on `/` where the landing FAQ is shown.
 */
export function syncStructuredDataForPath(normalizedPath: string): void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return;

  const origin = window.location.origin;

  const graph: Record<string, unknown>[] = [
    {
      '@type': 'Organization',
      name: 'Kobbex DEX',
      url: origin,
    },
    {
      '@type': 'WebSite',
      name: 'Kobbex DEX',
      url: origin,
    },
  ];

  if (normalizedPath === '/') {
    graph.push({
      '@type': 'FAQPage',
      mainEntity: buildFaqMainEntity(),
    });
  }

  setJsonLdScript({
    '@context': 'https://schema.org',
    '@graph': graph,
  });
}
