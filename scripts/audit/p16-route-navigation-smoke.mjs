#!/usr/bin/env node
/**
 * P16 — Route & navigation smoke (HTTP SPA shell).
 * Distinguishes connection failures from HTTP/content failures.
 *
 * Usage:
 *   node scripts/audit/p16-route-navigation-smoke.mjs
 *   node scripts/audit/p16-route-navigation-smoke.mjs --base-url http://127.0.0.1:4173
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const ROUTES = [
  '/',
  '/swap',
  '/send',
  '/portfolio',
  '/radar',
  '/screener',
  '/trust',
  '/about',
  '/terms',
  '/privacy',
  '/disclaimer',
  '/swap?chain=1&from=WETH&to=USDT',
  '/swap?chain=56&from=WBNB&to=USDC&slippage=0.5',
  '/portfolio#holdings',
];

const FETCH_TIMEOUT_MS = 15_000;

function parseArgs(argv) {
  const opts = {
    baseUrl: process.env.SWAPEREX_QA_URL || 'https://dex.kobbex.com',
    output: path.join(REPO_ROOT, 'reports/p16-route-navigation-smoke.json'),
  };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--base-url') opts.baseUrl = argv[++i];
    else if (argv[i] === '--output') opts.output = argv[++i];
  }
  return opts;
}

function classifyFetchError(err) {
  const msg = String(err?.cause?.code || err?.code || err?.message || err);
  if (/ECONNREFUSED|ENOTFOUND|ECONNRESET|fetch failed/i.test(msg)) {
    return 'connection_failure';
  }
  if (/timeout|AbortError/i.test(msg)) {
    return 'timeout';
  }
  return 'transport_error';
}

async function fetchRoute(baseUrl, route) {
  const url = `${baseUrl.replace(/\/$/, '')}${route.startsWith('/') ? route : `/${route}`}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { redirect: 'follow', signal: controller.signal });
    const text = await res.text();
    const hasRoot = text.includes('id="root"');
    const hasSwaperex = /Swaperex/i.test(text);
    const isSpaShell =
      text.includes('/src/main.tsx') || text.includes('index-') || hasRoot;

    let failureKind = null;
    if (!res.ok) {
      if (res.status === 404) failureKind = 'http_404';
      else if (res.status >= 500) failureKind = 'http_5xx';
      else failureKind = 'http_error';
    } else if (!hasRoot) {
      failureKind = 'missing_app_shell';
    } else if (!isSpaShell) {
      failureKind = 'unexpected_content';
    }

    return {
      route,
      url,
      status: res.status,
      ok: res.ok,
      hasRoot,
      hasSwaperex,
      isSpaShell,
      failureKind,
      pass: res.ok && hasRoot && isSpaShell,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  const results = [];
  let fail = 0;
  let connectionFailures = 0;

  for (const route of ROUTES) {
    try {
      const r = await fetchRoute(opts.baseUrl, route);
      if (!r.pass) fail += 1;
      results.push(r);
    } catch (err) {
      fail += 1;
      const failureKind = classifyFetchError(err);
      if (failureKind === 'connection_failure') connectionFailures += 1;
      results.push({
        route,
        pass: false,
        failureKind,
        error: String(err),
      });
    }
  }

  let verdict = fail === 0 ? 'P16_ROUTE_SMOKE_PASS' : 'P16_ROUTE_SMOKE_FAIL';
  if (connectionFailures === ROUTES.length) {
    verdict = 'P16_ROUTE_SMOKE_CONNECTION_FAILURE';
  }

  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: opts.baseUrl,
    routeCount: ROUTES.length,
    routes: results,
    verdict,
    failCount: fail,
    connectionFailureCount: connectionFailures,
    hint:
      connectionFailures === ROUTES.length
        ? 'All routes failed with connection errors — is the Vite preview server running and ready?'
        : undefined,
  };

  fs.mkdirSync(path.dirname(opts.output), { recursive: true });
  fs.writeFileSync(opts.output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
