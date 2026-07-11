#!/usr/bin/env node
/**
 * P16 — Route & navigation smoke (HTTP SPA shell).
 * Verifies first-class routes return index.html and expected title markers.
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
];

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

async function fetchRoute(baseUrl, route) {
  const url = `${baseUrl.replace(/\/$/, '')}${route.startsWith('/') ? route : `/${route}`}`;
  const res = await fetch(url, { redirect: 'follow' });
  const text = await res.text();
  return {
    route,
    url,
    status: res.status,
    ok: res.ok,
    hasRoot: text.includes('id="root"'),
    hasSwaperex: /Swaperex/i.test(text),
    isSpaShell: text.includes('/src/main.tsx') || text.includes('index-') || text.includes('id="root"'),
  };
}

async function main() {
  const opts = parseArgs(process.argv);
  const results = [];
  let fail = 0;

  for (const route of ROUTES) {
    try {
      const r = await fetchRoute(opts.baseUrl, route);
      const pass = r.ok && r.hasRoot;
      if (!pass) fail += 1;
      results.push({ ...r, pass });
    } catch (err) {
      fail += 1;
      results.push({ route, pass: false, error: String(err) });
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    baseUrl: opts.baseUrl,
    routes: results,
    verdict: fail === 0 ? 'P16_ROUTE_SMOKE_PASS' : 'P16_ROUTE_SMOKE_FAIL',
    failCount: fail,
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
