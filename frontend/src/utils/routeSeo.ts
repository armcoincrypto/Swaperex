/**
 * P3-C — Client-side document head updates for public info routes (no SSR).
 * P16 — Brand hierarchy + trade route SEO.
 * `index.html` remains the static fallback for first paint / no-JS.
 */

import { BRAND, brandPageTitle } from '@/constants/brand';
import { syncStructuredDataForPath } from '@/utils/structuredData';

export function normalizePublicPath(pathname: string): string {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed === '' ? '/' : trimmed;
}

type SeoSpec = {
  title: string;
  description: string;
  /** Path segment for canonical (and og:url), e.g. `/` or `/about`. */
  canonicalPath: string;
};

function specForPublicPath(p: string): SeoSpec {
  switch (p) {
    case '/swap':
      return {
        title: BRAND.displayName,
        description:
          'Non-custodial swap interface for Ethereum and BNB Chain. Balance view on additional EVM networks.',
        canonicalPath: '/swap',
      };
    case '/send':
      return {
        title: brandPageTitle('Send'),
        description: 'Send tokens on supported EVM networks with your connected wallet.',
        canonicalPath: '/send',
      };
    case '/portfolio':
      return {
        title: brandPageTitle('Portfolio'),
        description: 'View holdings, allocation, and activity across supported networks.',
        canonicalPath: '/portfolio',
      };
    case '/radar':
      return {
        title: brandPageTitle('Security'),
        description: 'Token watchlist, scanner, and security alerts on Swaperex.',
        canonicalPath: '/radar',
      };
    case '/screener':
      return {
        title: brandPageTitle('Markets'),
        description: 'Token screener and market discovery for supported networks.',
        canonicalPath: '/screener',
      };
    case '/about':
      return {
        title: brandPageTitle('About'),
        description: `Learn how ${BRAND.productName} works as a non-custodial crypto swap interface ${BRAND.byline}.`,
        canonicalPath: '/about',
      };
    case '/terms':
      return {
        title: brandPageTitle('Terms'),
        description: `Review the terms for using ${BRAND.productName}.`,
        canonicalPath: '/terms',
      };
    case '/privacy':
      return {
        title: brandPageTitle('Privacy'),
        description: `Review how ${BRAND.productName} handles wallet, browser, and public blockchain data.`,
        canonicalPath: '/privacy',
      };
    case '/disclaimer':
      return {
        title: brandPageTitle('Disclaimer'),
        description: `Review important risk, wallet, and transaction disclaimers for ${BRAND.productName}.`,
        canonicalPath: '/disclaimer',
      };
    case '/trust':
      return {
        title: brandPageTitle('Trust Center'),
        description:
          'Transparency on custody, commission fees, supported networks, and audited swap routes.',
        canonicalPath: '/trust',
      };
    case '/':
    default:
      return {
        title: BRAND.displayName,
        description:
          'Non-custodial swap interface for Ethereum and BNB Chain. Balance view on additional EVM networks.',
        canonicalPath: '/',
      };
  }
}

function canonicalUrl(origin: string, canonicalPath: string): string {
  if (canonicalPath === '/') return `${origin}/`;
  return `${origin}${canonicalPath}`;
}

function setMetaName(name: string, content: string): void {
  let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setMetaProperty(property: string, content: string): void {
  let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('property', property);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string): void {
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * Sync `<title>`, description, canonical, and basic Open Graph / Twitter tags
 * from the public URL path (aligned with P3-A crawlable routes).
 */
export function applyClientRouteSeo(pathname: string): void {
  if (typeof document === 'undefined') return;

  const p = normalizePublicPath(pathname);
  const spec = specForPublicPath(p);
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const url = canonicalUrl(origin, spec.canonicalPath);

  document.title = spec.title;

  setMetaName('description', spec.description);
  setCanonical(url);

  setMetaProperty('og:title', spec.title);
  setMetaProperty('og:description', spec.description);
  setMetaProperty('og:url', url);

  setMetaName('twitter:title', spec.title);
  setMetaName('twitter:description', spec.description);

  syncStructuredDataForPath(p);
}
