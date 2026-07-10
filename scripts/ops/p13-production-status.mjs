#!/usr/bin/env node
/**
 * P13.4 — Production health status snapshot (read-only).
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const ROLLBACK_FLOOR = '75b2ce7';
const CERTIFIED_COMMIT = 'eee0264';
const SMOKE_MAX_AGE_MS = 6 * 3600e3 + 30 * 60e3; // 6h + 30m grace

function parseArgs(argv) {
  const opts = {
    json: path.join(REPO_ROOT, 'reports/p13/status/p13-production-status.json'),
    markdown: path.join(REPO_ROOT, 'reports/p13/status/p13-production-status.md'),
    html: path.join(REPO_ROOT, 'reports/p13/status/p13-production-status.html'),
    check: false,
    baseUrl: process.env.SWAPEREX_QA_URL || 'https://dex.kobbex.com',
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = argv[++i];
    else if (a === '--markdown') opts.markdown = argv[++i];
    else if (a === '--html') opts.html = argv[++i];
    else if (a === '--check') opts.check = true;
    else if (a === '--base-url') opts.baseUrl = argv[++i];
  }
  return opts;
}

function readJsonSafe(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return null;
  }
}

function timerState() {
  const units = ['swaperex-route-quote-smoke.timer', 'swaperex-route-quote-smoke.service'];
  const out = {};
  for (const u of units) {
    const r = spawnSync('systemctl', ['is-active', u], { encoding: 'utf8' });
    out[u] = (r.stdout || r.stderr || '').trim();
  }
  const list = spawnSync('systemctl', ['list-timers', 'swaperex-route-quote-smoke.timer', '--no-pager'], {
    encoding: 'utf8',
  });
  out.listTimers = (list.stdout || '').trim();
  return out;
}

async function fetchVersion(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/version.txt`, { signal: AbortSignal.timeout(10_000) });
    return (await res.text()).trim();
  } catch {
    return null;
  }
}

function determineStatus({ smokeFresh, smokePass, trends, warnings, fatalChecks }) {
  if (!smokeFresh) return { status: 'STALE', action: 'Run or inspect scheduled smoke timer' };
  if (fatalChecks?.p11ConnectingView === false || fatalChecks?.blankScreen === false) {
    return { status: 'INCIDENT', action: 'Follow incident runbook; preserve evidence' };
  }
  if (!smokePass) return { status: 'INCIDENT', action: 'Review latest route-smoke JSON and journal' };
  if ((warnings?.fatalCount || 0) > 0) return { status: 'INCIDENT', action: 'Review runtime warning trends' };
  if ((trends?.windows?.['7d']?.maxConsecutiveFailures || 0) >= 1) {
    return { status: 'DEGRADED', action: 'Monitor quote trend; verify transient vs regression' };
  }
  if (!smokeFresh && smokePass) return { status: 'STALE', action: 'Refresh monitoring evidence' };
  return { status: 'HEALTHY', action: 'No operator action required' };
}

async function main() {
  const opts = parseArgs(process.argv);
  const latestEnvelope = readJsonSafe(path.join(REPO_ROOT, 'reports/p13/route-smoke/latest.json'));
  const latestSmoke = readJsonSafe(latestEnvelope?.outputPath || path.join(REPO_ROOT, 'reports/p13/route-smoke/latest.json'));
  const trends = readJsonSafe(path.join(REPO_ROOT, 'reports/p13/quote-trends/p13-quote-trends.json'));
  const warnings = readJsonSafe(path.join(REPO_ROOT, 'reports/p13/runtime-warnings/p13-runtime-warning-trends.json'));
  const versionTxt = await fetchVersion(opts.baseUrl);

  const smokeTs = latestEnvelope?.timestamp ? new Date(latestEnvelope.timestamp).getTime() : 0;
  const smokeFresh = smokeTs > 0 && Date.now() - smokeTs <= SMOKE_MAX_AGE_MS;
  const smokePass = latestEnvelope?.finalExitCode === 0;

  let timer = { note: 'systemctl unavailable or not installed' };
  try {
    timer = timerState();
  } catch {
    /* noop */
  }

  const fatalChecks = latestSmoke?.results
    ? {
        p11ConnectingView: !JSON.stringify(latestSmoke).includes('w3m-connecting-view: No connector provided'),
        blankScreen: !(latestSmoke.results || []).some((r) => r.id === 'homepage_swap_surface' && r.status === 'FAIL'),
      }
    : null;

  const { status, action } = determineStatus({ smokeFresh, smokePass, trends, warnings, fatalChecks });

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    overallStatus: latestEnvelope ? status : 'UNKNOWN',
    productionUrl: opts.baseUrl,
    productionCommit: versionTxt?.match(/short=(\w+)/)?.[1] || null,
    certifiedCommit: CERTIFIED_COMMIT,
    rollbackFloor: ROLLBACK_FLOOR,
    latestRouteSmoke: latestEnvelope,
    routeAvailability: trends?.windows?.['7d']?.availabilityPct ?? null,
    latencySummary: trends?.windows?.['7d']?.perRoute ?? null,
    runtimeFatalCount: warnings?.fatalCount ?? 0,
    runtimeWarningSummary: warnings?.fingerprints?.length ?? 0,
    timerState: timer,
    evidenceFreshness: {
      smokeAgeMs: smokeTs ? Date.now() - smokeTs : null,
      smokeFresh,
      maxAgeMs: SMOKE_MAX_AGE_MS,
    },
    openIncidents: status === 'INCIDENT' ? 1 : 0,
    recommendedOperatorAction: action,
  };

  fs.mkdirSync(path.dirname(opts.json), { recursive: true });
  fs.writeFileSync(opts.json, JSON.stringify(report, null, 2));

  const md = `# Swaperex Production Status

**Status:** ${report.overallStatus}
**Generated:** ${report.generatedAt}
**Production:** ${report.productionUrl}
**Commit:** ${report.productionCommit || 'unknown'} (certified ${CERTIFIED_COMMIT})
**Rollback floor:** ${ROLLBACK_FLOOR}

## Latest smoke
- Exit: ${latestEnvelope?.finalExitCode ?? 'n/a'}
- Classification: ${latestEnvelope?.finalClassification ?? 'n/a'}
- Fresh: ${smokeFresh}

## Recommended action
${action}
`;
  fs.writeFileSync(opts.markdown, md);

  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Swaperex Production Status</title><style>body{font-family:system-ui,sans-serif;margin:2rem;max-width:48rem} .ok{color:green}.bad{color:#b00}</style></head><body><h1>Swaperex Production Status</h1><p class="${report.overallStatus === 'HEALTHY' ? 'ok' : 'bad'}"><strong>${report.overallStatus}</strong></p><pre>${JSON.stringify(report, null, 2)}</pre></body></html>`;
  fs.writeFileSync(opts.html, html);

  const checkExit = { HEALTHY: 0, DEGRADED: 1, INCIDENT: 2, STALE: 3, UNKNOWN: 3 };
  console.log(JSON.stringify({ overallStatus: report.overallStatus, json: opts.json }, null, 2));
  if (opts.check) process.exit(checkExit[report.overallStatus] ?? 3);
}

main().catch((e) => {
  console.error(e);
  process.exit(3);
});
