#!/usr/bin/env node
/**
 * P22 read-only route-quality audit.
 *
 * Reuses the certified commission quote audit (wrapper staticCall only), then
 * enriches every route-size quote with exact economics and honest data-quality
 * classifications. Never signs, approves, or broadcasts.
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const useExisting = process.argv.includes('--from-existing-report');

function latestCommissionReport() {
  const dir = path.join(REPO_ROOT, 'reports');
  const files = fs
    .readdirSync(dir)
    .filter((name) => /^commission-pair-audit-\d{8}\.json$/.test(name))
    .sort();
  if (!files.length) throw new Error('No commission pair audit report found');
  return path.join(dir, files.at(-1));
}

if (!useExisting) {
  execFileSync(process.execPath, [path.join(__dirname, 'audit-commission-pairs.mjs')], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
  });
}

const sourcePath = latestCommissionReport();
const source = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
const coverageSource = fs.readFileSync(
  path.join(REPO_ROOT, 'frontend/src/constants/commissionCoverage.ts'),
  'utf8',
);
const supportedBlock = coverageSource.match(
  /COMMISSION_AUDIT_SUPPORTED_PAIR_KEYS[\s\S]*?\[([\s\S]*?)\]\);/,
)?.[1];
if (!supportedBlock) throw new Error('Could not parse canonical commission coverage');
const canonicalKeys = new Set(
  [...supportedBlock.matchAll(/'(\d+\|[^']+)'/g)].map((match) => match[1]),
);
const observedKeys = new Set(
  source.rows
    .filter((row) => row.quoteStatus === 'PASS')
    .map((row) => `${row.chainId}|${row.direction.replace('→', '|')}`),
);
const missingCanonical = [...canonicalKeys].filter((key) => !observedKeys.has(key)).sort();
const unexpectedObserved = [...observedKeys].filter((key) => !canonicalKeys.has(key)).sort();
if (missingCanonical.length || unexpectedObserved.length) {
  throw new Error(
    `Route-quality source does not match canonical coverage: missing=${missingCanonical.join(',')} unexpected=${unexpectedObserved.join(',')}`,
  );
}
const timestamp = new Date().toISOString();
const stamp = timestamp.replace(/[-:.]/g, '').replace('Z', 'Z');
const artifactDir = path.join(REPO_ROOT, 'artifacts/route-quality', stamp);
fs.mkdirSync(artifactDir, { recursive: true });

function qualityRow(row) {
  const quotedAt = source.auditedAt;
  const hopCount = row.path ? row.path.split('→').filter(Boolean).length - 1 : 1;
  const warnings = [];
  if (hopCount > 1) warnings.push('MULTI_HOP');
  if (!row.gasEstimate) warnings.push('NO_GAS_ESTIMATE');
  // Current wrappers do not expose trustworthy pool mid-price/liquidity in this audit.
  warnings.push('NO_PRICE_IMPACT_DATA');

  let qualityStatus = 'UNKNOWN_DATA';
  if (row.quoteStatus === 'FAIL') qualityStatus = 'UNAVAILABLE';
  if (row.quoteStatus === 'BLOCKED') qualityStatus = 'BLOCKED';

  return {
    chainId: row.chainId,
    route: row.direction,
    profile: row.profile ?? null,
    amountIn: row.amountIn ?? null,
    grossOutputRaw: row.grossOutputRaw ?? null,
    grossOutput: row.grossOutput ?? null,
    commissionRaw: row.feeAmountRaw ?? null,
    commission: row.feeAmount ?? null,
    commissionBps: row.feeBps ?? null,
    netOutputRaw: row.netOutputRaw ?? null,
    netOutput: row.netOutput ?? row.amountOut ?? null,
    gasUnits: row.gasEstimate ?? null,
    estimatedGasNative: null,
    estimatedGasUsd: null,
    minimumReceivedRaw: row.minimumReceivedRaw ?? null,
    minimumReceived: row.minimumReceived ?? null,
    slippageBps: row.slippageBps ?? 50,
    priceImpactBps: null,
    liquidityUsd: null,
    hopCount,
    qualityStatus,
    warnings: [...new Set(warnings)].sort(),
    selectedProvider: row.provider ?? null,
    wrapper: row.wrapper ?? null,
    feeTier: row.feeTier ?? null,
    quotedAt,
    quoteStatus: row.quoteStatus,
    error: row.error ?? null,
  };
}

const rows = source.rows.map(qualityRow);
const profileOrder = new Map([
  ['small', 0],
  ['normal', 1],
  ['large', 2],
]);
for (const route of new Set(rows.map((row) => `${row.chainId}|${row.route}`))) {
  const sizes = rows
    .filter((row) => `${row.chainId}|${row.route}` === route && row.quoteStatus === 'PASS')
    .sort((a, b) => (profileOrder.get(a.profile) ?? 99) - (profileOrder.get(b.profile) ?? 99));
  const scalesStrictly = sizes.every(
    (row, index) =>
      index === 0 ||
      (row.netOutputRaw != null &&
        sizes[index - 1]?.netOutputRaw != null &&
        BigInt(row.netOutputRaw) > BigInt(sizes[index - 1].netOutputRaw)),
  );
  if (sizes.length === 3 && !scalesStrictly) {
    for (const row of sizes) {
      row.qualityStatus = 'BLOCKED';
      row.warnings = [...new Set([...row.warnings, 'WRAPPER_DEGRADED'])].sort();
      row.error = 'Output does not increase across small/normal/large input profiles';
    }
  }
}
const statusCounts = Object.fromEntries(
  [...new Set(rows.map((row) => row.qualityStatus))]
    .sort()
    .map((status) => [status, rows.filter((row) => row.qualityStatus === status).length]),
);
const report = {
  audit: 'KOBBEX_P22_ROUTE_QUALITY',
  generatedAt: timestamp,
  sourceReport: path.relative(REPO_ROOT, sourcePath),
  noBroadcast: true,
  routes: {
    directional: canonicalKeys.size,
    observations: rows.length,
    profiles: ['small', 'normal', 'large'],
  },
  limitations: [
    'Wrapper quote methods do not expose a trustworthy pool mid-price, so price impact is UNKNOWN_DATA rather than assumed safe.',
    'No trusted token/native USD oracle is wired into the quote pipeline, so gas-adjusted USD ranking is unavailable.',
    'Pool liquidity is not returned by wrapper quote methods and is not inferred from token-list prices.',
  ],
  statusCounts,
  rows,
};

const jsonPath = path.join(artifactDir, 'route-quality.json');
fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));

const columns = [
  'chainId',
  'route',
  'profile',
  'amountIn',
  'grossOutput',
  'commission',
  'commissionBps',
  'netOutput',
  'gasUnits',
  'minimumReceived',
  'priceImpactBps',
  'liquidityUsd',
  'hopCount',
  'qualityStatus',
  'warnings',
  'selectedProvider',
  'wrapper',
  'feeTier',
  'quotedAt',
];
const csvCell = (value) => {
  const text = Array.isArray(value) ? value.join('|') : value == null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
};
const csv = [
  columns.join(','),
  ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')),
].join('\n');
const csvPath = path.join(artifactDir, 'route-quality.csv');
fs.writeFileSync(csvPath, `${csv}\n`);

const date = timestamp.slice(0, 10).replaceAll('-', '');
const docsDir = path.join(REPO_ROOT, 'docs/audits');
fs.mkdirSync(docsDir, { recursive: true });
const docPath = path.join(docsDir, `kobbex-route-quality-${date}.md`);
const markdown = `# Kobbex P22 Route Quality Audit — ${timestamp.slice(0, 10)}

## Result

- Certified directional routes observed: **${report.routes.directional}**
- Route-size observations: **${report.routes.observations}**
- Static-call quote failures: **${rows.filter((row) => row.quoteStatus === 'FAIL').length}**
- Network broadcasts: **0**
- Status counts: ${Object.entries(statusCounts).map(([key, value]) => `**${key}=${value}**`).join(', ')}

## Accounting

Every passing source quote proves \`gross - commission = net\` using the wrapper-returned integer values. Minimum received is calculated from net output at 50 bps slippage.

## Data-quality warning

The current wrapper quote ABI returns output and gas units, but not a trustworthy pool mid-price, USD conversion, or pool liquidity. The audit therefore records these fields as unknown rather than claiming healthy execution economics.

## Evidence

- JSON: \`${path.relative(REPO_ROOT, jsonPath)}\`
- CSV: \`${path.relative(REPO_ROOT, csvPath)}\`
- Source commission audit: \`${path.relative(REPO_ROOT, sourcePath)}\`
`;
fs.writeFileSync(docPath, markdown);

console.log(`ROUTE_QUALITY_DIRECTIONS=${report.routes.directional}`);
console.log(`ROUTE_QUALITY_OBSERVATIONS=${report.routes.observations}`);
console.log(`ROUTE_QUALITY_BROADCASTS=0`);
console.log(`ROUTE_QUALITY_STATUS=${JSON.stringify(statusCounts)}`);
console.log(`JSON=${jsonPath}`);
console.log(`CSV=${csvPath}`);
console.log(`DOCS=${docPath}`);

if (
  rows.some(
    (row) => row.quoteStatus === 'FAIL' || row.qualityStatus === 'BLOCKED',
  )
) {
  process.exitCode = 2;
}
