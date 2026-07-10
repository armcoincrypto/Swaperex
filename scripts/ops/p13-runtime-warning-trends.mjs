#!/usr/bin/env node
/**
 * P13.3 — Runtime warning trend aggregation (read-only).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const BASELINE_PATH = path.join(REPO_ROOT, 'scripts/audit/config/p12-runtime-warning-baseline.json');

function parseArgs(argv) {
  const opts = {
    inputDir: path.join(REPO_ROOT, 'reports'),
    legacy: path.join(REPO_ROOT, 'reports/p12-4-runtime-warnings.json'),
    window: '7d',
    output: path.join(REPO_ROOT, 'reports/p13/runtime-warnings/p13-runtime-warning-trends.json'),
    check: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--window') opts.window = argv[++i];
    else if (a === '--output') opts.output = argv[++i];
    else if (a === '--check') opts.check = true;
    else if (a === '--input-dir') opts.inputDir = argv[++i];
  }
  return opts;
}

function windowMs(w) {
  const m = w.match(/^(\d+)(h|d)$/);
  if (!m) return 7 * 864e5;
  return Number(m[1]) * (m[2] === 'h' ? 3600e3 : 864e5);
}

function fp(text) {
  return createHash('sha256').update(text.replace(/\d+/g, 'N')).digest('hex').slice(0, 16);
}

function loadReports(inputDir, legacy, since) {
  const files = [];
  if (fs.existsSync(legacy)) files.push(legacy);
  const rawDir = path.join(REPO_ROOT, 'docs/audits/raw/p12_4_runtime_warnings');
  if (fs.existsSync(rawDir)) {
    for (const f of fs.readdirSync(rawDir)) if (f.endsWith('.json')) files.push(path.join(rawDir, f));
  }
  if (fs.existsSync(inputDir)) {
    for (const f of fs.readdirSync(inputDir)) {
      if (f.endsWith('.json') && (f.includes('runtime') || f.includes('warn'))) {
        files.push(path.join(inputDir, f));
      }
    }
  }
  const reports = [];
  const skipped = [];
  for (const f of files) {
    try {
      const raw = JSON.parse(fs.readFileSync(f, 'utf8'));
      const ts = new Date(raw.timestamp).getTime();
      if (ts < since) continue;
      reports.push({ file: f, raw, ts });
    } catch (e) {
      skipped.push({ file: f, error: e.message });
    }
  }
  return { reports, skipped };
}

function main() {
  const opts = parseArgs(process.argv);
  const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  const since = Date.now() - windowMs(opts.window);
  const { reports, skipped } = loadReports(opts.inputDir, opts.legacy, since);

  const fingerprints = new Map();
  for (const { raw, ts } of reports) {
    for (const w of raw.warningInventory || []) {
      const id = w.fingerprint || fp(w.messageSample || '');
      if (!fingerprints.has(id)) {
        fingerprints.set(id, {
          fingerprint: id,
          classification: w.classification,
          baselineId: w.baselineId,
          messageSample: w.messageSample,
          count: 0,
          firstSeen: raw.timestamp,
          lastSeen: raw.timestamp,
        });
      }
      const e = fingerprints.get(id);
      e.count += w.count || 1;
      e.lastSeen = raw.timestamp;
    }
  }

  const baselineIds = new Set(baseline.allowedFingerprints.map((x) => x.id));
  const newUnclassified = [...fingerprints.values()].filter(
    (f) => f.classification === 'UNKNOWN_REQUIRES_INVESTIGATION',
  );
  const fatal = [...fingerprints.values()].filter((f) =>
    ['APP_FATAL', 'APP_ERROR'].includes(f.classification),
  );

  let verdict = 'P13_3_RUNTIME_WARNING_TRENDS_PASS';
  let exitCode = 0;
  const expiredBaseline = (baseline.allowedFingerprints || []).filter(
    (b) => b.expirationDate && new Date(b.expirationDate) < new Date(),
  );
  if (fatal.length) {
    verdict = 'P13_3_RUNTIME_WARNING_TRENDS_BLOCKED';
    exitCode = opts.check ? 1 : 0;
  } else if (newUnclassified.length) {
    verdict = 'P13_3_RUNTIME_WARNING_TRENDS_BLOCKED';
    exitCode = opts.check ? 1 : 0;
  } else if (expiredBaseline.length && opts.check) {
    exitCode = 1;
  } else if ([...fingerprints.values()].some((f) => f.classification === 'COSMETIC_RESOURCE_HINT')) {
    verdict = 'P13_3_RUNTIME_WARNING_TRENDS_PASS_WITH_VENDOR_NOISE';
  }

  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    window: opts.window,
    sampleReports: reports.length,
    skippedFiles: skipped,
    fingerprints: [...fingerprints.values()],
    newUnclassified,
    fatalCount: fatal.length,
    baselineReviewDate: baseline.reviewDate,
    frequencyPolicy: { warnMultiplier: 3, minSampleForFrequencyAlert: 5 },
    verdict,
    exitCode,
  };

  fs.mkdirSync(path.dirname(opts.output), { recursive: true });
  fs.writeFileSync(opts.output, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ verdict, sampleReports: reports.length, output: opts.output }, null, 2));
  process.exit(exitCode);
}

main();
