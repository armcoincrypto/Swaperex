/**
 * P16 — Canonical application route map.
 * Wallet-free: safe to import from PassiveShell and tests.
 */

import { normalizePublicPath } from '@/utils/routeSeo';

export type AppPage =
  | 'swap'
  | 'send'
  | 'portfolio'
  | 'radar'
  | 'screener'
  | 'about'
  | 'terms'
  | 'privacy'
  | 'disclaimer'
  | 'trust';

export type TradePage = Extract<
  AppPage,
  'swap' | 'send' | 'portfolio' | 'radar' | 'screener'
>;

export type PassiveInfoPage = Extract<
  AppPage,
  'about' | 'terms' | 'privacy' | 'disclaimer' | 'trust'
>;

/** First-class public paths (excluding query/hash). */
export const APP_ROUTE_PATHS = {
  swap: '/swap',
  send: '/send',
  portfolio: '/portfolio',
  radar: '/radar',
  screener: '/screener',
  about: '/about',
  terms: '/terms',
  privacy: '/privacy',
  disclaimer: '/disclaimer',
  trust: '/trust',
} as const satisfies Record<AppPage, string>;

export type AppRoutePath = (typeof APP_ROUTE_PATHS)[AppPage];

/** Homepage alias — preserved for SEO and existing inbound links. */
export const HOMEPAGE_PATH = '/';

const PATH_TO_PAGE: Record<string, AppPage> = {
  '/': 'swap',
  [APP_ROUTE_PATHS.swap]: 'swap',
  [APP_ROUTE_PATHS.send]: 'send',
  [APP_ROUTE_PATHS.portfolio]: 'portfolio',
  [APP_ROUTE_PATHS.radar]: 'radar',
  [APP_ROUTE_PATHS.screener]: 'screener',
  [APP_ROUTE_PATHS.about]: 'about',
  [APP_ROUTE_PATHS.terms]: 'terms',
  [APP_ROUTE_PATHS.privacy]: 'privacy',
  [APP_ROUTE_PATHS.disclaimer]: 'disclaimer',
  [APP_ROUTE_PATHS.trust]: 'trust',
};

const PAGE_TO_CANONICAL_PATH: Record<AppPage, AppRoutePath | typeof HOMEPAGE_PATH> = {
  swap: APP_ROUTE_PATHS.swap,
  send: APP_ROUTE_PATHS.send,
  portfolio: APP_ROUTE_PATHS.portfolio,
  radar: APP_ROUTE_PATHS.radar,
  screener: APP_ROUTE_PATHS.screener,
  about: APP_ROUTE_PATHS.about,
  terms: APP_ROUTE_PATHS.terms,
  privacy: APP_ROUTE_PATHS.privacy,
  disclaimer: APP_ROUTE_PATHS.disclaimer,
  trust: APP_ROUTE_PATHS.trust,
};

export function pathToPage(pathname: string): AppPage | null {
  const normalized = normalizePublicPath(pathname);
  return PATH_TO_PAGE[normalized] ?? null;
}

/** Canonical path for navigation (swap uses `/swap`; `/` remains valid when already there). */
export function pageToPath(page: AppPage): AppRoutePath | typeof HOMEPAGE_PATH {
  return PAGE_TO_CANONICAL_PATH[page];
}

export function isTradePage(page: AppPage): page is TradePage {
  return (
    page === 'swap' ||
    page === 'send' ||
    page === 'portfolio' ||
    page === 'radar' ||
    page === 'screener'
  );
}

export function isPassiveInfoPage(page: AppPage): page is PassiveInfoPage {
  return (
    page === 'about' ||
    page === 'terms' ||
    page === 'privacy' ||
    page === 'disclaimer' ||
    page === 'trust'
  );
}

/** Paths served by PassiveShell in App.tsx (wallet-free). */
export const PASSIVE_SHELL_PATHS = new Set<string>([
  APP_ROUTE_PATHS.trust,
  APP_ROUTE_PATHS.about,
  APP_ROUTE_PATHS.terms,
  APP_ROUTE_PATHS.privacy,
  APP_ROUTE_PATHS.disclaimer,
]);

export function isKnownPublicPath(pathname: string): boolean {
  return pathToPage(pathname) !== null;
}

export function footerPageToPath(page: AppPage, section?: string): string {
  const base = pageToPath(page);
  if (!section) return base;
  return `${base}#${section}`;
}
