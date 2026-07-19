#!/usr/bin/env node
/**
 * Deterministic alignment audit: every execution-facing catalog must be a subset
 * of COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS (and must not include blocked WBNB legs).
 *
 * Usage: node scripts/audit/audit-commission-coverage-alignment.mjs
 * Exit 0 when MISMATCHES=0.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function extractSetKeys(source, exportName) {
  const re = new RegExp(
    `export const ${exportName} = new Set<string>\\(\\[([\\s\\S]*?)\\]\\)`,
  );
  const m = source.match(re);
  if (!m) throw new Error(`Could not parse ${exportName}`);
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

function extractRouteCatalog(source, constName) {
  const start = source.indexOf(`const ${constName}`);
  if (start < 0) throw new Error(`Missing ${constName}`);
  const slice = source.slice(start, start + 8000);
  const routes = [];
  const re =
    /chainId:\s*(\d+)[\s\S]*?fromSymbol:\s*'([^']+)'[\s\S]*?toSymbol:\s*'([^']+)'[\s\S]*?bidirectional:\s*(true|false)/g;
  let m;
  while ((m = re.exec(slice))) {
    routes.push({
      chainId: Number(m[1]),
      from: m[2].toUpperCase(),
      to: m[3].toUpperCase(),
      bidirectional: m[4] === 'true',
    });
  }
  return routes;
}

function loadEnvProduction() {
  const env = {};
  for (const line of read('frontend/.env.production').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    env[t.slice(0, i)] = t.slice(i + 1);
  }
  return env;
}

function pairKey(chainId, a, b) {
  return `${chainId}|${a}|${b}`;
}

const coverageSrc = read('frontend/src/constants/commissionCoverage.ts');
const CERTIFIED = new Set(extractSetKeys(coverageSrc, 'COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS'));
const BLOCKED = new Set(extractSetKeys(coverageSrc, 'COMMISSION_AUDIT_BLOCKED_PAIR_KEYS'));

const popular = extractRouteCatalog(
  read('frontend/src/constants/popularCommissionRoutes.ts'),
  'ROUTE_CATALOG',
);
const featured = extractRouteCatalog(
  read('frontend/src/constants/featuredCommissionRoutes.ts'),
  'FEATURED_CATALOG',
);

const env = loadEnvProduction();
const canaryRaw = env.VITE_UNISWAP_WRAPPER_V3_CANARY_PAIRS || '';
const CANARY = canaryRaw
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((seg) => {
    const parts = seg.split('-').map((p) => p.trim().toUpperCase()).filter(Boolean);
    return parts;
  })
  .filter((p) => p.length >= 2);

const mismatches = [];

function checkDirectional(label, chainId, from, to) {
  const key = pairKey(chainId, from, to);
  if (BLOCKED.has(key)) {
    mismatches.push(`${label}: blocked key present in execution catalog: ${key}`);
    return;
  }
  if (!CERTIFIED.has(key)) {
    mismatches.push(`${label}: missing from certified coverage: ${key}`);
  }
  if (from === 'WBNB' || to === 'WBNB') {
    mismatches.push(`${label}: WBNB endpoint not allowed in executable catalog: ${key}`);
  }
  if (chainId !== 1 && chainId !== 56) {
    mismatches.push(`${label}: view-only/non-swap chain: ${key}`);
  }
}

function expandCatalog(label, routes) {
  for (const r of routes) {
    checkDirectional(label, r.chainId, r.from, r.to);
    if (r.bidirectional) checkDirectional(label, r.chainId, r.to, r.from);
  }
}

expandCatalog('POPULAR', popular);
expandCatalog('FEATURED', featured);

for (const pathSyms of CANARY) {
  const a = pathSyms[0];
  const b = pathSyms[pathSyms.length - 1];
  checkDirectional('CANARY', 1, a, b);
  if (pathSyms.length === 2) checkDirectional('CANARY', 1, b, a);
  if (pathSyms.includes('SNX') || pathSyms.includes('PENDLE')) {
    mismatches.push(`CANARY: demoted multi-hop still present: ${pathSyms.join('-')}`);
  }
}

if (!env.VITE_COMMISSION_REQUIRED || !['1', 'true', 'yes', 'on'].includes(String(env.VITE_COMMISSION_REQUIRED).toLowerCase())) {
  mismatches.push('PRODUCTION: VITE_COMMISSION_REQUIRED is not enabled');
}

const ethCount = [...CERTIFIED].filter((k) => k.startsWith('1|')).length;
const bscCount = [...CERTIFIED].filter((k) => k.startsWith('56|')).length;
if (ethCount === 0) mismatches.push('CERTIFIED: Ethereum has zero routes');
if (bscCount === 0) mismatches.push('CERTIFIED: BNB Chain has zero routes');

const policySrc = read('frontend/src/utils/commissionRoutePolicy.ts');
if (!policySrc.includes('assertCommissionRouteCertified')) {
  mismatches.push('EXECUTION: commissionRoutePolicy missing assertCommissionRouteCertified');
}
const useSwapSrc = read('frontend/src/hooks/useSwap.ts');
if (!useSwapSrc.includes('assertCommissionRouteCertified') && !useSwapSrc.includes('assertLiveCertifiedCommissionRoute')) {
  mismatches.push('EXECUTION: useSwap does not enforce certified routes');
}
const aggSrc = read('frontend/src/services/quoteAggregator.ts');
if (!aggSrc.includes('assertCommissionRouteCertified')) {
  mismatches.push('EXECUTION: quoteAggregator does not enforce certified routes');
}

const tokenRowSrc = read('frontend/src/components/screener/TokenRow.tsx');
const portfolioSrc = read('frontend/src/components/portfolio/PortfolioTokenTable.tsx');
const screenerSrc = read('frontend/src/components/screener/TokenScreener.tsx');
const shellSrc = read('frontend/src/components/layout/TradeShell.tsx');
const urlSyncSrc = read('frontend/src/hooks/useSwapUrlSync.ts');
const availabilitySrc = read('frontend/src/utils/swapAvailability.ts');
const homepagePopularSrc = read('frontend/src/components/homepage/HomepagePopularRoutes.tsx');
const homepageChipsSrc = read('frontend/src/utils/homepageRouteChips.ts');

let marketsExecutableCtas = 0;
let portfolioExecutableCtas = 0;
let featuredExecutableCtas = featured.length;
let deepLinkDefaults = 0;
const uncertifiedCtaTargets = [];
const homepageUncertifiedTargets = [];
const homepageInvalidIdentities = [];
const homepageManualUrls = [];

if (!availabilitySrc.includes('buildCertifiedSwapNavigation')) {
  uncertifiedCtaTargets.push('swapAvailability missing buildCertifiedSwapNavigation');
}
if (!availabilitySrc.includes('buildCertifiedDirectionalSwapNavigation')) {
  homepageUncertifiedTargets.push('swapAvailability missing buildCertifiedDirectionalSwapNavigation');
}
if (!homepageChipsSrc.includes('buildCertifiedDirectionalSwapNavigation')) {
  homepageUncertifiedTargets.push('homepageRouteChips must use buildCertifiedDirectionalSwapNavigation');
}
if (!homepagePopularSrc.includes('resolveHomepageRouteChip')) {
  homepageUncertifiedTargets.push('HomepagePopularRoutes must resolve chips via resolveHomepageRouteChip');
}
if (homepagePopularSrc.includes('`/swap?') || homepagePopularSrc.includes("'/swap?")) {
  // Manual string templates for query assembly are forbidden; href must come from chip.search
  if (!homepagePopularSrc.includes('chip.search')) {
    homepageManualUrls.push('HomepagePopularRoutes assembles swap URLs without chip.search');
  }
}
if (/searchParams\.set\(|URLSearchParams|from=.*to=/.test(homepagePopularSrc) && !homepagePopularSrc.includes('chip.search')) {
  homepageManualUrls.push('HomepagePopularRoutes appears to build query strings manually');
}
if (!tokenRowSrc.includes('getSwapAvailability')) {
  uncertifiedCtaTargets.push('TokenRow does not use getSwapAvailability');
} else {
  marketsExecutableCtas += 1;
}
if (!screenerSrc.includes('buildCertifiedSwapNavigation')) {
  uncertifiedCtaTargets.push('TokenScreener does not build certified navigation');
} else {
  marketsExecutableCtas += 1;
}
if (!portfolioSrc.includes('isExecutableSwapCta') && !portfolioSrc.includes('getSwapAvailability')) {
  uncertifiedCtaTargets.push('PortfolioTokenTable missing certified CTA gate');
} else {
  portfolioExecutableCtas += 1;
}
if (!shellSrc.includes('buildCertifiedSwapNavigation') || !shellSrc.includes('isCommissionRouteCertified')) {
  uncertifiedCtaTargets.push('TradeShell handlers missing certified route checks');
}
if (!urlSyncSrc.includes('isCommissionRouteCertified')) {
  uncertifiedCtaTargets.push('useSwapUrlSync does not certify deep-link pairs');
} else {
  deepLinkDefaults += 1;
}
if (shellSrc.includes("getTokenBySymbol('USDT'") && shellSrc.includes('handlePortfolioSwapV2')) {
  // Hardcoded USDT portfolio path should be gone
  const portfolioFn = shellSrc.slice(shellSrc.indexOf('handlePortfolioSwapV2'));
  if (portfolioFn.includes("getTokenBySymbol('USDT'")) {
    uncertifiedCtaTargets.push('TradeShell portfolio handler still hardcodes USDT counterpart');
  }
}

// Homepage chip inventory (catalog-backed; executable chips must be certified)
let homepageRouteChips = popular.length;
let homepageExecutableChips = 0;
let homepageInformationalChips = 0;
for (const r of popular) {
  const forward = pairKey(r.chainId, r.from, r.to);
  const reverse = pairKey(r.chainId, r.to, r.from);
  const forwardOk = CERTIFIED.has(forward) && !BLOCKED.has(forward);
  const reverseOk = !r.bidirectional || (CERTIFIED.has(reverse) && !BLOCKED.has(reverse));
  if (r.from === 'WBNB' || r.to === 'WBNB') {
    homepageUncertifiedTargets.push(`homepage chip WBNB endpoint: ${forward}`);
  }
  if (r.chainId !== 1 && r.chainId !== 56) {
    homepageUncertifiedTargets.push(`homepage chip on view-only chain: ${forward}`);
  }
  if (!r.from || !r.to || r.from === r.to) {
    homepageInvalidIdentities.push(`homepage chip invalid identity: ${forward}`);
  }
  if (forwardOk && reverseOk) {
    homepageExecutableChips += 1;
  } else {
    homepageInformationalChips += 1;
    if (!forwardOk) {
      homepageUncertifiedTargets.push(`homepage executable candidate missing coverage: ${forward}`);
    }
  }
}

console.log(`CERTIFIED_ROUTES=${CERTIFIED.size}`);
console.log(`CERTIFIED_ETH=${ethCount}`);
console.log(`CERTIFIED_BSC=${bscCount}`);
console.log(`POPULAR_ROUTES=${popular.length}`);
console.log(`FEATURED_ROUTES=${featured.length}`);
console.log(`CANARY_ROUTES=${CANARY.length}`);
console.log(`BLOCKED_ROUTES=${BLOCKED.size}`);
console.log(`MARKETS_EXECUTABLE_CTAS=${marketsExecutableCtas}`);
console.log(`PORTFOLIO_EXECUTABLE_CTAS=${portfolioExecutableCtas}`);
console.log(`FEATURED_EXECUTABLE_CTAS=${featuredExecutableCtas}`);
console.log(`DEEP_LINK_DEFAULTS=${deepLinkDefaults}`);
console.log(`HOMEPAGE_ROUTE_CHIPS=${homepageRouteChips}`);
console.log(`HOMEPAGE_EXECUTABLE_CHIPS=${homepageExecutableChips}`);
console.log(`HOMEPAGE_INFORMATIONAL_CHIPS=${homepageInformationalChips}`);
console.log(`HOMEPAGE_UNCERTIFIED_TARGETS=${homepageUncertifiedTargets.length}`);
console.log(`HOMEPAGE_INVALID_IDENTITIES=${homepageInvalidIdentities.length}`);
console.log(`HOMEPAGE_MANUAL_URLS=${homepageManualUrls.length}`);
console.log(`UNCERTIFIED_CTA_TARGETS=${uncertifiedCtaTargets.length}`);
for (const m of uncertifiedCtaTargets) {
  console.log(`  - CTA: ${m}`);
  mismatches.push(m);
}
for (const m of homepageUncertifiedTargets) {
  console.log(`  - HOMEPAGE: ${m}`);
  mismatches.push(m);
}
for (const m of homepageInvalidIdentities) {
  console.log(`  - HOMEPAGE_ID: ${m}`);
  mismatches.push(m);
}
for (const m of homepageManualUrls) {
  console.log(`  - HOMEPAGE_URL: ${m}`);
  mismatches.push(m);
}
console.log(`MISMATCHES=${mismatches.length}`);
for (const m of mismatches) console.log(`  - ${m}`);

if (mismatches.length > 0) {
  process.exit(1);
}
console.log('ALIGNMENT_OK');
