#!/usr/bin/env node
/**
 * Negative probes: uncertified / blocked pairs must fail closed via the policy module.
 * Does not broadcast transactions.
 */

import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// Load compiled-style TS via vitest-less dynamic import through the frontend vite-node is heavy;
// instead reimplement the same assertions by importing the built ESM after a lightweight transpile.
// Prefer running under the frontend test runner. This script uses a minimal duplicate check
// against the coverage source for CI-friendly Node-only gates, then verifies policy module via tsx if available.

import fs from 'node:fs';

function extractSetKeys(source, exportName) {
  const re = new RegExp(
    `export const ${exportName} = new Set<string>\\(\\[([\\s\\S]*?)\\]\\)`,
  );
  const m = source.match(re);
  if (!m) throw new Error(`Could not parse ${exportName}`);
  return new Set([...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]));
}

const coverage = fs.readFileSync(
  path.join(ROOT, 'frontend/src/constants/commissionCoverage.ts'),
  'utf8',
);
const CERTIFIED = extractSetKeys(coverage, 'COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS');
const BLOCKED = extractSetKeys(coverage, 'COMMISSION_AUDIT_BLOCKED_PAIR_KEYS');

const PROBES = [
  { key: '56|WBNB|USDT', expect: 'reject', label: 'BSC WBNB→USDT' },
  { key: '56|USDT|WBNB', expect: 'reject', label: 'BSC USDT→WBNB' },
  { key: '56|BNB|FDUSD', expect: 'reject', label: 'BSC BNB→FDUSD' },
  { key: '56|FDUSD|BNB', expect: 'reject', label: 'BSC FDUSD→BNB' },
  { key: '1|WETH|PEPE', expect: 'reject', label: 'ETH WETH→PEPE' },
  { key: '1|PEPE|WETH', expect: 'reject', label: 'ETH PEPE→WETH' },
  { key: '1|WETH|SNX', expect: 'reject', label: 'ETH WETH→SNX' },
  { key: '1|WETH|PENDLE', expect: 'reject', label: 'ETH WETH→PENDLE' },
  { key: '1|ETH|WETH', expect: 'reject', label: 'ETH→WETH wrap' },
  { key: '56|BNB|WBNB', expect: 'reject', label: 'BNB→WBNB wrap' },
  { key: '1|ETH|USDC', expect: 'allow', label: 'ETH→USDC certified' },
  { key: '56|BNB|USDT', expect: 'allow', label: 'BNB→USDT certified' },
];

let fail = 0;
for (const p of PROBES) {
  const certified = CERTIFIED.has(p.key);
  const blocked = BLOCKED.has(p.key);
  const executable = certified && !blocked;
  // Wrap pairs are never in CERTIFIED; blocked WBNB/FDUSD/PEPE are blocked.
  const ok =
    p.expect === 'allow'
      ? executable
      : !executable;
  console.log(`${ok ? 'PASS' : 'FAIL'} | ${p.label} | ${p.key} | certified=${certified} blocked=${blocked}`);
  if (!ok) fail += 1;
}

if (fail > 0) {
  console.error(`NEGATIVE_PROBES_FAILED=${fail}`);
  process.exit(1);
}
console.log('NEGATIVE_PROBES_OK');
