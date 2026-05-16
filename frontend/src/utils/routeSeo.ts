/**
 * P3-C — Client-side document head updates for public info routes (no SSR).
 * `index.html` remains the static fallback for first paint / no-JS.
 */

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
    case '/about':
      return {
        title: 'About — Kobbex DEX',
        description: 'Learn how Kobbex DEX works as a non-custodial crypto swap interface.',
        canonicalPath: '/about',
      };
    case '/terms':
      return {
        title: 'Terms — Kobbex DEX',
        description: 'Review the terms for using Kobbex DEX.',
        canonicalPath: '/terms',
      };
    case '/privacy':
      return {
        title: 'Privacy — Kobbex DEX',
        description: 'Review how Kobbex DEX handles wallet, browser, and public blockchain data.',
        canonicalPath: '/privacy',
      };
    case '/disclaimer':
      return {
        title: 'Disclaimer — Kobbex DEX',
        description: 'Review important risk, wallet, and transaction disclaimers for using Kobbex DEX.',
        canonicalPath: '/disclaimer',
      };
    case '/':
    default:
      return {
        title: 'Kobbex DEX',
        description:
          'Non-custodial decentralized exchange interface for swapping crypto across supported networks.',
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
}
