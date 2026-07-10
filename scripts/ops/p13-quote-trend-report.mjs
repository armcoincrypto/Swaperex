#!/usr/bin/env node
/**
 * P13.2 — Quote latency and availability trend report (read-only, no network).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

function parseArgs(argv) {
  const opts = {
    reportsDir: path.join(REPO_ROOT, 'reports/p13/route-smoke'),
    legacyFile: path.join(REPO_ROOT, 'reports/p12-5-route-quote-smoke.json'),
    window: '7d',
    output: path.join(REPO_ROOT, 'reports/p13/quote-trends/p13-quote-trends.json'),
    markdown: null,
    check: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--reports-dir') opts.reportsDir = argv[++i];
    else if (a === '--window') opts.window = argv[++i];
    else if (a === '--output') opts.output = argv[++i];
    else if (a === '--markdown') opts.markdown = argv[++i];
    else if (a === '--check') opts.check = true;
  }
  return opts;
}

function windowMs(w) {
  const m = w.match(/^(\d+)(h|d)$/);
  if (!m) return 7 * 864e5;
  const n = Number(m[1]);
  return n * (m[2] === 'h' ? 3600e3 : 864e5);
}

function loadReports(dir, legacy, since) {
  const files = [];
  const skipped = [];
  if (fs.existsSync(legacy)) files.push(legacy);
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.json') && f !== 'latest.json') files.push(path.join(dir, f));
    }
  }
  const runs = [];
  for (const f of [...new Set(files)].sort()) {
    try {
      const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
      const ts = new Date(raw.timestamp || raw.p13Envelope?.timestamp || 0).getTime();
      if (!ts || ts < since) continue;
      runs.push({ file: f, raw, ts });
    } catch (e) {
      skipped.push({ file: f, error: e.message });
    }
  }
  return { runs, skipped };
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

function extractRouteMetrics(run) {
  const r = run.raw;
  const rows = [];
  for (const item of r.results || []) {
    if (item.layer === 'onchain' && item.id) {
      rows.push({
        routeId: item.id,
        success: item.status === 'PASS',
        quoteLatencyMs: item.latencyMs ?? null,
        provider: item.provider || null,
        chainId: item.chainId,
        from: item.direction?.split('→')[0],
        to: item.direction?.split('→')[1],
      });
    }
    if (item.layer === 'browser' && item.id?.startsWith('ui_quote_')) {
      rows.push({
        routeId: item.id,
        success: item.status === 'PASS',
        quoteLatencyMs: item.latencyMs ?? null,
        provider: 'browser-ui',
        from: item.from,
        to: item.to,
      });
    }
  }
  const homepage = (r.results || []).find((x) => x.id === 'homepage_swap_surface');
  return {
    timestamp: r.timestamp,
    productionVersion: r.productionVersion,
    verdict: r.verdict || r.p13Envelope?.finalVerdict,
    success: (r.verdict || '').includes('PASS') || r.p13Envelope?.finalExitCode === 0,
    homepageLatencyMs: homepage?.latencyMs ?? null,
    routes: rows,
  };
}

function aggregate(runs) {
  const routeStats = new Map();
  let consecutiveFailures = 0;
  let maxConsecutive = 0;
  for (const run of runs.sort((a, b) => a.ts - b.ts)) {
    const m = extractRouteMetrics(run);
    if (!m.success) {
      consecutiveFailures++;
      maxConsecutive = Math.max(maxConsecutive, consecutiveFailures);
    } else consecutiveFailures = 0;
    for (const row of m.routes) {
      if (!routeStats.has(row.routeId)) routeStats.set(row.routeId, { latencies: [], pass: 0, fail: 0 });
      const s = routeStats.get(row.routeId);
      if (row.success) {
        s.pass++;
        if (row.quoteLatencyMs != null) s.latencies.push(row.quoteLatencyMs);
      } else s.fail++;
    }
  }
  const perRoute = {};
  for (const [id, s] of routeStats) {
    const lat = [...s.latencies].sort((a, b) => a - b);
    const total = s.pass + s.fail;
    perRoute[id] = {
      total,
      pass: s.pass,
      fail: s.fail,
      availabilityPct: total ? (100 * s.pass) / total : null,
      medianLatencyMs: lat.length ? percentile(lat, 50) : null,
      p90LatencyMs: lat.length >= 5 ? percentile(lat, 90) : 'INSUFFICIENT_SAMPLE_SIZE',
      p95LatencyMs: lat.length >= 10 ? percentile(lat, 95) : 'INSUFFICIENT_SAMPLE_SIZE',
      maxLatencyMs: lat.length ? lat[lat.length - 1] : null,
    };
  }
  const totalRuns = runs.length;
  const successfulRuns = runs.filter((r) => extractRouteMetrics(r).success).length;
  return {
    totalRuns,
    successfulRuns,
    failedRuns: totalRuns - successfulRuns,
    availabilityPct: totalRuns ? (100 * successfulRuns) / totalRuns : null,
    maxConsecutiveFailures: maxConsecutive,
    perRoute,
  };
}

function main() {
  const opts = parseArgs(process.argv);
  const since = Date.now() - windowMs(opts.window);
  const { runs, skipped } = loadReports(opts.reportsDir, opts.legacyFile, since);
  const windows = {
    '24h': aggregate(runs.filter((r) => r.ts >= Date.now() - 864e5)),
    '7d': aggregate(runs.filter((r) => r.ts >= Date.now() - 7 * 864e5)),
    '30d': aggregate(runs.filter((r) => r.ts >= Date.now() - 30 * 864e5)),
  };

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    windowRequested: opts.window,
    skippedFiles: skipped,
    sampleCount: runs.length,
    windows,
    thresholds: {
      note: 'Provisional until sufficient baseline observations',
      warnQuoteLatency: 'exceeds recent P95 by material margin',
      warnSingleRequiredRouteFail: 'after retries',
      criticalConsecutiveRequiredRouteFail: 2,
    },
    verdict:
      runs.length === 0
        ? 'P13_2_QUOTE_TREND_REPORTING_READY_WITH_LIMITED_BASELINE'
        : 'P13_2_QUOTE_TREND_REPORTING_PASS',
    exitCode: 0,
  };

  if (windows['7d'].maxConsecutiveFailures >= 2) {
    report.verdict = 'P13_2_QUOTE_TREND_REPORTING_BLOCKED';
    report.exitCode = opts.check ? 1 : 0;
  }

  fs.mkdirSync(path.dirname(opts.output), { recursive: true });
  fs.writeFileSync(opts.output, JSON.stringify(report, null, 2));

  if (opts.markdown) {
    const md = [
      '# P13 Quote Trends',
      '',
      `Generated: ${report.generatedAt}`,
      '',
      `Sample runs: ${report.sampleCount}`,
      '',
      '## 7d summary',
      `- Availability: ${windows['7d'].availabilityPct?.toFixed(1) ?? 'n/a'}%`,
      `- Max consecutive failures: ${windows['7d'].maxConsecutiveFailures}`,
      '',
    ].join('\n');
    fs.writeFileSync(opts.markdown, md);
  }

  console.log(JSON.stringify({ verdict: report.verdict, sampleCount: report.sampleCount, output: opts.output }, null, 2));
  process.exit(report.exitCode);
}

main();
